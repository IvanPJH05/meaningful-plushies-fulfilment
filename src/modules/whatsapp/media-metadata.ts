export type WhatsAppMediaReference = {
  id: string;
  mimeType: string;
  filename: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value).trim();
    if (text) return text;
  }
  return "";
}

export function fallbackWhatsAppMediaContentType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized === "image") return "image/jpeg";
  if (normalized === "audio") return "audio/ogg";
  if (normalized === "video") return "video/mp4";
  if (normalized === "document") return "application/octet-stream";
  if (normalized === "sticker") return "image/webp";
  return "application/octet-stream";
}

export function whatsappMediaFromMessageMetadata(metadata: unknown, messageType?: string): WhatsAppMediaReference | null {
  const root = objectValue(metadata);
  const explicitMedia = objectValue(root.media);
  const raw = objectValue(root.raw);
  const normalizedType = (textValue(raw.type) || textValue(messageType)).toLowerCase();
  const typedMedia = objectValue(raw[normalizedType]);
  const genericMedia = objectValue(raw.media);
  const media = Object.keys(explicitMedia).length
    ? explicitMedia
    : Object.keys(typedMedia).length
      ? typedMedia
      : genericMedia;
  const id = firstTextValue(media.id, media.media_id, media.mediaId, raw.media_id, raw.mediaId);
  if (!id) return null;

  return {
    id,
    mimeType: firstTextValue(media.mimeType, media.mime_type, media.contentType, media.content_type),
    filename: firstTextValue(media.filename, media.file_name, media.name),
  };
}
