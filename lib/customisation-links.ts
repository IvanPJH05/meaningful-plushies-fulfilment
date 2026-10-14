import type { Order } from "./types";

/** Cart-level references are ambiguous when there is more than one line. */
export function sessionIdForOrder(order: Pick<Order, "customisationSessionId">, orders: Pick<Order, "customisationSessionId">[], sessionIds: string[]) {
  return order.customisationSessionId || (orders.length === 1 && sessionIds.length === 1 ? sessionIds[0] : "");
}

export function customisationSessionIds(order: Record<string, unknown>) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nodes = record(order.lineItems).nodes;
  const lines = Array.isArray(order.line_items) ? order.line_items : Array.isArray(order.lineItems) ? order.lineItems : Array.isArray(nodes) ? nodes : [];
  const ids = (attributes: unknown) => {
    const values = Array.isArray(attributes) ? attributes : Object.entries(record(attributes)).map(([key, value]) => ({ key, value }));
    return values.flatMap(attribute => {
      const value = record(attribute);
      const key = String(value.key || value.name || "").trim().toLowerCase();
      const id = String(value.value || "").trim();
      return ["customisation_session_id", "mp_customisation_session_id"].includes(key) && id ? [id] : [];
    });
  };
  return [...new Set([...lines.flatMap(line => {
    const item = record(line);
    return ids(item.customAttributes ?? item.custom_attributes ?? item.properties);
  }), ...ids(order.customAttributes ?? order.custom_attributes ?? order.note_attributes)])];
}
