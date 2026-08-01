import { z } from "zod";

export const CRM_EXPORT_VERSION = "2.0";

const messageTypeValues = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "LOCATION", "CONTACT", "STICKER", "BUTTON", "ORDER", "PAYMENT", "REACTION", "UNKNOWN"] as const;
const deliveryStatusValues = ["SENT", "DELIVERED", "READ", "FAILED"] as const;

export const chatExportMessageSchema = z.object({
  message_id: z.string(),
  timestamp: z.string(),
  sender: z.enum(["CUSTOMER", "TEAM", "SYSTEM"]),
  message_type: z.enum(messageTypeValues),
  text: z.string(),
  caption: z.string(),
  attachment_filename: z.string().nullable(),
  attachment_url: z.string().nullable(),
  attachment_mime: z.string().nullable(),
  attachment_size: z.number().int().nonnegative().nullable(),
  quoted_message_id: z.string().nullable(),
  delivery_status: z.enum(deliveryStatusValues).nullable(),
  deleted: z.boolean(),
  edited: z.boolean(),
  // These preserve every attachment and the original CRM-specific values without
  // asking a consumer to guess what an omitted field meant.
  attachments: z.array(z.object({ id: z.string(), filename: z.string().nullable(), url: z.string().nullable(), mime: z.string().nullable(), size: z.number().int().nonnegative().nullable() })),
  crm_message_type: z.string(),
  crm_delivery_status: z.string().nullable(),
  raw_metadata: z.unknown().nullable(),
});

export const chatExportRecordSchema = z.object({
  conversation_id: z.string(),
  customer: z.object({ id: z.string(), name: z.string(), phone_number: z.string(), original_phone_number: z.string() }),
  metadata: z.object({ first_message_at: z.string().nullable(), last_message_at: z.string().nullable(), unread_count: z.number().int().nonnegative(), tags: z.array(z.string()), assigned_to: z.string().nullable(), archived: z.boolean(), labels: z.array(z.string()), created_at: z.string(), updated_at: z.string() }),
  messages: z.array(chatExportMessageSchema),
  events: z.array(z.object({ type: z.string(), timestamp: z.string(), event_id: z.string().optional(), details: z.unknown().optional() })),
  customer_profile: z.object({ total_orders: z.number().int().nonnegative(), total_paid_orders: z.number().int().nonnegative(), last_order_date: z.string().nullable(), first_contact_date: z.string().nullable(), last_contact_date: z.string().nullable(), notes: z.array(z.string()) }),
});

export type ChatExportRecord = z.infer<typeof chatExportRecordSchema>;

type ExportAttachmentInput = { id: string; originalName?: string | null; contentType?: string | null; mediaMimeType?: string | null; sizeBytes?: number | null; mediaSizeBytes?: number | null };
type ExportMessageInput = { id: string; body?: string | null; direction: "INBOUND" | "OUTBOUND"; senderType: "CUSTOMER" | "TEAM" | "AI" | "SYSTEM"; messageType: string; status?: string | null; metadata?: unknown; createdAt: Date; attachments?: ExportAttachmentInput[] };
type ExportEventInput = { id: string; type: string; details?: unknown; createdAt: Date };
type ExportLeadInput = { notes?: string | null; manualOrderLinkSentAt?: Date | null; events?: ExportEventInput[] };
type ExportOrderInput = { id: string; source: string; externalOrderId?: string | null; orderNumber?: string | null; paymentStatus?: string; placedAt?: Date | null; createdAt: Date; payments?: Array<{ id: string; provider: string; externalPaymentId?: string | null; amount: unknown; currency: string; paidAt?: Date | null; createdAt: Date }> };
export type ExportConversationInput = { id: string; status: string; assignedUserId?: string | null; unreadCount: number; createdAt: Date; updatedAt: Date; contact: { id: string; displayName?: string | null; phone?: string | null; waId?: string | null; tags?: string[] | null; createdAt: Date; updatedAt: Date; orders?: ExportOrderInput[] }; leads?: ExportLeadInput[]; messages: ExportMessageInput[] };

const clean = (value: string | null | undefined) => value?.replace(/\r\n/g, "\n") || "";
const iso = (value: Date | null | undefined) => value ? value.toISOString() : null;

export function normalizePhoneNumber(value: string | null | undefined) {
  const original = clean(value);
  const digits = original.replace(/[^\d+]/g, "");
  if (!digits) return { phone: "", original };
  if (digits.startsWith("+")) return { phone: `+${digits.slice(1).replace(/\D/g, "")}`, original };
  const plain = digits.replace(/\D/g, "");
  if (plain.startsWith("60")) return { phone: `+${plain}`, original };
  if (plain.startsWith("0")) return { phone: `+60${plain.slice(1)}`, original };
  return { phone: `+${plain}`, original };
}

function senderFor(message: ExportMessageInput): "CUSTOMER" | "TEAM" | "SYSTEM" {
  if (message.direction === "INBOUND" || message.senderType === "CUSTOMER") return "CUSTOMER";
  if (message.senderType === "SYSTEM") return "SYSTEM";
  return "TEAM";
}

