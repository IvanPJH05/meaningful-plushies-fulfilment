import type { Order } from "./types";

export type UgcCollection = "classics" | "plush_charms_v1" | "ugc_all";
export const ugcCollections: Record<UgcCollection, {label:string;path:string}> = {
 classics:{label:"Meaningful Plushies (Classics)",path:"/collections/meaningful-plushies-classics"},
 plush_charms_v1:{label:"Plush Charms V1",path:"/collections/meaningful-plush-charms-v1"},
 ugc_all:{label:"Any product",path:"/collections/all"},
};
export function ugcCollection(value:unknown):UgcCollection {
 if(value === undefined || value === null) return "ugc_all";
 if(value === "classics" || value === "plush_charms_v1" || value === "ugc_all") return value;
 throw new Error("Choose a valid free product collection.");
}
export type UgcSample = { product_collection?: UgcCollection; id: string; customer_name: string; customer_url: string; source_order_number: string; sample_code: string; shopify_discount_id: string; order_number: string; notes: string; status: "pending" | "active" | "disabled"; given_at: string; updated_at: string };
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
export function ugcClaimLink(code: string, collection?:UgcCollection) {
  return `https://meaningfulplushies.com/discount/${encodeURIComponent(code)}?redirect=${ugcCollections[ugcCollection(collection)].path}`;
}
