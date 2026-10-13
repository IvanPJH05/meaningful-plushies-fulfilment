import type { Order } from "./types";

// Financial fields, stage/history, identifiers and integration metadata are
// deliberately excluded. Editing a note must never repost an accounting sale.
const textFields = new Set([
  "customerName", "phone", "address", "product", "character", "setIndicator",
  "idWebsiteLink", "plushName", "remark", "meaningfulNote", "internalNotes",
  "courier", "trackingNumber", "photoName", "tikTokFileName", "tikTokFileType",
]);
const assetFields = new Set(["photoDataUrl", "tikTokFileDataUrl"]);
export type OrderEdit = { orderId: string; expectedUpdatedAt: string; patch: Partial<Order> };

export function parseOrderEdit(value: unknown): OrderEdit {
  const fail = () => { throw new Error("INVALID_ORDER_EDIT"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const body = value as Record<string, unknown>;
  if (typeof body.orderId !== "string" || !body.orderId || body.orderId.length > 200
    || typeof body.expectedUpdatedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(body.expectedUpdatedAt)
    || !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) return fail();
  const entries = Object.entries(body.patch);
  if (!entries.length || entries.length > 25) return fail();
  for (const [key, field] of entries) {
    if (textFields.has(key)) {
      if (typeof field !== "string" || field.length > 20_000) return fail();
    } else if (assetFields.has(key)) {
      if (typeof field !== "string" || field.length > 7_000_000
        || (field !== "" && !/^data:[^,]*;base64,/.test(field))) return fail();
    } else if (key === "voiceLength") {
      if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || field > 86_400) return fail();
    } else if (key === "voiceUploadStatus") {
      if (typeof field !== "string" || !["missing", "received", "checked"].includes(field)) return fail();
    } else return fail();
  }
  return { orderId: body.orderId, expectedUpdatedAt: body.expectedUpdatedAt, patch: Object.fromEntries(entries) };
}
