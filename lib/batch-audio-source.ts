import type { Order } from "./types";
export function batchAudioSource(order: Pick<Order, "salesChannel" | "tikTokFileDataUrl" | "meaningfulMessage">) {
  return (order.salesChannel === "tiktok" ? order.tikTokFileDataUrl : order.meaningfulMessage)?.trim() || "";
}
