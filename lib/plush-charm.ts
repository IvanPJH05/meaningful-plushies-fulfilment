import type { Order } from "./types";

/** Identifies the audio-only Plush Charm without ever treating a classic Billy plushie as a charm. */
export function isPlushCharmOrder(order: Pick<Order, "product" | "productType" | "remark">) {
  if (["plush_charm", "snowy_charm"].includes(String(order.productType || "").toLowerCase())) return true;
  // TikTok's current export calls the product “Meaningful Plush Charms”.
  // Accept both singular and plural without ever matching a classic plushie.
  return /\b(?:snowy\s+)?plush\s*charms?\b/i.test(`${order.product || ""} ${order.remark || ""}`);
}
