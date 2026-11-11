export type DailyPaymentRow = {
  id: string; customer_name: string; status: string; paid_at: string | null;
  shopify_order_id: string | null; shopify_order_name: string | null;
  payment_receipts: {url: string}[] | null;
};
export function manualPaymentDayRange(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) !== day) throw Error("Choose a valid payment date.");
  const start = Date.parse(`${day}T00:00:00+08:00`);
  return {start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString()};
}
export function dailyManualPaymentSummary(rows: DailyPaymentRow[], day: string) {
  const {start,end} = manualPaymentDayRange(day);
  const payments = rows.filter(row => ["created","ready_to_create"].includes(row.status) && row.paid_at && Date.parse(row.paid_at) >= Date.parse(start) && Date.parse(row.paid_at) < Date.parse(end) && row.payment_receipts?.some(r => /^https?:\/\//i.test(r.url)) && !row.payment_receipts.some(r => r.url === "manual-order://cash-on-delivery"));
  const orders = new Set(payments.filter(row => row.status === "created" && row.shopify_order_id).map(row => row.shopify_order_id));
  return {day, paymentCount: payments.length, orderCount: orders.size, missingOrders: payments.filter(row => row.status !== "created" || !row.shopify_order_id).map(row => ({id:row.id, customerName:row.customer_name})), orders: payments.filter(row => row.status === "created" && row.shopify_order_id).map(row => ({id:row.id, orderName:row.shopify_order_name || row.shopify_order_id, customerName:row.customer_name}))};
}
export type DailyManualPaymentSummary = ReturnType<typeof dailyManualPaymentSummary>;
