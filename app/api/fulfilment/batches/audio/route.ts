import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";
import { mediaFileExtension, voiceBackupFileName } from "@/lib/voice-file-name";
import type { Order } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const url = new URL(request.url), batchId = url.searchParams.get("id"), orderId = url.searchParams.get("orderId");
    if (!batchId || !orderId) return NextResponse.json({ error: "Choose a batch order." }, { status: 400 });
    const db = mobileServiceClient();
    const { data, error } = await db.from("fulfilment_batch_orders").select("fulfilment_orders!inner(data)").eq("batch_id", batchId).eq("order_id", orderId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Order is not in this batch." }, { status: 404 });
    const order = (data.fulfilment_orders as unknown as { data: Order }).data;
    const source = order.salesChannel === "tiktok" ? order.tikTokFileDataUrl ?? "" : order.meaningfulMessage ?? "";
    let body: Blob | Buffer | ReadableStream<Uint8Array> | null = null, type = "", extension = "audio";
    const inline = source.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if (inline) { type = inline[1]; body = Buffer.from(inline[2], "base64"); extension = mediaFileExtension(order.tikTokFileName, type); }
    else if (source.startsWith("supabase-storage:")) {
      const path = source.slice("supabase-storage:".length);
      if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) throw new Error("Invalid audio path.");
      const result = await db.storage.from("customisation-audio").download(path);
      if (result.error || !result.data) throw new Error("Audio file could not be downloaded.");
      body = result.data; type = body.type || "application/octet-stream"; extension = mediaFileExtension(path, type);
    } else if (source) {
      const upstream = new URL(source, url.origin);
      const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co").origin;
      const local = upstream.origin === url.origin && (/^\/api\/customisation\/audio-download$/.test(upstream.pathname) || /^\/media-assets\/[a-f0-9]{64}\/original$/.test(upstream.pathname));
      const storage = upstream.origin === storageOrigin && /^\/storage\/v1\/object\/(public|sign)\/customisation-audio\//.test(upstream.pathname);
      if (!local && !storage) throw new Error("Attach an audio file to this order before downloading the batch.");
      const response = await fetch(upstream, { redirect: "error", signal: AbortSignal.timeout(45000) });
      if (!response.ok || !response.body) throw new Error("Audio file could not be downloaded.");
      type = (response.headers.get("content-type") ?? "").split(";")[0]; body = response.body; extension = mediaFileExtension(upstream.pathname, type);
    }
    if (!body || (!type.startsWith("audio/") && type !== "application/octet-stream")) throw new Error("This order is missing an audio file, or its attachment is not audio.");
    const name = voiceBackupFileName({ ...order, character: order.character ?? "" }, extension);
    return new Response(body as BodyInit, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : "Audio download failed."; return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 400 }); }
}
