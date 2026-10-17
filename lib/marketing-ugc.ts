import type { Order } from "./types";

export type UgcSample = { id: string; customer_name: string; customer_url: string; source_order_number: string; sample_code: string; shopify_discount_id: string; order_number: string; notes: string; status: "pending" | "active" | "disabled"; given_at: string; updated_at: string };
export function normalizeUgcCode(value: string) {
  const code = value.trim().toUpperCase();
  const result = code.startsWith("UGC-") ? code : `UGC-${code}`;
  if (!/^UGC-[A-Z0-9_-]{1,60}$/.test(result)) throw new Error("Use letters, numbers, hyphens or underscores for the UGC code.");
  return result;
}
export function isUgcOrder(order: Pick<Order, "discountCodes" | "discountCodeUsed">, codes: readonly string[]) {
  const known = new Set(codes.map(code => code.trim().toUpperCase()));
  return [order.discountCodeUsed || "", ...(order.discountCodes || [])].some(code => known.has(code.trim().toUpperCase()));
}
export function ugcClaimLink(code: string) {
  return `https://meaningfulplushies.com/discount/${encodeURIComponent(code)}?redirect=/collections/all`;
}
