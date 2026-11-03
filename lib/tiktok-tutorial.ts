import { mobileServiceClient } from "./mobile-api";
import { tikTokAccess } from "./tiktok-connection";
import { fetchTikTokOrderDetails } from "./tiktok-orders";
import { TikTokApiError, tikTokCredentials, tikTokRequest } from "./tiktok-client.ts";

const pilot = "tiktok-586945542722586535";
const message = "Thank you for ordering from Meaningful Plushies! 💗\n\nPlease watch this short tutorial on how to submit your voice recording for your plushie.\n\nTerima kasih kerana membuat pesanan dengan Meaningful Plushies! 💗\n\nSila tonton video tutorial ringkas ini untuk cara menghantar rakaman suara plushie anda.";
const deliveries = () => mobileServiceClient().from("tiktok_tutorial_deliveries");

export async function queueTikTokTutorials(orders: { id: string; create_time?: unknown }[]) {
  const enabledAt = Date.parse(process.env.TIKTOK_TUTORIAL_ENABLED_AT || "");
  if (!Number.isFinite(enabledAt) || enabledAt > Date.now()) return;
  const pilotResult = await deliveries().select("status").eq("order_id", pilot).maybeSingle();
  if (pilotResult.error) throw pilotResult.error;
  if (pilotResult.data?.status !== "sent") return;
  const rows = orders.filter(order => Number(order.create_time) * 1000 >= enabledAt)
    .map(order => ({ order_id: "tiktok-" + order.id }));
  if (!rows.length) return;
  const result = await deliveries().upsert(rows, { onConflict: "order_id", ignoreDuplicates: true });
  if (result.error) throw result.error;
}

async function uploadVideo(file: Blob, token: string, shopCipher: string) {
  const chunks: Blob[] = [];
  for (let offset = 0; offset < file.size;) {
    let end = Math.min(offset + 20_000_000, file.size);
    if (file.size - end < 5_000_000) end = file.size;
    chunks.push(file.slice(offset, end));
    offset = end;
  }
  const init = await tikTokRequest<{ upload_url: string; upload_token: string }>(
    "/open/202512/file/init", token, { shop_cipher: shopCipher }, {
      file_size: file.size, file_name: "tutorial.mp4", file_type: "video",
      total_chunk_count: chunks.length,
      target_path: "[POST]/customer_service/202606/conversations/{conversation_id}/messages",
    },
  );
  const url = new URL(init.upload_url);
  if (url.origin !== "https://open-api.tiktokglobalshop.com" || url.username || url.password || !init.upload_token) {
    throw new Error("TikTok returned an unsupported upload destination.");
  }
  url.searchParams.set("upload_token", init.upload_token);
  url.searchParams.set("app_key", tikTokCredentials().appKey);
  url.searchParams.set("shop_cipher", shopCipher);
  let resourceId: string | undefined;
  for (const [index, chunk] of chunks.entries()) {
    url.searchParams.set("chunk_num", String(index + 1));
    const response = await fetch(url, {
      method: "PUT", body: chunk, redirect: "error", signal: AbortSignal.timeout(25000),
      headers: { "Content-Type": "video/mp4", "x-tts-access-token": token },
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) throw new TikTokApiError(result.code || response.status);
    resourceId = result.data?.resource_id;
  }
  if (!resourceId) throw new Error("TikTok did not return a video ID.");
  return resourceId;
}

export async function deliverTikTokTutorial(orderId: string) {
  const claim = await deliveries().update({ status: "sending", error: null })
    .eq("order_id", orderId).eq("status", "pending").lte("retry_after", new Date().toISOString())
    .select("text_id").maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return;
  let sending = false;
  async function save(fields: Record<string, unknown>) {
    const result = await deliveries().update(fields).eq("order_id", orderId).eq("status", "sending").select("order_id").single();
    if (result.error) throw result.error;
  }
  try {
    const db = mobileServiceClient();
    const settings = await db.from("tiktok_tutorial_settings").select("video_path").eq("id", true).single();
    if (!settings.data?.video_path) throw new Error("Upload the tutorial video first.");
    const connection = await tikTokAccess();
    if (!connection.granted_scopes?.includes("seller.customer_service")) throw new Error("Customer Service permission is missing.");
    const id = orderId.replace(/^tiktok-/, "");
    const orders = await fetchTikTokOrderDetails([id]);
    const order = orders.find(row => String(row.id || row.order_id) === id);
    if (!order || typeof order.user_id !== "string" || !order.user_id || String(order.status || order.order_status) === "CANCELLED") {
      throw new Error("TikTok did not return an eligible buyer for this order.");
    }
    const query = { shop_cipher: String(connection.shop_cipher) };
    const chat = await tikTokRequest<{ conversation_id: string }>(
      "/customer_service/202309/conversations", connection.token, query, { buyer_user_id: order.user_id },
    );
    if (!/^\d+$/.test(chat.conversation_id || "")) throw new Error("TikTok did not return a conversation ID.");
    const file = await db.storage.from("tiktok-tutorial").download(settings.data.video_path);
    if (file.error || !file.data?.size) throw new Error("Could not read the active tutorial video.");
    const vid = await uploadVideo(file.data, connection.token, query.shop_cipher);
    const path = "/customer_service/202606/conversations/" + chat.conversation_id + "/messages";
    async function send(type: "TEXT" | "VIDEO", content: object) {
      sending = true;
      const result = await tikTokRequest<{ message_id: string }>(path, connection.token, query, {
        type, content: JSON.stringify(content), sender_role: "SYSTEM",
      });
      if (!result.message_id) throw new Error("TikTok did not confirm delivery.");
      return result.message_id;
    }
    if (!claim.data.text_id) {
      const textId = await send("TEXT", { content: message });
      await save({ text_id: textId });
      sending = false;
    }
    const videoId = await send("VIDEO", { vid });
    await save({ status: "sent", video_id: videoId, sent_at: new Date().toISOString() });
  } catch (error) {
    const code = error instanceof TikTokApiError ? Number(error.code) : 0;
    const rateLimited = code === 429 || code === 45101004;
    const rejected = rateLimited || [45101002, 45101003, 45101006, 45102007, 45109001, 45111001].includes(code);
    await save({
      status: rateLimited ? "pending" : sending && !rejected ? "uncertain" : "failed",
      error: sending && !rejected ? "Delivery could not be confirmed. Check Buyer Messages before retrying." :
        code ? "TikTok rejected the request (code " + code + ")." : "Tutorial preparation failed. Check the video and shop connection.",
      retry_after: new Date(Date.now() + (code === 45101004 ? 86_400_000 : 300_000)).toISOString(),
    });
  }
}

export async function runTikTokTutorialQueue() {
  const result = await deliveries().select("order_id").eq("status", "pending")
    .lte("retry_after", new Date().toISOString()).order("retry_after").limit(1);
  if (result.error) throw result.error;
  if (result.data[0]) await deliverTikTokTutorial(result.data[0].order_id);
}

export async function queueTutorialPilot() {
  const result = await deliveries().upsert({ order_id: pilot }, { onConflict: "order_id", ignoreDuplicates: true });
  if (result.error) throw result.error;
}

export async function retryTutorial(orderId: string) {
  const result = await deliveries().update({ status: "pending", retry_after: new Date().toISOString() })
    .eq("order_id", orderId).eq("status", "failed");
  if (result.error) throw result.error;
}
