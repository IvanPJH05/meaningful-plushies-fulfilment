export type VoiceFileOrder = {
  orderNumber: string;
  character: string;
  salesChannel?: "shopify" | "tiktok";
};

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
