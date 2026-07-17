export const OFFICIAL_WHATSAPP_PLATFORM_ONLY = true;

export const unsupportedWhatsAppApproaches = [
  "WhatsApp Web automation",
  "Unofficial browser sessions",
  "QR-login bot libraries",
  "Reverse-engineered WhatsApp clients",
] as const;

export function assertOfficialWhatsAppOnly(integrationName: string): void {
  const lower = integrationName.toLowerCase();
  const unsupported = unsupportedWhatsAppApproaches.some((item) => lower.includes(item.toLowerCase()));

  if (unsupported) {
    throw new Error("Only the official Meta WhatsApp Business Platform is supported.");
  }
}
