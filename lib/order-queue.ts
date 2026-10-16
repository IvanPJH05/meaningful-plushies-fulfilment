import type { Order } from "./types";

export function isRemovedFromQueue(order: Pick<Order, "status" | "statusHistory" | "internalNotes">) {
  if (order.status !== "issue") return false;
  return order.statusHistory?.at(-1)?.note?.trim().toLowerCase() === "deleted order"
    || (order.internalNotes || "").split(/\r?\n/).some(note => note.trim().toLowerCase() === "deleted order");
}
