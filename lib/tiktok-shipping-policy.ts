export type Handover = { method: "PICKUP" | "DROP_OFF"; start?: number; end?: number };
export type PickupSlot = { start_time: number; end_time: number; avaliable?: boolean; available?: boolean };
export type HandoverOptions = { can_pickup?: boolean; can_drop_off?: boolean; pickup_slots?: PickupSlot[] };
export type ShippingPackage = { package_id: string; package_status: string; shipping_type: string; orders?: { id: string }[]; tracking_number?: string; shipping_provider_name?: string };

export function hasShippingScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.some(s => s === "seller.fulfillment.basic" || s === "seller.fs.order&fufillment.management");
}
export function shippingOrderIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 20 || value.some(id => typeof id !== "string" || !/^tiktok-\d{8,25}$/.test(id))) throw Error("Select between 1 and 20 saved TikTok orders.");
  return [...new Set(value as string[])];
}
export function validateShippingPackage(pkg: ShippingPackage, orderId: string) {
  if (!/^\d{8,25}$/.test(pkg.package_id)) throw Error("TikTok did not return a valid package ID.");
  if (pkg.orders?.length !== 1 || pkg.orders[0].id !== orderId) throw Error("This is a combined or mismatched package. Arrange it in TikTok Seller Center.");
  if (pkg.shipping_type !== "TIKTOK") throw Error("This package does not use TikTok Shipping. Arrange its courier shipment separately.");
  if (!["TO_FULFILL", "PROCESSING"].includes(pkg.package_status)) throw Error("This package is cancelled, already collected, or not available for shipment and label retrieval.");
}
export function validateHandover(input: Handover, options: HandoverOptions, now = Date.now() / 1000) {
  if (input.method === "DROP_OFF" && options.can_drop_off) return { handover_method: "DROP_OFF" };
  if (input.method === "PICKUP" && options.can_pickup && options.pickup_slots?.some(slot =>
    slot.start_time === input.start && slot.end_time === input.end && slot.end_time > now && (slot.avaliable === true || slot.available === true))) {
    return { handover_method: "PICKUP", pickup_slot: { start_time: input.start!, end_time: input.end! } };
  }
  throw Error("Choose an available handover option. Refresh if the pickup slot has changed.");
}
export function trustedTikTokDocumentUrl(value: string) {
  const url = new URL(value);
  const hosts = ["bytedance.net", "byteoversea.com", "byteoversea.net", "ibyteimg.com", "ibytedtos.com", "tiktokcdn.com", "tiktokshop.com", "tiktokglobalshop.com"];
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !hosts.some(host => url.hostname === host || url.hostname.endsWith("." + host))) throw Error("TikTok returned an unrecognised label download host. Contact the administrator.");
  return url.toString();
}
