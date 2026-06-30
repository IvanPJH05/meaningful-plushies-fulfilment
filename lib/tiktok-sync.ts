import { fetchSharedOrders, insertSharedActivity, upsertSharedOrders } from "./supabase";
import { fetchTikTokOrderDetails, tiktokApiOrderToFulfilmentOrder, tiktokOrderIdFromValue } from "./tiktok-orders";
import type { Order } from "./types";

function comparableOrder(order: Order) {
  return { ...order, updatedAt: "" };
}

export async function syncTikTokOrdersByIds(orderIds: string[], actor = "TikTok Shop sync") {
  const uniqueOrderIds = [...new Set(orderIds.map(tiktokOrderIdFromValue).filter(Boolean))];
  if (!uniqueOrderIds.length) {
    return { ok: false, checked: 0, updated: 0, failed: 0, error: "At least one TikTok order ID is required." };
  }

  const existing = await fetchSharedOrders();
  const apiOrders = await fetchTikTokOrderDetails(uniqueOrderIds);
  const syncedOrders = apiOrders
    .map((order) => tiktokApiOrderToFulfilmentOrder(order, existing, actor))
    .filter(Boolean) as Order[];

  const previousById = new Map(existing.map((order) => [order.id, order]));
  const changedOrders = syncedOrders.filter((order) => {
    const previous = previousById.get(order.id);
    return !previous || JSON.stringify(comparableOrder(previous)) !== JSON.stringify(comparableOrder(order));
  });

  if (changedOrders.length) {
    await upsertSharedOrders(changedOrders);
    await insertSharedActivity({
      id: `tiktok-sync-${Date.now()}`,
      orderNumber: changedOrders.length === 1 ? changedOrders[0].orderNumber : undefined,
      action: "TikTok order synced",
      detail: `${syncedOrders.length} TikTok order${syncedOrders.length === 1 ? "" : "s"} checked, ${changedOrders.length} updated. Plushie details are still manual.`,
      actor,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ok: true,
    changed: changedOrders.length > 0,
    checked: syncedOrders.length,
    updated: changedOrders.length,
    failed: Math.max(0, uniqueOrderIds.length - syncedOrders.length),
    orderNumbers: syncedOrders.map((order) => order.orderNumber),
  };
}
