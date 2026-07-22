import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { readMediaAssetVariant } from "@/src/modules/whatsapp/media-assets";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function safeFilename(value: string) {
  return value.replace(/[^\w.\- ]+/g, "_").trim() || "whatsapp-media";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ contentHash: string; variant: string }> },
) {
  const { contentHash, variant } = await context.params;
  const mediaVariant = variant === "thumbnail.webp" ? "thumbnail" : variant === "original" ? "original" : null;
  if (!mediaVariant) return json(404, { ok: false, error: "Media asset variant not found." });

  const business = await ensureDefaultBusiness();
  const media = await readMediaAssetVariant({
    businessId: business.id,
    contentHash: decodeURIComponent(contentHash),
    variant: mediaVariant,
  });
  if (!media) return json(404, { ok: false, error: "Media asset not found." });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  return new NextResponse(Buffer.from(media.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `${disposition}; filename="${safeFilename(media.filename)}"`,
      "Content-Type": media.contentType,
      "X-WhatsApp-Media-Asset": "HIT",
    },
  });
}
