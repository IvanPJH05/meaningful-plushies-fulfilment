import type { Order } from "./types";
import { isPlushCharmOrder } from "./plush-charm.ts";

export const batchStages = ["labels", "printing", "envelopes", "audio", "nfc", "complete"] as const;
export type BatchStage = typeof batchStages[number];
export type FulfilmentBatch = { id: string; number: number; stage: BatchStage; version: number; created_at: string; completed_at: string | null; orderCount?: number; writtenCount?: number; envelope_names: Record<string, string> };
export type BatchMember = { order_id: string; nfc_written_at: string | null };
export type BatchDetail = { batch: FulfilmentBatch; orders: Order[]; members: BatchMember[] };
export function canJoinBatch(status: unknown) { return status === "new_order" || status === "uploading_audio"; }
export function batchNeedsLabel(order: Pick<Order, "paymentProcessor">) { return !/\bcod\b|cash[ _]on[ _]delivery/i.test(order.paymentProcessor || ""); }
export function batchNeedsAudio(order: Pick<Order, "voiceLength" | "meaningfulMessage" | "tikTokFileName">) { return Number(order.voiceLength) > 0 || Boolean(order.meaningfulMessage || order.tikTokFileName); }
export function matchBatchLabel(orders: Order[], label: { source: string | null; reference: string }) {
  if (!label.reference) return [];
  return orders.filter(order => label.source === "jnt" ? order.salesChannel !== "tiktok" && order.orderNumber === label.reference : label.source === "tiktok" && order.salesChannel === "tiktok" && order.orderNumber.replace(/\D/g, "").endsWith(label.reference));
}

export function batchNeedsEnvelope(order: Pick<Order, "product" | "productType" | "remark">) { return !isPlushCharmOrder(order); }
export function batchEnvelopeName(order: Pick<Order, "plushName" | "character">, saved?: string) { return saved?.trim() || order.plushName?.trim() || order.character?.trim() || ""; }
