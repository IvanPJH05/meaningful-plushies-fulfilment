import { prisma } from "@/src/infrastructure/database/prisma";
import {
  broadcastWhatsAppCrmChange,
  whatsappMediaCachePath,
  writeCachedWhatsAppMedia,
} from "@/src/modules/whatsapp/media-cache";
import { createOrReuseMediaAssetFromBytes } from "@/src/modules/whatsapp/media-assets";
import { fallbackWhatsAppMediaContentType } from "@/src/modules/whatsapp/media-metadata";

const JOB_STATUS_PENDING = "pending";
const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_COMPLETED = "completed";
const JOB_STATUS_FAILED = "failed";

const ATTACHMENT_STATUS_PENDING = "pending";
const ATTACHMENT_STATUS_READY = "ready";
const ATTACHMENT_STATUS_FAILED = "failed";

const MAX_ATTEMPTS = Number(process.env.WHATSAPP_MEDIA_JOB_MAX_ATTEMPTS ?? 5);
const MAX_BYTES = Number(process.env.WHATSAPP_MEDIA_CACHE_MAX_BYTES ?? 15 * 1024 * 1024);
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 3600];

type GraphMediaMetadata = {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
};

function whatsappAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN
    || process.env.META_WHATSAPP_ACCESS_TOKEN
    || process.env.WHATSAPP_PERMANENT_TOKEN
    || "";
}

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
}

function mediaIdFromStorageKey(storageKey: string | null | undefined) {
  return storageKey?.startsWith("whatsapp-media:") ? storageKey.slice("whatsapp-media:".length) : "";
}

function isAllowedContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  if (!normalized || normalized === "text/html" || normalized === "image/svg+xml") return false;
  return normalized.startsWith("image/")
    || normalized.startsWith("video/")
    || normalized.startsWith("audio/")
    || normalized === "application/pdf"
    || normalized === "application/octet-stream";
}

async function fetchMetaMediaMetadata(mediaId: string) {
  const accessToken = whatsappAccessToken();
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");

  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metadata = await response.json().catch(() => ({})) as GraphMediaMetadata & { error?: { message?: string } };
  if (!response.ok || !metadata.url) {
    throw new Error(metadata.error?.message || "WhatsApp media URL could not be retrieved.");
  }
  return metadata;
}

async function fetchMetaMediaBytes(url: string) {
  const accessToken = whatsappAccessToken();
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`WhatsApp media could not be downloaded (${response.status}).`);
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "",
  };
}

function retryDate(attempts: number) {
  const delaySeconds = RETRY_DELAYS_SECONDS[Math.min(attempts - 1, RETRY_DELAYS_SECONDS.length - 1)] || 3600;
  return new Date(Date.now() + delaySeconds * 1000);
}

export async function enqueueWhatsAppMediaJobsForMessages(messageIds: string[]) {
  const uniqueMessageIds = Array.from(new Set(messageIds.filter(Boolean)));
  if (!uniqueMessageIds.length) return 0;

  const attachments = await prisma.messageAttachment.findMany({
    where: {
      messageId: { in: uniqueMessageIds },
      OR: [
        { externalMediaId: { not: null } },
        { storageKey: { startsWith: "whatsapp-media:" } },
      ],
    },
    select: {
      id: true,
      storageKey: true,
      externalMediaId: true,
      originalStoragePath: true,
      mediaAssetId: true,
      processingStatus: true,
    },
  });

  let queued = 0;
  for (const attachment of attachments) {
    const mediaId = attachment.externalMediaId || mediaIdFromStorageKey(attachment.storageKey);
    if (!mediaId || attachment.mediaAssetId || attachment.originalStoragePath) continue;

    await prisma.messageAttachment.update({
      where: { id: attachment.id },
      data: {
        externalMediaId: mediaId,
        processingStatus: ATTACHMENT_STATUS_PENDING,
      },
    });
    await prisma.whatsAppMediaJob.upsert({
      where: { attachmentId: attachment.id },
      update: {
        externalMediaId: mediaId,
        status: JOB_STATUS_PENDING,
        nextAttemptAt: new Date(),
      },
      create: {
        attachmentId: attachment.id,
        externalMediaId: mediaId,
        status: JOB_STATUS_PENDING,
      },
    });
    queued += 1;
  }

  return queued;
}

