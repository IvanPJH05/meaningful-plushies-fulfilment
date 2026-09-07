import { NextResponse } from "next/server";

import { fetchSharedOrderById } from "../../../../lib/supabase";
import { mediaFileExtension, voiceBackupFileName } from "../../../../lib/voice-file-name";

export const runtime = "nodejs";

function dataUrlFile(value: string) {
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const encoded = match[2] || "";
  const isBase64 = /;base64,/i.test(value.slice(0, value.indexOf(",") + 1));
  return {
    contentType,
    body: isBase64 ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded)),
  };
}

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("orderId") || "";
  if (!orderId) return NextResponse.json({ ok: false, error: "TikTok order is required." }, { status: 400 });

  try {
    const order = await fetchSharedOrderById(orderId);
    if (!order || order.salesChannel !== "tiktok") return NextResponse.json({ ok: false, error: "TikTok order not found." }, { status: 404 });
    const media = dataUrlFile(order.tikTokFileDataUrl || "");
    if (!media) return NextResponse.json({ ok: false, error: "No message file was saved for this order. Please attach it again." }, { status: 404 });

    const filename = voiceBackupFileName(order, mediaFileExtension(order.tikTokFileName, order.tikTokFileType, order.tikTokFileDataUrl));
    return new NextResponse(media.body, {
      headers: {
        "Content-Type": order.tikTokFileType || media.contentType,
        "Content-Disposition": `attachment; filename="${filename.replace(/[\\\"]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load the TikTok message file." }, { status: 500 });
  }
}
