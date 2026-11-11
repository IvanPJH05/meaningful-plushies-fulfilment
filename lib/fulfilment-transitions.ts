import type { Order, OrderStatus } from "./types";

/**
 * Preparing a production print batch means the order is ready for its voice
 * message. The workflow is the same regardless of where the sale came from.
 */
export function shouldAdvanceAfterProductionPrint(order: Pick<Order, "status">): order is Pick<Order, "status"> & { status: "new_order" } {
  return order.status === "new_order";
}

export const productionPrintNextStatus: OrderStatus = "uploading_audio";