export async function enqueueWhatsAppMediaJobForAttachment(attachmentId: string) {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      storageKey: true,
      externalMediaId: true,
      originalStoragePath: true,
      mediaAssetId: true,
      processingStatus: true,
    },
  });
  if (!attachment || attachment.mediaAssetId || attachment.originalStoragePath) return false;

  const mediaId = attachment.externalMediaId || mediaIdFromStorageKey(attachment.storageKey);
  if (!mediaId) return false;

  await prisma.messageAttachment.update({
    where: { id: attachment.id },
    data: {
      externalMediaId: mediaId,
      processingStatus: ATTACHMENT_STATUS_PENDING,
    },
  });
  await prisma.whatsAppMediaJob.upsert({
    where: { attachmentId: attachment.id },
    update: {
      externalMediaId: mediaId,
      status: JOB_STATUS_PENDING,
      nextAttemptAt: new Date(),
    },
    create: {
      attachmentId: attachment.id,
      externalMediaId: mediaId,
      status: JOB_STATUS_PENDING,
    },
  });

  return true;
}

async function markJobFailed(args: {
  jobId: string;
  attachmentId: string;
  attempts: number;
  error: string;
}) {
  const finalFailure = args.attempts >= MAX_ATTEMPTS;
  await prisma.whatsAppMediaJob.update({
    where: { id: args.jobId },
    data: {
      status: finalFailure ? JOB_STATUS_FAILED : JOB_STATUS_PENDING,
      lastError: args.error,
      nextAttemptAt: finalFailure ? new Date() : retryDate(args.attempts),
      lockedAt: null,
    },
  });
  await prisma.messageAttachment.update({
    where: { id: args.attachmentId },
    data: {
      processingStatus: finalFailure ? ATTACHMENT_STATUS_FAILED : ATTACHMENT_STATUS_PENDING,
      processingError: args.error,
    },
  });
}

