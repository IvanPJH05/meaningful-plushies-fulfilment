import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "./types";

export function isVoiceRecordingReference(value?: string) {
  return /^(?:https?:\/\/|supabase-storage:|\/(?:api\/customisation\/audio-download|media-assets\/)|data:(?:audio\/|video\/|application\/octet-stream[;,]))/i
    .test(value?.trim() || "");
}

export function preferVoiceRecording(...values: (string | undefined)[]) {
  return values.find(isVoiceRecordingReference) || values.find(value => value?.trim()) || "";
}

export function batchAudioSource(order: Pick<Order, "salesChannel" | "tikTokFileDataUrl" | "meaningfulMessage">) {
  return (order.salesChannel === "tiktok" ? order.tikTokFileDataUrl : order.meaningfulMessage)?.trim() || "";
}

export async function resolveBatchAudioSource(db: SupabaseClient, order: Order, fulfilmentOrderId: string) {
  const source = batchAudioSource(order);
  if (order.salesChannel === "tiktok" || isVoiceRecordingReference(source)) return source;

  let sessions = db.from("customisation_sessions")
    .select("voice_storage_path")
    .eq("fulfilment_order_id", fulfilmentOrderId)
    .eq("status", "submitted")
    .not("voice_storage_path", "is", null)
    .neq("voice_storage_path", "");
  if (order.customisationSessionId) sessions = sessions.eq("id", order.customisationSessionId);
  const { data, error } = await sessions.limit(2);
  if (error) throw Error("The linked voice recording could not be checked. Try again.");
  if (data.length > 1) throw Error("Multiple recordings are linked to this order. Attach the correct recording before downloading.");
  const path = data[0]?.voice_storage_path;
  return path ? `supabase-storage:${path}` : "";
}
