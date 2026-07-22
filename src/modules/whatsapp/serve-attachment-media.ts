import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  readCachedWhatsAppMedia,
  readStoredWhatsAppMedia,
} from "@/src/modules/whatsapp/media-cache";
import { mediaAssetPublicUrls } from "@/src/modules/whatsapp/media-assets";
import {
  enqueueWhatsAppMediaJobForAttachment,
  processDueWhatsAppMediaJobs,
} from "@/src/modules/whatsapp/media-jobs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function mediaIdFromStorageKey(storageKey: string | null | undefined) {
  return storageKey?.startsWith("whatsapp-media:") ? storageKey.slice("whatsapp-media:".length) : "";
}

function safeFilename(value: string | null | undefined, fallback: string) {
  const cleaned = (value || fallback).replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || fallback;
}

function buildMediaResponse(args: {
  bytes: ArrayBuffer;
  contentType: string;
  disposition: string;
  filename: string;
  cacheStatus: "HIT" | "MISS" | "BYPASS";
}) {
  return new NextResponse(Buffer.from(args.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `${args.disposition}; filename="${args.filename}"`,
      "Content-Type": args.contentType,
      "X-WhatsApp-Media-Cache": args.cacheStatus,
    },
  });
}

function redirectToMediaAsset(args: {
  request: Request;
  contentHash: string;
  variant: "thumbnail" | "original";
  download: boolean;
}) {
  const urls = mediaAssetPublicUrls(args.contentHash);
  const target = args.variant === "thumbnail"
    ? urls.thumbnailUrl
    : args.download
      ? urls.downloadUrl
      : urls.originalUrl;
  return NextResponse.redirect(new URL(target, args.request.url), 307);
}

export async function serveWhatsAppAttachmentMedia(
  request: Request,
  attachmentId: string,
  variant: "thumbnail" | "original",
) {
  const business = await ensureDefaultBusiness();
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      mediaAsset: true,
      message: {
        select: {
          businessId: true,
        },
      },
    },
  });

  if (!attachment || attachment.message.businessId !== business.id) {
    return json(404, { ok: false, error: "Attachment not found." });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const fallbackContentType = attachment.mediaMimeType || attachment.contentType || "application/octet-stream";
  const fallbackFilename = safeFilename(
    attachment.originalName,
    `${attachment.id}.${fallbackContentType.split("/")[1] || "bin"}`,
  );

  if (attachment.mediaAsset) {
    return redirectToMediaAsset({
      request,
      contentHash: attachment.mediaAsset.contentHash,
      variant,
      download,
    });
  }

  const storagePath = variant === "thumbnail"
    ? (attachment.thumbnailStoragePath || attachment.originalStoragePath)
    : attachment.originalStoragePath;

  if (storagePath) {
    const bytes = await readStoredWhatsAppMedia(storagePath);
    if (bytes) {
      return buildMediaResponse({
        bytes,
        contentType: variant === "thumbnail" && attachment.thumbnailStoragePath ? "image/webp" : fallbackContentType,
        disposition,
        filename: fallbackFilename,
        cacheStatus: "HIT",
      });
    }
  }

  await enqueueWhatsAppMediaJobForAttachment(attachment.id);
  await processDueWhatsAppMediaJobs({ limit: 1 });

  const refreshed = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      mediaAsset: true,
      message: {
        select: {
          businessId: true,
        },
      },
    },
  });
  if (refreshed?.mediaAsset) {
    return redirectToMediaAsset({
      request,
      contentHash: refreshed.mediaAsset.contentHash,
      variant,
      download,
    });
  }

  const refreshedPath = variant === "thumbnail"
    ? (refreshed?.thumbnailStoragePath || refreshed?.originalStoragePath)
    : refreshed?.originalStoragePath;
  if (refreshedPath) {
    const bytes = await readStoredWhatsAppMedia(refreshedPath);
    if (bytes) {
      return buildMediaResponse({
        bytes,
        contentType: variant === "thumbnail" && refreshed?.thumbnailStoragePath ? "image/webp" : (refreshed?.mediaMimeType || fallbackContentType),
        disposition,
        filename: fallbackFilename,
        cacheStatus: "MISS",
      });
    }
  }

  const mediaId = mediaIdFromStorageKey(attachment.storageKey) || attachment.externalMediaId || "";
  if (mediaId) {
    const cached = await readCachedWhatsAppMedia({
      businessId: attachment.message.businessId,
      mediaId,
    });
    if (cached) {
      return buildMediaResponse({
        bytes: cached,
        contentType: fallbackContentType,
        disposition,
        filename: fallbackFilename,
        cacheStatus: "BYPASS",
      });
    }
  }

  return json(202, {
    ok: false,
    status: refreshed?.processingStatus || attachment.processingStatus || "pending",
    error: refreshed?.processingError || null,
  });
}