function messageType(value: string): z.infer<typeof chatExportMessageSchema>["message_type"] {
  const type = value.toUpperCase();
  if ((messageTypeValues as readonly string[]).includes(type)) return type as z.infer<typeof chatExportMessageSchema>["message_type"];
  if (type === "TEMPLATE") return "TEXT";
  return "UNKNOWN";
}

function deliveryStatus(value: string | null | undefined): z.infer<typeof chatExportMessageSchema>["delivery_status"] {
  const status = value?.toUpperCase();
  return (deliveryStatusValues as readonly string[]).includes(status || "") ? status as z.infer<typeof chatExportMessageSchema>["delivery_status"] : null;
}

function metadataValue(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === "string") return record[key];
  const context = record.context;
  if (context && typeof context === "object" && !Array.isArray(context)) {
    const contextRecord = context as Record<string, unknown>;
    for (const key of keys) if (typeof contextRecord[key] === "string") return contextRecord[key];
  }
  return undefined;
}

function metadataBoolean(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return keys.some((key) => record[key] === true);
}

function attachmentRecord(attachment: ExportAttachmentInput) {
  return {
    id: attachment.id,
    filename: attachment.originalName ?? null,
    url: `/api/crm/inbox/attachments/${attachment.id}/original`,
    mime: attachment.mediaMimeType || attachment.contentType || null,
    size: attachment.mediaSizeBytes ?? attachment.sizeBytes ?? null,
  };
}

function factualEvents(conversation: ExportConversationInput) {
  const events: Array<{ type: string; timestamp: string; event_id?: string; details?: unknown }> = [];
  for (const lead of conversation.leads || []) {
    for (const event of lead.events || []) events.push({ type: event.type, timestamp: event.createdAt.toISOString(), event_id: event.id, details: event.details });
    if (lead.manualOrderLinkSentAt) events.push({ type: "MANUAL_ORDER_LINK_SENT", timestamp: lead.manualOrderLinkSentAt.toISOString() });
  }
  for (const order of conversation.contact.orders || []) {
    events.push({ type: order.source.toLowerCase() === "shopify" ? "SHOPIFY_ORDER_CREATED" : "ORDER_RECORDED", timestamp: (order.placedAt || order.createdAt).toISOString(), event_id: order.id, details: { source: order.source, external_order_id: order.externalOrderId || null, order_number: order.orderNumber || null, payment_status: order.paymentStatus || null } });
    for (const payment of order.payments || []) events.push({ type: "PAYMENT_RECORDED", timestamp: (payment.paidAt || payment.createdAt).toISOString(), event_id: payment.id, details: { provider: payment.provider, external_payment_id: payment.externalPaymentId || null, amount: String(payment.amount), currency: payment.currency } });
  }
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function buildChatExportRecord(conversation: ExportConversationInput): ChatExportRecord {
  const messages = [...conversation.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const phone = normalizePhoneNumber(conversation.contact.phone || conversation.contact.waId);
  const orders = conversation.contact.orders || [];
  const paidOrders = orders.filter((order) => order.paymentStatus === "PAID");
  const orderDates = orders.map((order) => order.placedAt || order.createdAt).sort((a, b) => b.getTime() - a.getTime());
  const notes = (conversation.leads || []).map((lead) => clean(lead.notes)).filter(Boolean);
  const record: ChatExportRecord = {
    conversation_id: conversation.id,
    customer: { id: conversation.contact.id, name: clean(conversation.contact.displayName) || phone.phone || "Unknown customer", phone_number: phone.phone, original_phone_number: phone.original },
    metadata: { first_message_at: iso(messages[0]?.createdAt), last_message_at: iso(messages.at(-1)?.createdAt), unread_count: conversation.unreadCount, tags: conversation.contact.tags || [], assigned_to: conversation.assignedUserId || null, archived: conversation.status === "ARCHIVED", labels: [], created_at: conversation.createdAt.toISOString(), updated_at: conversation.updatedAt.toISOString() },
    messages: messages.map((message) => {
      const attachments = (message.attachments || []).map(attachmentRecord);
      const attachment = attachments[0];
      return { message_id: message.id, timestamp: message.createdAt.toISOString(), sender: senderFor(message), message_type: messageType(message.messageType), text: clean(message.body), caption: message.messageType.toUpperCase() === "TEXT" ? "" : clean(message.body), attachment_filename: attachment?.filename || null, attachment_url: attachment?.url || null, attachment_mime: attachment?.mime || null, attachment_size: attachment?.size ?? null, quoted_message_id: metadataValue(message.metadata, ["quoted_message_id", "quotedMessageId", "replyToMessageId", "contextMessageId"]) || null, delivery_status: deliveryStatus(message.status), deleted: metadataBoolean(message.metadata, ["deleted", "is_deleted", "isDeleted"]), edited: metadataBoolean(message.metadata, ["edited", "is_edited", "isEdited"]), attachments, crm_message_type: message.messageType, crm_delivery_status: message.status || null, raw_metadata: message.metadata ?? null };
    }),
    events: factualEvents(conversation),
    customer_profile: { total_orders: orders.length, total_paid_orders: paidOrders.length, last_order_date: iso(orderDates[0]), first_contact_date: conversation.contact.createdAt.toISOString(), last_contact_date: iso(messages.at(-1)?.createdAt) || conversation.contact.updatedAt.toISOString(), notes },
  };
  return chatExportRecordSchema.parse(record);
}
