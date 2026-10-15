import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";
import { voiceBackupFileName } from "../../../../../lib/voice-file-name";
import { assertAudioMediaType, batchAudioSource, boundedAudioBytes, cachedBatchMp3, maxAudioSourceBytes } from "../../../../../lib/batch-audio";
import type { Order } from "../../../../../lib/types";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const url = new URL(request.url), batchId = url.searchParams.get("id"), orderId = url.searchParams.get("orderId");
    if (!batchId || !orderId) return NextResponse.json({ error: "Choose a batch order." }, { status: 400 });
    const db = mobileServiceClient();
    const { data, error } = await db.from("fulfilment_batch_orders").select("fulfilment_orders!inner(data)").eq("batch_id", batchId).eq("order_id", orderId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Order is not in this batch." }, { status: 404 });
    const order = (data.fulfilment_orders as unknown as { data: Order }).data;
    const source = batchAudioSource(order);
    if (!source) throw new Error("No message file is attached to this order. Attach an audio or video file and retry.");
    let bytes: Buffer | null = null, type = "";
    const inline = source.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
    if (inline) {
      type = inline[1].toLowerCase(); assertAudioMediaType(type);
      if (inline[2].length > Math.ceil(maxAudioSourceBytes / 3) * 4) throw new Error("The message file exceeds 50 MB. Attach a smaller file.");
      bytes = Buffer.from(inline[2], "base64");
    }
    else if (source.startsWith("supabase-storage:")) {
      const path = source.slice("supabase-storage:".length);
      if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) throw new Error("Invalid audio path.");
      const result = await db.storage.from("customisation-audio").download(path);
      if (result.error || !result.data) throw new Error("Audio file could not be downloaded.");
      type = result.data.type || "application/octet-stream"; assertAudioMediaType(type);
      bytes = await boundedAudioBytes(result.data.stream());
    } else if (source) {
      const upstream = new URL(source, url.origin);
      const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co").origin;
      const local = upstream.origin === url.origin && (/^\/api\/customisation\/audio-download$/.test(upstream.pathname) || /^\/media-assets\/[a-f0-9]{64}\/original$/.test(upstream.pathname));
      const storage = upstream.origin === storageOrigin && /^\/storage\/v1\/object\/(public|sign)\/customisation-audio\//.test(upstream.pathname);
      if (!local && !storage) throw new Error("Attach an audio file to this order before downloading the batch.");
      const response = await fetch(upstream, { redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.body) throw new Error("Audio file could not be downloaded.");
      type = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase(); assertAudioMediaType(type);
      if (Number(response.headers.get("content-length")) > maxAudioSourceBytes) throw new Error("The message file exceeds 50 MB. Attach a smaller file.");
      bytes = await boundedAudioBytes(response.body);
    }
    if (!bytes?.length) throw new Error("This order is missing a playable audio or video file.");
    const mp3 = await cachedBatchMp3(db, bytes);
    const name = voiceBackupFileName({ ...order, character: order.character ?? "" }, "mp3");
    return new Response(new Uint8Array(mp3), { headers: { "Content-Type": "audio/mpeg", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : "Audio download failed."; return NextResponse.json({ error: message }, { status: message === "WAREHOUSE_ACCESS_REQUIRED" ? 403 : message === "SIGN_IN_REQUIRED" ? 401 : 400 }); }
}
