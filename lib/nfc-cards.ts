import type { Order } from "./types";
import { isPlushCharmOrder } from "./plush-charm.ts";

export type NfcCard = { id: number; batch_id: string; public_token: string; status: "available" | "assigned" | "voided"; order_id: string | null; programmed_at: string | null; paired_at: string | null };
export type NfcBatch = { id: string; number: number; quantity: number; created_at: string; created_by: string };
export type NfcScanOrder = { id: string; orderNumber: string; plushName: string; customerName: string; character: string; status: string; cardId: number | null };
export const nfcTokenPattern = /^[a-f0-9]{32}$/;
export function nfcCardUrl(origin: string, token: string) {
  if (!nfcTokenPattern.test(token)) throw new Error("Invalid NFC link.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Invalid NFC host.");
  return `${url.origin}/n/${token}`;
}
export function nfcCardScan(value: string): number | null {
  const match = value.trim().match(/^(?:NFC[- ]?)?(\d{6,12})$/i);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
}
// Only destinations already used by this shop can be opened by a public card.
// Never accept a redirect URL from the pairing browser or the scanned card.
export function nfcDestination(order: Pick<Order, "product" | "productType" | "remark" | "certificateCode" | "idWebsiteLink">) {
  const raw = isPlushCharmOrder(order) ? order.idWebsiteLink : order.certificateCode
    ? `https://meaningfulplushies.com/pages/certificate/${encodeURIComponent(order.certificateCode.trim())}` : order.idWebsiteLink;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || !["meaningfulplushies.com", "www.meaningfulplushies.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
    if (!/^\/pages\/certificate\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) && !/^\/apps\/closer\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
