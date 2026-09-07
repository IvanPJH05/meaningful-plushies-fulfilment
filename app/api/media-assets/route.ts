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

const GENERIC_UPLOAD_CONTENT_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export async function POST(request: Request) {
  try {
    await ensureCrmWritePolicies();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image, video, or PDF file to upload." }, { status: 400 });

    const uploadedContentType = normalizeMediaContentType(file.type);
    const contentType = file.name.toLowerCase().endsWith(".pdf") && GENERIC_UPLOAD_CONTENT_TYPES.has(uploadedContentType) ? "application/pdf" : uploadedContentType;
    const mediaType = mediaTypeFromContentType(contentType);
    if (!["image", "video", "pdf"].includes(mediaType)) return NextResponse.json({ ok: false, error: "Only image, video, and PDF files can be uploaded." }, { status: 400 });
    if (file.size > WHATSAPP_MEDIA_CACHE_MAX_BYTES) return NextResponse.json({ ok: false, error: `Media files must be ${Math.floor(WHATSAPP_MEDIA_CACHE_MAX_BYTES / 1024 / 1024)} MB or smaller.` }, { status: 400 });

    const business = await ensureDefaultBusiness();
    const asset = await createOrReuseMediaAssetFromBytes({ businessId: business.id, bytes: await file.arrayBuffer(), contentType });
    if (!asset) return NextResponse.json({ ok: false, error: "Shared media storage is not available yet." }, { status: 503 });

    const urls = mediaAssetPublicUrls(asset.contentHash);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ ok: true, asset: {
      id: asset.id, fileName: file.name, contentType: asset.mimeType, sizeBytes: asset.sizeBytes, mediaType: asset.mediaType,
      originalUrl: `${origin}${urls.originalUrl}`,
      thumbnailUrl: asset.thumbnailStoragePath || asset.posterStoragePath ? `${origin}${urls.thumbnailUrl}` : "",
      downloadUrl: `${origin}${urls.downloadUrl}`,
    } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: isRlsPolicyError(error) ? "Media storage is not available yet." : error instanceof Error ? error.message : "Media could not be uploaded." }, { status: 500 });
  }
}
