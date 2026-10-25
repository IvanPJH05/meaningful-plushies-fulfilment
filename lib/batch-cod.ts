import type { Order } from "./types";

export function isCodOrder(order: Pick<Order, "paymentProcessor">) {
  return /\bcod\b|cash[ _-]on[ _-]delivery/i.test(order.paymentProcessor || "");
}

export function codPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0060")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("60")) digits = `0${digits.slice(2)}`;
  if (/^01\d{8,9}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return phone.trim();
}

export function codDetails(order: Order) {
  const name = (order.customerName || "").replace(/\s+/g, " ").trim();
  const phone = codPhone(order.phone || "");
  const address = (order.address || "").replace(/\s*\r?\n\s*/g, ", ").trim();
  const amount = order.outstandingBalance > 0 ? order.outstandingBalance : order.totalAmount;
  return {
    text: [name, phone, address].join("\n"),
    complete: Boolean(name && phone && address),
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    currency: order.currency || "MYR",
    usesBalance: order.outstandingBalance > 0,
  };
}

// An imported order may have several plushie rows. Its collection amount is
// already an order total, so never add the rows together.
export function batchCodOrders(orders: Order[]) {
  const seen = new Set<string>();
  return orders.filter(order => {
    if (order.salesChannel === "tiktok" || !isCodOrder(order)) return false;
    const key = `${order.salesChannel || "shopify"}:${order.orderNumber || order.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
