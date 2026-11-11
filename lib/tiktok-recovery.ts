import { mobileServiceClient } from "./mobile-api";
import { tikTokAccess } from "./tiktok-connection";
import { tikTokRequest } from "./tiktok-client";
import { syncTikTokOrdersByIds } from "./tiktok-sync";

export async function processTikTokEvents() {
  const db = mobileServiceClient();
  const pending = await db.from("tiktok_webhook_events").select("*").neq("state", "complete").lt("lease_until", new Date().toISOString()).order("received_at").limit(10);
  if (pending.error) throw new Error("Could not read TikTok event queue.");
  for (const event of pending.data ?? []) {
    const lease = new Date(Date.now() + 300000).toISOString();
    const claim = await db.from("tiktok_webhook_events").update({ state: "processing", attempts: event.attempts + 1, lease_until: lease }).eq("id", event.id).lt("lease_until", new Date().toISOString()).select("id");
    if (claim.error || !claim.data?.length) continue;
    try {
      if (event.order_ids.length) await syncTikTokOrdersByIds(event.order_ids, "TikTok webhook");
      const done = await db.from("tiktok_webhook_events").update({ state: "complete" }).eq("id", event.id).eq("lease_until", lease);
      if (done.error) throw new Error("Could not acknowledge TikTok event.");
    } catch {
      await db.from("tiktok_webhook_events").update({ state: "pending", lease_until: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(event.attempts, 7)) * 1000).toISOString() }).eq("id", event.id).eq("lease_until", lease);
    }
  }
}

export async function recoverTikTokOrders() {
  await processTikTokEvents();
  const connection = await tikTokAccess();
  const since = connection.recovery_since ?? Math.floor(connection.last_sync_at ? Date.parse(connection.last_sync_at) / 1000 : Date.now() / 1000 - 86400);
  const until = connection.recovery_until ?? Math.min(Math.floor(Date.now() / 1000), since + 86400);
  let page = connection.recovery_page || "";
  let checked = 0;
  for (let count = 0; count < 5; count++) {
    const result = await tikTokRequest<{ orders?: { id: string }[]; next_page_token?: string }>("/order/202309/orders/search", connection.token,
      { shop_cipher: connection.shop_cipher, page_size: "20", sort_order: "ASC", sort_field: "update_time", ...(page ? { page_token: page } : {}) },
      { update_time_ge: since - 300, update_time_lt: until });
    const ids = (result.orders ?? []).map(order => order.id);
    if (ids.length) checked += (await syncTikTokOrdersByIds(ids, "TikTok recovery")).checked;
    page = result.next_page_token || "";
    if (!page) break;
  }
  // Never advance the cursor past an incomplete page set.
  {
    const saved = await mobileServiceClient().from("tiktok_connection").update(page ? { recovery_since: since, recovery_until: until, recovery_page: page } : { last_sync_at: new Date(until * 1000).toISOString(), recovery_page: "", recovery_since: null, recovery_until: null }).eq("id", true);
    if (saved.error) throw new Error("Could not save TikTok sync progress.");
  }
  return { ok: true, checked, more: !!page || until < Math.floor(Date.now() / 1000) - 60 };
}
