import { randomUUID } from "node:crypto";
import { mobileServiceClient } from "./mobile-api";
import { insertSharedActivity, upsertSharedOrders } from "./supabase";
import { addMissingOurLinks } from "./our-link";
import { fetchTikTokOrderDetails, tiktokApiOrderToFulfilmentOrder, tiktokOrderIdFromValue } from "./tiktok-orders";
import type { Order } from "./types";

function comparableOrder(order: Order) {
  return { ...order, updatedAt: "" };
}

async function syncUnlocked(orderIds: string[], actor = "TikTok Shop sync") {
  const uniqueOrderIds = [...new Set(orderIds.map(tiktokOrderIdFromValue).filter(Boolean))];
  if (uniqueOrderIds.length > 20) throw new Error("Sync at most 20 TikTok orders at a time.");
  if (!uniqueOrderIds.length) {
    return { ok: false, checked: 0, updated: 0, failed: 0, error: "At least one TikTok order ID is required." };
  }

  const db = mobileServiceClient();
  const { data: savedRows, error: readError } = await db.from("fulfilment_orders").select("data").in("id", uniqueOrderIds.map(id => "tiktok-" + id));
  if (readError) throw new Error("Could not read existing TikTok orders.");
  const existing = (savedRows ?? []).map(row => row.data as Order);
  const apiOrders = await fetchTikTokOrderDetails(uniqueOrderIds);
  if (apiOrders.length !== uniqueOrderIds.length) throw new Error("TikTok did not return every requested order. The sync will retry.");
  const syncedOrdersInput: Order[] = [];
  for (const apiOrder of apiOrders) {
    const rawId = String(apiOrder.id || apiOrder.order_id || "");
    const current = existing.find(order => order.id === "tiktok-" + rawId);
    let sequence: string | undefined;
    if (!current) {
      if (/^(UNPAID|ON_HOLD|CANCELLED|COMPLETED|DELIVERED|IN_TRANSIT)$/i.test(String(apiOrder.status || apiOrder.order_status || ""))) continue;
      const reserved = await db.rpc("reserve_tiktok_order_number");
      if (reserved.error || !reserved.data) throw new Error("Could not reserve TikTok order number.");
      sequence = "TT" + reserved.data;
    }
    const mapped = tiktokApiOrderToFulfilmentOrder(apiOrder, existing, actor, sequence);
    if (mapped) syncedOrdersInput.push(mapped);
  }
  let syncedOrders = syncedOrdersInput;

  // Use the same atomic Charm counter as every other ingestion path. This
  // avoids duplicate or missing Our Links when TikTok webhooks arrive close
  // together with Shopify sales.
  syncedOrders = await addMissingOurLinks(syncedOrders, actor);

  const previousById = new Map(existing.map((order) => [order.id, order]));
  const changedOrders = syncedOrders.filter((order) => {
    const previous = previousById.get(order.id);
    return !previous || JSON.stringify(comparableOrder(previous)) !== JSON.stringify(comparableOrder(order));
  });

  let accountingWarning: string | null = null;
  if (changedOrders.length) {
    const saved = await upsertSharedOrders(changedOrders, undefined, db);
    accountingWarning = saved.accountingWarning;
    await insertSharedActivity({
      id: `tiktok-sync-${Date.now()}`,
      orderNumber: changedOrders.length === 1 ? changedOrders[0].orderNumber : undefined,
      action: "TikTok order synced",
      detail: `${syncedOrders.length} TikTok order${syncedOrders.length === 1 ? "" : "s"} checked, ${changedOrders.length} updated. Plushie details are still manual.${accountingWarning ? ` ${accountingWarning}` : ""}`,
      actor,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ok: true,
    changed: changedOrders.length > 0,
    checked: syncedOrders.length,
    updated: changedOrders.length,
    failed: 0,
    orderNumbers: syncedOrders.map((order) => order.orderNumber),
    accountingWarning,
    accountingRetryOrderIds: accountingWarning ? changedOrders.map((order) => order.id) : [],
  };
}

export async function syncTikTokOrdersByIds(orderIds: string[], actor = "TikTok Shop sync") {
  const db = mobileServiceClient();
  const owner = randomUUID();
  const { data, error } = await db.from("tiktok_sync_lock").update({ owner, lease_until: new Date(Date.now() + 330000).toISOString() }).eq("id", true).lt("lease_until", new Date().toISOString()).select("id");
  if (error || !data?.length) throw new Error("TikTok sync is already running. Retry shortly.");
  try { return await syncUnlocked(orderIds, actor); }
  finally { await db.from("tiktok_sync_lock").update({ lease_until: new Date(0).toISOString(), owner: null }).eq("id", true).eq("owner", owner); }
}
