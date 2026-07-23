import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { ensureCrmWritePolicies, isRlsPolicyError } from "@/src/modules/crm/write-policies";
import {
  createOrReuseMediaAssetFromBytes,
  mediaAssetPublicUrls,
  mediaTypeFromContentType,
  normalizeMediaContentType,
} from "@/src/modules/whatsapp/media-assets";
import { WHATSAPP_MEDIA_CACHE_MAX_BYTES } from "@/src/modules/whatsapp/media-cache";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = WHATSAPP_MEDIA_CACHE_MAX_BYTES;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    await ensureCrmWritePolicies();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return json(400, { ok: false, error: "Choose an image or video file to upload." });
    }

    const contentType = normalizeMediaContentType(file.type);
    const mediaType = mediaTypeFromContentType(contentType);
    if (mediaType !== "image" && mediaType !== "video") {
      return json(400, { ok: false, error: "Only image and video files can be used in flows." });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return json(400, { ok: false, error: `Media files must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.` });
    }

    const business = await ensureDefaultBusiness();
    const asset = await createOrReuseMediaAssetFromBytes({
      businessId: business.id,
      bytes: await file.arrayBuffer(),
      contentType,
    });

    if (!asset) {
      return json(503, { ok: false, error: "CRM media storage is not available yet." });
    }

    const urls = mediaAssetPublicUrls(asset.contentHash);
    const origin = new URL(request.url).origin;

    return json(201, {
      ok: true,
      asset: {
        id: asset.id,
        fileName: file.name,
        contentType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        mediaType: asset.mediaType,
        originalUrl: `${origin}${urls.originalUrl}`,
        thumbnailUrl: asset.thumbnailStoragePath || asset.posterStoragePath ? `${origin}${urls.thumbnailUrl}` : "",
        downloadUrl: `${origin}${urls.downloadUrl}`,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: isRlsPolicyError(error)
        ? "Media could not be uploaded because Supabase is blocking CRM media writes. Run the latest schema setup or check the crm_media_assets RLS policies."
        : error instanceof Error ? error.message : "Media could not be uploaded.",
    });
  }
}
