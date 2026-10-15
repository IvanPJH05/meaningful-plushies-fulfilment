import type { Order } from "./types";
import type { OrderSaveOutcome } from "./order-save-outcome";

// Keep import writes small without making the private certificate queue a
// browser API. The server validates the warehouse session on every batch.
export async function saveImportedOrders(orders: Order[], token: string): Promise<OrderSaveOutcome> {
  let accountingWarning: string | null = null;
  for (let start = 0; start < orders.length; start += 25) {
    const response = await fetch("/api/fulfilment/orders/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orders: orders.slice(start, start + 25) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.saved !== true) throw new Error(result.error || "Import could not be saved. Your CSV and details are kept; please retry.");
    accountingWarning ||= result.accountingWarning || null;
  }
  return { saved: true, accountingWarning };
}
