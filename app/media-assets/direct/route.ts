import { NextResponse } from "next/server";

import { readStoredWhatsAppMedia } from "@/src/modules/whatsapp/media-cache";
import { normalizeMediaContentType } from "@/src/modules/whatsapp/media-assets";

export const runtime = "nodejs";

function safeFilename(value: string) {
  return value.replace(/[^\w.\- ]+/g, "_").trim() || "whatsapp-media";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const filename = safeFilename(url.searchParams.get("filename") || "whatsapp-media");
  const contentType = normalizeMediaContentType(url.searchParams.get("contentType"));

  if (!path || path.includes("..")) {
    return NextResponse.json({ ok: false, error: "Media file path is required." }, { status: 400 });
  }

  const bytes = await readStoredWhatsAppMedia(path);
  if (!bytes) {
    return NextResponse.json({ ok: false, error: "Media file could not be found." }, { status: 404 });
  }

  return new Response(bytes, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}
