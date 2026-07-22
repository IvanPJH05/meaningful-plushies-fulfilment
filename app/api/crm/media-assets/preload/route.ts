import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  isMediaAssetDatabaseUnavailable,
  mediaAssetPublicUrls,
} from "@/src/modules/whatsapp/media-assets";

export const runtime = "nodejs";

export async function GET() {
  const business = await ensureDefaultBusiness();
  let assets = [];
  try {
    assets = await prisma.mediaAsset.findMany({
      where: {
        businessId: business.id,
        mediaType: { in: ["image", "video"] },
      },
      orderBy: [
        { usageCount: "desc" },
        { lastUsedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        contentHash: true,
        mimeType: true,
        mediaType: true,
        thumbnailStoragePath: true,
        posterStoragePath: true,
        width: true,
        height: true,
        thumbnailWidth: true,
        thumbnailHeight: true,
        sizeBytes: true,
        usageCount: true,
        lastUsedAt: true,
      },
      take: 50,
    });
  } catch (error) {
    if (!isMediaAssetDatabaseUnavailable(error)) throw error;

    console.warn("WhatsApp media asset preload skipped because crm_media_assets is not accessible.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      ok: false,
      assets: [],
      error: "Shared WhatsApp media cache is not ready yet.",
    }, {
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    assets: assets.map((asset) => {
      const urls = mediaAssetPublicUrls(asset.contentHash);
      return {
        id: asset.id,
        contentHash: asset.contentHash,
        mimeType: asset.mimeType,
        mediaType: asset.mediaType,
        thumbnailUrl: asset.thumbnailStoragePath || asset.posterStoragePath ? urls.thumbnailUrl : null,
        originalUrl: urls.originalUrl,
        downloadUrl: urls.downloadUrl,
        width: asset.width,
        height: asset.height,
        thumbnailWidth: asset.thumbnailWidth,
        thumbnailHeight: asset.thumbnailHeight,
        sizeBytes: asset.sizeBytes,
        usageCount: asset.usageCount,
        lastUsedAt: asset.lastUsedAt?.toISOString() || null,
      };
    }),
  }, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}
