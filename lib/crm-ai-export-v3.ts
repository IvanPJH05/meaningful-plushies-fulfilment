import { createHash } from "node:crypto";

import { normalizePhoneNumber } from "./crm-chat-export.ts";

export const AI_EXPORT_V3 = "3.0";

type JsonObject = Record<string, unknown>;
type Attachment = { id: string; originalName?: string | null; contentType?: string | null; mediaMimeType?: string | null; sizeBytes?: number | null; mediaSizeBytes?: number | null; mediaSha256?: string | null };
type Message = { id: string; body?: string | null; direction: "INBOUND" | "OUTBOUND"; senderType: "CUSTOMER" | "TEAM" | "AI" | "SYSTEM"; messageType: string; status?: string | null; metadata?: unknown; createdAt: Date; attachments?: Attachment[] };
type Order = { id: string; source: string; externalOrderId?: string | null; orderNumber?: string | null; paymentStatus?: string; totalAmount?: unknown; currency?: string; placedAt?: Date | null; createdAt: Date; updatedAt: Date; lines?: Array<{ description: string; quantity: number; unitPrice: unknown; totalAmount: unknown; metadata?: unknown }>; payments?: Array<{ amount: unknown; paidAt?: Date | null }> };
export type AiExportConversationInput = { id: string; status: string; assignedUserId?: string | null; unreadCount: number; createdAt: Date; updatedAt: Date; lastMessageAt?: Date | null; contact: { id: string; displayName?: string | null; phone?: string | null; waId?: string | null; email?: string | null; tags?: string[] | null; source?: string | null; createdAt: Date; updatedAt: Date; orders?: Order[] }; leads?: Array<{ notes?: string | null; manualOrderLinkSentAt?: Date | null; events?: Array<{ id: string; type: string; details?: unknown; createdAt: Date }> }>; messages: Message[] };

const clean = (value: string | null | undefined) => value?.replace(/\r\n/g, "\n") || "";
const iso = (date: Date | null | undefined) => date ? date.toISOString() : null;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const secretKey = /(access[_-]?token|authorization|webhook[_-]?secret|api[_-]?key|password|credential)/i;
const sensitivePattern = /(\b\d{10,16}\b|\b\d{6}-\d{2}-\d{4}\b|bearer\s+[a-z0-9._-]+)/ig;

export function redactExportValue(value: unknown, redactSensitive = false): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactExportValue(entry, redactSensitive));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, secretKey.test(key) ? "[REDACTED]" : redactExportValue(entry, redactSensitive)]));
  if (redactSensitive && typeof value === "string") return value.replace(sensitivePattern, "[REDACTED]");
  return value;
}

