import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../../../lib/mobile-api";
import type { Order } from "../../../../../../lib/types";

type AssetKind = "voice" | "photo" | "attachment" | "shipping_label";

function dataUrl(value: string) {
  const match = /^data:([^;,]+)?;base64,([\s\S]+)$/.exec(value);
  if (!match) return null;
  return { contentType: match[1] || "application/octet-stream", bytes: Buffer.from(match[2], "base64") };
}

function contentType(url: string, fallback: string) {
  if (/\.pdf(?:$|[?#])/i.test(url)) return "application/pdf";
  if (/\.(?:jpe?g)(?:$|[?#])/i.test(url)) return "image/jpeg";
  if (/\.png(?:$|[?#])/i.test(url)) return "image/png";
  if (/\.webp(?:$|[?#])/i.test(url)) return "image/webp";
  return fallback;
}

function trustedExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    const private172 = /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    return private172 ? null : url;
  } catch { return null; }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireMobileSession(request);
    const { id } = await context.params;
    const kind = new URL(request.url).searchParams.get("kind") as AssetKind;
    if (!id || !["voice", "photo", "attachment", "shipping_label"].includes(kind)) return NextResponse.json({ error: "Invalid media request." }, { status: 400 });
    const { data, error } = await mobileServiceClient().from("fulfilment_orders").select("data").eq("id", id).maybeSingle();
    if (error) throw error;
    const order = data?.data as Order | undefined;
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const reference = kind === "voice" ? order.meaningfulMessage : kind === "photo" ? order.photoDataUrl : kind === "attachment" ? order.tikTokFileDataUrl : order.shippingLabelUrl;
    if (!reference) return NextResponse.json({ error: "Media is not available." }, { status: 404 });
    const embedded = dataUrl(reference);
    if (embedded) return new NextResponse(embedded.bytes, { headers: { "content-type": embedded.contentType, "cache-control": "private, max-age=3600" } });

    if (kind === "voice" && reference.startsWith("supabase-storage:")) {
      const path = reference.slice("supabase-storage:".length);
      const { data: audio, error: downloadError } = await mobileServiceClient().storage.from("customisation-audio").download(path);
      if (downloadError || !audio) throw downloadError || new Error("Voice message is unavailable.");
      return new NextResponse(Buffer.from(await audio.arrayBuffer()), { headers: { "content-type": audio.type || "audio/webm", "cache-control": "private, max-age=3600" } });
    }
    const url = trustedExternalUrl(reference);
    if (!url) return NextResponse.json({ error: "Media is unavailable." }, { status: 404 });
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return NextResponse.json({ error: "Media could not be downloaded." }, { status: 502 });
    const size = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(size) && size > 75 * 1024 * 1024) return NextResponse.json({ error: "Media file is too large for the offline archive." }, { status: 413 });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 75 * 1024 * 1024) return NextResponse.json({ error: "Media file is too large for the offline archive." }, { status: 413 });
    return new NextResponse(bytes, { headers: { "content-type": response.headers.get("content-type") || contentType(reference, "application/octet-stream"), "cache-control": "private, max-age=3600" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MEDIA_DOWNLOAD_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}
