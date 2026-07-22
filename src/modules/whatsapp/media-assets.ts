import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import sharp from "sharp";

import { prisma } from "@/src/infrastructure/database/prisma";
import {
  readStoredWhatsAppMedia,
  safeStoragePathSegment,
  writeStoredWhatsAppMedia,
} from "@/src/modules/whatsapp/media-cache";

export function normalizeMediaContentType(value?: string | null) {
  return (value || "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
}

export function mediaTypeFromContentType(contentType: string) {
  const normalized = normalizeMediaContentType(contentType);
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized === "application/pdf") return "pdf";
  return "file";
}

export function extensionFromContentType(contentType: string) {
  const normalized = normalizeMediaContentType(contentType);
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/mp4") return "m4a";
  if (normalized === "application/pdf") return "pdf";
  return normalized.split("/")[1]?.replace(/[^\w.-]+/g, "") || "bin";
}

export function mediaAssetPublicUrls(contentHash: string) {
  const safeHash = encodeURIComponent(contentHash);
  return {
    thumbnailUrl: `/media-assets/${safeHash}/thumbnail.webp`,
    originalUrl: `/media-assets/${safeHash}/original`,
    downloadUrl: `/media-assets/${safeHash}/original?download=1`,
  };
}

function assetBasePath(businessId: string, contentHash: string) {
  return [
    "media-assets",
    safeStoragePathSegment(businessId),
    safeStoragePathSegment(contentHash),
  ].join("/");
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function hashBytes(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function isMediaAssetDatabaseUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";

  return message.includes("crm_media_assets")
    && (
      message.includes("permission denied")
      || message.includes("does not exist")
      || message.includes("doesn't exist")
      || message.includes("relation")
      || message.includes("not found")
      || code === "P1010"
      || code === "P2021"
      || code === "P2022"
    );
}

export async function createOrReuseMediaAssetFromBytes(args: {
  businessId: string;
  bytes: ArrayBuffer | Buffer;
  contentType?: string | null;
}) {
  const originalBuffer = Buffer.isBuffer(args.bytes) ? args.bytes : Buffer.from(args.bytes);
  const contentHash = hashBytes(originalBuffer);
  const contentType = normalizeMediaContentType(args.contentType);
  const mediaType = mediaTypeFromContentType(contentType);
  const now = new Date();

  let existing = null;
  try {
    existing = await prisma.mediaAsset.findUnique({
      where: {
        businessId_contentHash: {
          businessId: args.businessId,
          contentHash,
        },
      },
    });
  } catch (error) {
    if (isMediaAssetDatabaseUnavailable(error)) {
      console.warn("Shared WhatsApp media asset table is not accessible; falling back to per-attachment media.", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    throw error;
  }

  if (existing) {
    try {
      return await prisma.mediaAsset.update({
        where: { id: existing.id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: now,
        },
      });
    } catch (error) {
      if (isMediaAssetDatabaseUnavailable(error)) return null;
      throw error;
    }
  }

  const basePath = assetBasePath(args.businessId, contentHash);
  const originalPath = `${basePath}/original.${extensionFromContentType(contentType)}`;
  const originalSaved = await writeStoredWhatsAppMedia({
    path: originalPath,
    bytes: bufferToArrayBuffer(originalBuffer),
    contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (!originalSaved) throw new Error("Shared WhatsApp media original could not be saved.");

  let thumbnailPath: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let thumbnailWidth: number | null = null;
  let thumbnailHeight: number | null = null;

  if (mediaType === "image") {
    const image = sharp(originalBuffer, { animated: false }).rotate();
    const metadata = await image.metadata();
    width = metadata.width || null;
    height = metadata.height || null;

    const thumbnail = await sharp(originalBuffer, { animated: false })
      .rotate()
      .resize({
        width: 420,
        height: 420,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });

    const savedPath = `${basePath}/thumbnail.webp`;
    const thumbnailSaved = await writeStoredWhatsAppMedia({
      path: savedPath,
      bytes: bufferToArrayBuffer(thumbnail.data),
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (thumbnailSaved) {
      thumbnailPath = savedPath;
      thumbnailWidth = thumbnail.info.width || null;
      thumbnailHeight = thumbnail.info.height || null;
    }
  }

  try {
    return await prisma.mediaAsset.create({
      data: {
        businessId: args.businessId,
        contentHash,
        mimeType: contentType,
        mediaType,
        originalStoragePath: originalPath,
        thumbnailStoragePath: thumbnailPath,
        width,
        height,
        thumbnailWidth,
        thumbnailHeight,
        sizeBytes: originalBuffer.byteLength,
        usageCount: 1,
        lastUsedAt: now,
      },
    });
  } catch (error) {
    if (isMediaAssetDatabaseUnavailable(error)) return null;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      try {
        return await prisma.mediaAsset.update({
          where: {
            businessId_contentHash: {
              businessId: args.businessId,
              contentHash,
            },
          },
          data: {
            usageCount: { increment: 1 },
            lastUsedAt: now,
          },
        });
      } catch (updateError) {
        if (isMediaAssetDatabaseUnavailable(updateError)) return null;
        throw updateError;
      }
    }
    throw error;
  }
}

export async function readMediaAssetVariant(args: {
  businessId: string;
  contentHash: string;
  variant: "thumbnail" | "original";
}) {
  let asset = null;
  try {
    asset = await prisma.mediaAsset.findUnique({
      where: {
        businessId_contentHash: {
          businessId: args.businessId,
          contentHash: args.contentHash,
        },
      },
    });
  } catch (error) {
    if (isMediaAssetDatabaseUnavailable(error)) return null;
    throw error;
  }

  if (!asset) return null;

  const storagePath = args.variant === "thumbnail"
    ? (asset.thumbnailStoragePath || asset.posterStoragePath || asset.originalStoragePath)
    : asset.originalStoragePath;
  const bytes = await readStoredWhatsAppMedia(storagePath);
  if (!bytes) return null;

  const contentType = args.variant === "thumbnail" && (asset.thumbnailStoragePath || asset.posterStoragePath)
    ? "image/webp"
    : asset.mimeType;
  const filename = args.variant === "thumbnail"
    ? `${asset.contentHash}.webp`
    : `${asset.contentHash}.${extensionFromContentType(asset.mimeType)}`;

  return {
    bytes,
    contentType,
    filename,
    asset,
  };
}