export async function processWhatsAppMediaJob(jobId: string) {
  const job = await prisma.whatsAppMediaJob.findUnique({
    where: { id: jobId },
    include: {
      attachment: {
        include: {
          message: {
            select: {
              id: true,
              businessId: true,
              conversationId: true,
              messageType: true,
            },
          },
        },
      },
    },
  });
  if (!job || job.status !== JOB_STATUS_PENDING || job.nextAttemptAt.getTime() > Date.now()) return false;

  const lockedAt = new Date();
  const locked = await prisma.whatsAppMediaJob.updateMany({
    where: {
      id: job.id,
      status: JOB_STATUS_PENDING,
      nextAttemptAt: { lte: lockedAt },
    },
    data: {
      status: JOB_STATUS_PROCESSING,
      lockedAt,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (!locked.count) return false;

  const attempts = job.attempts + 1;
  const attachment = job.attachment;
  if ((attachment.mediaAssetId || attachment.originalStoragePath) && attachment.processingStatus === ATTACHMENT_STATUS_READY) {
    await prisma.whatsAppMediaJob.update({
      where: { id: job.id },
      data: {
        status: JOB_STATUS_COMPLETED,
        lockedAt: null,
        lastError: null,
      },
    });
    await broadcastWhatsAppCrmChange({
      table: "crm_message_attachments",
      operation: "UPDATE",
      id: attachment.id,
      conversationId: attachment.message.conversationId,
      messageId: attachment.message.id,
    });
    return true;
  }

  try {
    const mediaId = attachment.externalMediaId || job.externalMediaId || mediaIdFromStorageKey(attachment.storageKey);
    if (!mediaId) throw new Error("WhatsApp media id is missing.");

    const metadata = await fetchMetaMediaMetadata(mediaId);
    const downloaded = await fetchMetaMediaBytes(metadata.url || "");
    const contentType = metadata.mime_type
      || downloaded.contentType
      || attachment.mediaMimeType
      || attachment.contentType
      || fallbackWhatsAppMediaContentType(String(attachment.message.messageType));

    if (!isAllowedContentType(contentType)) {
      throw new Error(`Unsupported WhatsApp media type: ${contentType}`);
    }
    if (downloaded.bytes.byteLength > MAX_BYTES) {
      throw new Error(`WhatsApp media is too large (${downloaded.bytes.byteLength} bytes).`);
    }

    const mediaAsset = await createOrReuseMediaAssetFromBytes({
      businessId: attachment.message.businessId,
      bytes: downloaded.bytes,
      contentType,
    });

    if (!mediaAsset) {
      const saved = await writeCachedWhatsAppMedia({
        businessId: attachment.message.businessId,
        mediaId,
        bytes: downloaded.bytes,
        contentType,
      });
      if (!saved) {
        throw new Error("WhatsApp media could not be cached.");
      }

      await prisma.messageAttachment.update({
        where: { id: attachment.id },
        data: {
          contentType,
          mediaMimeType: contentType,
          mediaSizeBytes: downloaded.bytes.byteLength,
          sizeBytes: downloaded.bytes.byteLength,
          originalStoragePath: whatsappMediaCachePath({
            businessId: attachment.message.businessId,
            mediaId,
          }),
          thumbnailStoragePath: null,
          previewWidth: null,
          previewHeight: null,
          originalWidth: null,
          originalHeight: null,
          mediaSha256: metadata.sha256 || null,
          mediaAssetId: null,
          processingStatus: ATTACHMENT_STATUS_READY,
          processingError: null,
          processedAt: new Date(),
        },
      });
      await prisma.whatsAppMediaJob.update({
        where: { id: job.id },
        data: {
          status: JOB_STATUS_COMPLETED,
          lockedAt: null,
          lastError: null,
        },
      });
      await broadcastWhatsAppCrmChange({
        table: "crm_message_attachments",
        operation: "UPDATE",
        id: attachment.id,
        conversationId: attachment.message.conversationId,
        messageId: attachment.message.id,
      });
      return true;
    }

    await prisma.messageAttachment.update({
      where: { id: attachment.id },
      data: {
        contentType: mediaAsset.mimeType,
        mediaMimeType: mediaAsset.mimeType,
        mediaSizeBytes: downloaded.bytes.byteLength,
        sizeBytes: downloaded.bytes.byteLength,
        originalStoragePath: mediaAsset.originalStoragePath,
        thumbnailStoragePath: mediaAsset.thumbnailStoragePath || mediaAsset.posterStoragePath,
        previewWidth: mediaAsset.thumbnailWidth,
        previewHeight: mediaAsset.thumbnailHeight,
        originalWidth: mediaAsset.width,
        originalHeight: mediaAsset.height,
        mediaSha256: mediaAsset.contentHash,
        mediaAssetId: mediaAsset.id,
        processingStatus: ATTACHMENT_STATUS_READY,
        processingError: null,
        processedAt: new Date(),
      },
    });
    await prisma.whatsAppMediaJob.update({
      where: { id: job.id },
      data: {
        status: JOB_STATUS_COMPLETED,
        lockedAt: null,
        lastError: null,
      },
    });
    await broadcastWhatsAppCrmChange({
      table: "crm_message_attachments",
      operation: "UPDATE",
      id: attachment.id,
      conversationId: attachment.message.conversationId,
      messageId: attachment.message.id,
    });
    return true;
  } catch (error) {
    await markJobFailed({
      jobId: job.id,
      attachmentId: attachment.id,
      attempts,
      error: error instanceof Error ? error.message : "WhatsApp media could not be processed.",
    });
    return false;
  }
}

export async function processDueWhatsAppMediaJobs(args: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(args.limit || 3, 10));
  const staleLockedAt = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.whatsAppMediaJob.updateMany({
    where: {
      status: JOB_STATUS_PROCESSING,
      lockedAt: { lt: staleLockedAt },
    },
    data: {
      status: JOB_STATUS_PENDING,
      lockedAt: null,
      nextAttemptAt: new Date(),
    },
  });

  const jobs = await prisma.whatsAppMediaJob.findMany({
    where: {
      status: JOB_STATUS_PENDING,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  for (const job of jobs) {
    const ok = await processWhatsAppMediaJob(job.id);
    if (ok) processed += 1;
  }
  return processed;
}
