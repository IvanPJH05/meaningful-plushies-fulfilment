export type BarcodeOrder = {
  id?: string;
  orderNumber?: string;
  salesChannel?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value : "";
}

/**
 * The barcode is deliberately based on the staff-facing order number, never
 * the courier tracking number. The audio scanner uses this value to find the
 * order and play its saved message.
 */
export function orderBarcodeValue(order: BarcodeOrder) {
  const orderNumber = clean(order.orderNumber);
  if (/tiktok/i.test(clean(order.salesChannel))) {
    const tikTokNumber = orderNumber.toUpperCase().match(/\bTT\d+\b/);
    if (tikTokNumber) return `MP-${tikTokNumber[0]}`;
  }
  const safeOrderNumber = orderNumber.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const fallback = clean(order.id).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
  return `MP-${safeOrderNumber || fallback || "ORDER"}`;
}

export function normaliseBarcodeValue(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
