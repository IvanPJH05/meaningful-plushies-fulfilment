import { mobileServiceClient } from "./mobile-api";
import { tikTokAccess } from "./tiktok-connection";
import { TikTokApiError, tikTokRequest } from "./tiktok-client.ts";
import { uploadTutorialVideo } from "./tiktok-tutorial";
import { tutorialFaqMessage } from "./tiktok-tutorial-faq-policy";

const replies = () => mobileServiceClient().from("tiktok_tutorial_faq_replies");

export async function retainTutorialFaq(shopId: string, data: unknown) {
  const message = tutorialFaqMessage(data);
  if (!message) return null;
  const result = await replies().upsert({ shop_id: shopId, ...message }, {
    onConflict: "shop_id,message_id", ignoreDuplicates: true,
  });
  if (result.error) throw result.error;
  return message.message_id;
}

export async function runTutorialFaq(shopId: string, messageId?: string) {
  const db = mobileServiceClient();
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  const pending = replies().select("message_id").eq("shop_id", shopId).eq("status", "pending")
    .gte("received_at", cutoff).order("received_at").limit(1);
  if (messageId) pending.eq("message_id", messageId);
  const selected = await pending.maybeSingle();
  if (selected.error) throw selected.error;
  if (!selected.data) return;

  const row = replies().update({ status: "sending" }).eq("shop_id", shopId)
    .eq("message_id", selected.data.message_id).eq("status", "pending");
  const claim = await row.select("conversation_id").maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return;

  async function finish(fields: Record<string, unknown>) {
    const result = await replies().update(fields).eq("shop_id", shopId)
      .eq("message_id", selected.data!.message_id).eq("status", "sending");
    if (result.error) throw result.error;
  }

  let sending = false;
  try {
    const connection = await tikTokAccess();
    if (connection.shop_id !== shopId || !connection.granted_scopes?.includes("seller.customer_service")) {
      throw new Error("Customer Service permission unavailable.");
    }
    const settings = await db.from("tiktok_tutorial_settings").select("video_path").eq("id", true).single();
    if (!settings.data?.video_path) throw new Error("No active tutorial video.");
    const file = await db.storage.from("tiktok-tutorial").download(settings.data.video_path);
    if (file.error || !file.data?.size) throw new Error("Tutorial video unavailable.");
    const cipher = String(connection.shop_cipher);
    const vid = await uploadTutorialVideo(file.data, connection.token, cipher);
    sending = true;
    const result = await tikTokRequest<{ message_id: string }>(
      "/customer_service/202606/conversations/" + claim.data.conversation_id + "/messages",
      connection.token, { shop_cipher: cipher },
      { type: "VIDEO", content: JSON.stringify({ vid }), sender_role: "SYSTEM" },
    );
    if (!result.message_id) throw new Error("TikTok did not confirm the FAQ reply.");
    await finish({ status: "sent", reply_id: result.message_id });
  } catch (error) {
    const code = error instanceof TikTokApiError ? Number(error.code) : 0;
    const rejected = [429, 45101002, 45101003, 45101004, 45101006, 45102007, 45109001, 45111001].includes(code);
    await finish({
      status: sending && !rejected ? "uncertain" : "failed",
      error: code ? "TikTok API code " + code : "Tutorial reply could not be confirmed.",
    });
  }
}
