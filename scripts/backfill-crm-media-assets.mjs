import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeMediaContentType(value) {
  return (value || "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
}

function mediaTypeFromContentType(contentType) {
  const normalized = normalizeMediaContentType(contentType);
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized === "application/pdf") return "pdf";
  return "file";
}

async function main() {
  let created = 0;
  let linked = 0;

  for (;;) {
    const attachments = await prisma.messageAttachment.findMany({
      where: {
        mediaAssetId: null,
        mediaSha256: { not: null },
        originalStoragePath: { not: null },
      },
      include: {
        message: {
          select: {
            businessId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    if (!attachments.length) break;

    for (const attachment of attachments) {
      const businessId = attachment.message.businessId;
      const contentHash = attachment.mediaSha256;
      const originalStoragePath = attachment.originalStoragePath;
      if (!businessId || !contentHash || !originalStoragePath) continue;

      const mimeType = normalizeMediaContentType(attachment.mediaMimeType || attachment.contentType);
      let asset = await prisma.mediaAsset.findUnique({
        where: {
          businessId_contentHash: {
            businessId,
            contentHash,
          },
        },
      });

      if (!asset) {
        asset = await prisma.mediaAsset.create({
          data: {
            businessId,
            contentHash,
            mimeType,
            mediaType: mediaTypeFromContentType(mimeType),
            originalStoragePath,
            thumbnailStoragePath: attachment.thumbnailStoragePath,
            width: attachment.originalWidth,
            height: attachment.originalHeight,
            thumbnailWidth: attachment.previewWidth,
            thumbnailHeight: attachment.previewHeight,
            sizeBytes: attachment.mediaSizeBytes ?? attachment.sizeBytes,
            usageCount: 0,
            lastUsedAt: attachment.createdAt,
          },
        });
        created += 1;
      }

      await prisma.messageAttachment.update({
        where: { id: attachment.id },
        data: { mediaAssetId: asset.id },
      });

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      linked += 1;
    }
  }

  console.log(`Linked ${linked} WhatsApp attachment(s) to shared media assets. Created ${created} media asset(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