function meta(message: Message) { return isObject(message.metadata) ? message.metadata : {}; }
function rawWhatsApp(message: Message) {
  const data = meta(message);
  return isObject(data.raw) ? data.raw : data;
}
function firstString(record: JsonObject, keys: string[]) { for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key] as string; return null; }
function firstNumber(record: JsonObject, keys: string[]) { for (const key of keys) if (typeof record[key] === "number" && Number.isFinite(record[key] as number)) return record[key] as number; return null; }
function sender(message: Message) { return message.direction === "INBOUND" || message.senderType === "CUSTOMER" ? "CUSTOMER" : message.senderType === "SYSTEM" ? "SYSTEM" : "TEAM"; }
function typeFor(message: Message) {
  const rawMessage = rawWhatsApp(message); const raw = (firstString(rawMessage, ["type"]) || message.messageType).toUpperCase();
  const audio = isObject(rawMessage.audio) ? rawMessage.audio : {};
  if (raw === "AUDIO") return audio.voice === true ? "VOICE_NOTE" : "AUDIO";
  if (raw === "INTERACTIVE") return "BUTTON";
  if (raw === "SYSTEM") return "SYSTEM";
  if (raw === "REVOKE") return "REVOKED";
  if (raw === "EDIT") return "EDIT";
  if (["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION", "CONTACT", "STICKER", "BUTTON", "ORDER", "PAYMENT", "REACTION"].includes(raw)) return raw;
  if (raw === "TEMPLATE") return "TEXT";
  return "UNSUPPORTED";
}
function delivery(status?: string | null) { const value = status?.toUpperCase(); return ["SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"].includes(value || "") ? value : "UNKNOWN"; }
function fallback(type: string, filename: string | null, body: string, raw: JsonObject) { if (body) return body; if (type === "REACTION") return firstString(isObject(raw.reaction) ? raw.reaction : {}, ["emoji"]) || ""; if (type === "DOCUMENT" && filename) return filename; return ({ IMAGE: "Sent an image", VIDEO: "Sent a video", VOICE_NOTE: "Sent a voice note", AUDIO: "Sent an audio file", STICKER: "Sent a sticker", UNSUPPORTED: "Unsupported WhatsApp message" } as Record<string, string>)[type] || ""; }
function rawMedia(raw: JsonObject, messageType: string) {
  const media = isObject(raw.media) ? raw.media : null;
  const rawType = messageType === "VOICE_NOTE" ? "audio" : messageType.toLowerCase();
  const direct = isObject(raw[rawType]) ? raw[rawType] as JsonObject : null;
  return direct || media || {};
}
function attachmentData(attachment: Attachment, data: JsonObject) { return { media_id: attachment.id, filename: attachment.originalName || firstString(data, ["filename", "file_name"]) || null, url: firstString(data, ["url", "link"]) || `/api/crm/inbox/attachments/${attachment.id}/original`, mime: attachment.mediaMimeType || attachment.contentType || firstString(data, ["mime_type", "mimeType"]) || null, size: attachment.mediaSizeBytes ?? attachment.sizeBytes ?? firstNumber(data, ["file_size", "size"]) ?? null, sha256: attachment.mediaSha256 || firstString(data, ["sha256", "media_sha256"]) || null }; }
function rawAttachment(data: JsonObject) { const id = firstString(data, ["id", "media_id"]) || ""; const url = firstString(data, ["url", "link"]); return { media_id: id, filename: firstString(data, ["filename", "file_name"]), url, mime: firstString(data, ["mime_type", "mimeType"]), size: firstNumber(data, ["file_size", "size"]), sha256: firstString(data, ["sha256", "media_sha256"]) }; }
function stableHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function buildAiExportV3Conversation(input: AiExportConversationInput, options: { messageFrom?: Date | null; messageTo?: Date | null; dateRangeOnly?: boolean; changedSince?: Date | null; includeRawMetadata?: boolean; redactSensitive?: boolean; lastExportedAt?: string | null }) {
  const allMessages = [...input.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const messagesToExport = options.dateRangeOnly ? allMessages.filter((message) => (!options.messageFrom || message.createdAt >= options.messageFrom) && (!options.messageTo || message.createdAt <= options.messageTo)) : allMessages;
  const phone = normalizePhoneNumber(input.contact.phone || input.contact.waId);
  const messages = messagesToExport.map((message) => {
    const data = meta(message); const raw = rawWhatsApp(message); const messageType = typeFor(message); const media = rawMedia(raw, messageType); const dbAttachments = (message.attachments || []).map((attachment) => attachmentData(attachment, media)); const attachments = dbAttachments.length ? dbAttachments : (firstString(media, ["id", "media_id", "url", "link", "filename", "file_name", "sha256"]) ? [rawAttachment(media)] : []); const attachment = attachments[0]; const rawText = clean(message.body); const reaction = isObject(raw.reaction) ? raw.reaction : {}; const quoted = firstString(reaction, ["message_id"]) || firstString(data, ["quoted_message_id", "quotedMessageId", "replyToMessageId", "contextMessageId"]);
    const reply = isObject(data.context) ? data.context : null;
    return { message_id: message.id, timestamp: message.createdAt.toISOString(), sender: sender(message), direction: message.direction, message_type: messageType, text: fallback(messageType, attachment?.filename || null, rawText, raw), caption: messageType === "TEXT" || messageType === "REACTION" ? "" : rawText, attachment_filename: attachment?.filename || null, attachment_url: attachment?.url || null, attachment_mime: attachment?.mime || null, attachment_size: attachment?.size ?? null, attachment_sha256: attachment?.sha256 || null, attachments, quoted_message_id: quoted, reply_context: reply ? { sender: typeof reply.sender === "string" ? reply.sender : "UNKNOWN", message_type: typeof reply.message_type === "string" ? reply.message_type : "UNKNOWN", text: typeof reply.text === "string" ? reply.text : "" } : null, delivery_status: delivery(message.status), deleted: data.deleted === true || data.isDeleted === true || messageType === "REVOKED", edited: data.edited === true || data.isEdited === true || messageType === "EDIT", raw_metadata: options.includeRawMetadata ? redactExportValue(message.metadata ?? {}, options.redactSensitive) : {} };
  });
  const meaningful = messages.filter((message) => !["REACTION", "STICKER", "UNSUPPORTED", "SYSTEM", "REVOKED", "EDIT"].includes(message.message_type) && message.sender !== "SYSTEM" && Boolean(message.text));
  const latestMeaningful = meaningful.at(-1) || null; const latestCustomerActivity = messages.filter((message) => message.sender === "CUSTOMER").at(-1) || null; const latestMeaningfulCustomer = meaningful.filter((message) => message.sender === "CUSTOMER").at(-1) || null; const latestMeaningfulTeam = meaningful.filter((message) => message.sender === "TEAM").at(-1) || null;
  const unanswered = latestMeaningful?.sender === "CUSTOMER" ? [...meaningful].reverse().find((message) => message.sender === "CUSTOMER") || null : null;
  const now = Date.now(); const lastAt = allMessages.at(-1)?.createdAt || input.lastMessageAt || null;
  const orders = input.contact.orders || [];
  const events = [ ...(input.leads || []).flatMap((lead) => [...(lead.events || []).map((event) => ({ event_id: event.id, type: event.type, timestamp: event.createdAt.toISOString(), source: "CRM", data: redactExportValue(event.details || {}, options.redactSensitive) })), ...(lead.manualOrderLinkSentAt ? [{ event_id: `manual-link-${lead.manualOrderLinkSentAt.toISOString()}`, type: "MANUAL_ORDER_LINK_SENT", timestamp: lead.manualOrderLinkSentAt.toISOString(), source: "CRM", data: {} }] : [])]), ...orders.map((order) => ({ event_id: order.id, type: order.source.toUpperCase() === "SHOPIFY" ? "SHOPIFY_ORDER_CREATED" : "ORDER_RECORDED", timestamp: (order.placedAt || order.createdAt).toISOString(), source: order.source.toUpperCase() === "SHOPIFY" ? "SHOPIFY" : "CRM", data: { external_order_id: order.externalOrderId || null, order_number: order.orderNumber || null } })) ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const orderExport = orders.map((order) => ({ order_id: order.id, external_order_id: order.externalOrderId || null, order_source: order.source.toUpperCase(), created_at: order.createdAt.toISOString(), updated_at: order.updatedAt.toISOString(), financial_status: order.paymentStatus || null, fulfilment_status: null, currency: order.currency || "MYR", subtotal: null, shipping_amount: null, discount_amount: null, total_amount: order.totalAmount === undefined ? null : String(order.totalAmount), amount_paid: null, amount_outstanding: null, tracking_number: null, tracking_url: null, items: (order.lines || []).map((line) => ({ description: line.description, quantity: line.quantity, unit_price: String(line.unitPrice), total_amount: String(line.totalAmount), metadata: options.includeRawMetadata ? redactExportValue(line.metadata || {}, options.redactSensitive) : {} })) }));
  const base = { conversation_id: input.id, customer: { id: input.contact.id, name: clean(input.contact.displayName) || phone.phone || "Unknown customer", phone_number: phone.phone, original_phone_number: phone.original, whatsapp_user_id: input.contact.waId || "", email: options.redactSensitive ? null : input.contact.email || null }, metadata: { first_message_at: iso(allMessages[0]?.createdAt), last_message_at: iso(lastAt), created_at: input.createdAt.toISOString(), updated_at: input.updatedAt.toISOString(), unread_count: input.unreadCount, archived: input.status === "ARCHIVED", assigned_to: input.assignedUserId || null, tags: input.contact.tags || [], labels: [], source: input.contact.source || "WHATSAPP_CLOUD_API", customer_waiting_for_reply: latestMeaningful?.sender === "CUSTOMER", waiting_since: unanswered?.timestamp || null, hours_since_last_message: lastAt ? Math.floor((now - lastAt.getTime()) / 3_600_000) : null, days_since_last_message: lastAt ? Math.floor((now - lastAt.getTime()) / 86_400_000) : null }, statistics: { total_messages: messages.length, customer_messages: messages.filter((m) => m.sender === "CUSTOMER").length, team_messages: messages.filter((m) => m.sender === "TEAM").length, system_messages: messages.filter((m) => m.sender === "SYSTEM").length, text_messages: messages.filter((m) => m.message_type === "TEXT").length, images: messages.filter((m) => m.message_type === "IMAGE").length, videos: messages.filter((m) => m.message_type === "VIDEO").length, audio_messages: messages.filter((m) => m.message_type === "AUDIO").length, voice_notes: messages.filter((m) => m.message_type === "VOICE_NOTE").length, documents: messages.filter((m) => m.message_type === "DOCUMENT").length, stickers: messages.filter((m) => m.message_type === "STICKER").length, reactions: messages.filter((m) => m.message_type === "REACTION").length, unsupported_messages: messages.filter((m) => m.message_type === "UNSUPPORTED").length, deleted_messages: messages.filter((m) => m.deleted).length, edited_messages: messages.filter((m) => m.edited).length, attachments: messages.reduce((sum, m) => sum + m.attachments.length, 0) }, latest_activity: { latest_meaningful_message: latestMeaningful, latest_customer_activity: latestCustomerActivity, latest_meaningful_customer_message: latestMeaningfulCustomer, latest_meaningful_team_message: latestMeaningfulTeam, first_unanswered_customer_message: unanswered }, messages, events, orders: orderExport, customer_profile: { total_orders: orders.length, total_paid_orders: orders.filter((order) => order.paymentStatus === "PAID").length, last_order_date: iso(orders.map((order) => order.placedAt || order.createdAt).sort((a, b) => b.getTime() - a.getTime())[0]), first_contact_date: input.contact.createdAt.toISOString(), last_contact_date: iso(lastAt) || input.contact.updatedAt.toISOString(), notes: (input.leads || []).map((lead) => clean(lead.notes)).filter(Boolean) } };
  return { ...base, export_version: AI_EXPORT_V3, conversation_revision: input.updatedAt.getTime(), last_exported_at: options.lastExportedAt || null, content_hash: stableHash(base), changed_since_last_export: Boolean(options.changedSince) };
}
