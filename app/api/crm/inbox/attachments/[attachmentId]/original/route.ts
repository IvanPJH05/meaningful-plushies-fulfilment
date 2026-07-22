import { serveWhatsAppAttachmentMedia } from "@/src/modules/whatsapp/serve-attachment-media";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  return serveWhatsAppAttachmentMedia(request, attachmentId, "original");
}
