export type VoiceFileOrder = {
  orderNumber: string;
  character: string;
  salesChannel?: "shopify" | "tiktok";
};

export function mediaFileExtension(fileName = "", contentType = "", dataUrl = "") {
  const namedExtension = fileName.split(/[?#]/, 1)[0]?.match(/\.([a-z0-9]{1,10})$/i)?.[1];
  if (namedExtension) return namedExtension.toLowerCase();

  const dataUrlType = dataUrl.match(/^data:([^;,]+)/i)?.[1] || contentType;
  const subtype = dataUrlType.split("/")[1]?.split(/[+;]/)[0]?.replace(/[^a-z0-9]/gi, "");
  return subtype?.toLowerCase() || "audio";
}

export function voiceBackupFileName(order: VoiceFileOrder, extension = "audio") {
  const rawOrderNumber = order.orderNumber || "";
  const tikTokOrder = rawOrderNumber.match(/\bTT\d+\b/i)?.[0];
  const orderLabel = order.salesChannel === "tiktok" || tikTokOrder
    ? (tikTokOrder || rawOrderNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "TIKTOK")
    : (rawOrderNumber.match(/\d+/)?.[0] || rawOrderNumber.replace(/[^A-Za-z0-9]/g, "") || "ORDER");
  const character = order.character.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim() || "PLUSHIE";
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "audio";
  return `${orderLabel} ${character}.${safeExtension}`;
}
