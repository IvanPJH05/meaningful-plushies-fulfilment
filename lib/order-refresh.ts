import type { Order } from "./types";

// An older detail/realtime response can arrive after a saved stage change.
// Keep newer data and retain assets omitted from lightweight summaries.
export function mergeRefreshedOrder(current: Order, incoming?: Order): Order {
  if (!incoming || Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt)) return current;
  return { ...current, ...incoming };
}
