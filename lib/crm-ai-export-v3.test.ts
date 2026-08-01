import assert from "node:assert/strict";
import test from "node:test";

import { buildAiExportV3Conversation, type AiExportConversationInput } from "./crm-ai-export-v3.ts";

const at = (value: string) => new Date(`${value}Z`);
const base = (): AiExportConversationInput => ({ id: "conversation_1", status: "OPEN", unreadCount: 1, createdAt: at("2026-07-31T16:00:00"), updatedAt: at("2026-08-01T01:00:00"), contact: { id: "customer_1", displayName: "Aina", phone: "0123456789", waId: "60123456789", email: "aina@example.com", tags: ["website"], createdAt: at("2026-07-31T16:00:00"), updatedAt: at("2026-08-01T01:00:00") }, messages: [] });

test("AI Export v3 flattens document attachments and removes secrets from raw metadata", () => {
  const conversation = base();
  conversation.messages.push({ id: "m1", direction: "INBOUND", senderType: "CUSTOMER", messageType: "DOCUMENT", status: "READ", body: "", metadata: { access_token: "should-not-leak", filename: "M2U_20260720_1514.pdf" }, createdAt: at("2026-08-01T01:00:00"), attachments: [{ id: "a1", originalName: "M2U_20260720_1514.pdf", contentType: "application/pdf", sizeBytes: 33, mediaSha256: "abc" }] });
  const record = buildAiExportV3Conversation(conversation, { includeRawMetadata: true });
  assert.equal(record.messages[0].attachment_filename, "M2U_20260720_1514.pdf");
  assert.equal(record.messages[0].text, "M2U_20260720_1514.pdf");
  assert.equal((record.messages[0].raw_metadata as { access_token: string }).access_token, "[REDACTED]");
});

test("AI Export v3 keeps date-range-only messages in chronological order", () => {
  const conversation = base();
  conversation.messages.push({ id: "old", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "old", createdAt: at("2026-07-31T15:59:59") }, { id: "today", direction: "OUTBOUND", senderType: "TEAM", messageType: "STICKER", body: "", createdAt: at("2026-08-01T01:00:00") });
  const record = buildAiExportV3Conversation(conversation, { dateRangeOnly: true, messageFrom: at("2026-08-01T00:00:00"), messageTo: at("2026-08-01T23:59:59") });
  assert.deepEqual(record.messages.map((message) => message.message_id), ["today"]);
  assert.equal(record.messages[0].message_type, "STICKER");
});

test("normalizes raw WhatsApp media, reactions, stickers, and voice notes", () => {
  const conversation = base();
  conversation.messages.push(
    { id: "receipt", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "", metadata: { raw: { type: "document", document: { id: "886433417392244", url: "https://media.example/receipt", sha256: "receipt-hash", filename: "M2U_20260720_1514.pdf", mime_type: "application/pdf" } } }, createdAt: at("2026-08-01T01:00:00") },
    { id: "voice", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "", metadata: { raw: { type: "audio", audio: { id: "voice-id", url: "https://media.example/voice", voice: true, mime_type: "audio/ogg" } } }, createdAt: at("2026-08-01T02:00:00") },
    { id: "reaction", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "", metadata: { raw: { type: "reaction", reaction: { emoji: "❤️", message_id: "receipt" } } }, createdAt: at("2026-08-01T03:00:00") },
    { id: "sticker", direction: "OUTBOUND", senderType: "TEAM", messageType: "TEXT", body: "", metadata: { raw: { type: "sticker", sticker: { id: "sticker-id", url: "https://media.example/sticker", mime_type: "image/webp", sha256: "sticker-hash" } } }, createdAt: at("2026-08-01T04:00:00") },
  );
  const record = buildAiExportV3Conversation(conversation, { includeRawMetadata: true });
  assert.equal(record.messages[0].message_type, "DOCUMENT");
  assert.equal(record.messages[0].attachment_filename, "M2U_20260720_1514.pdf");
  assert.equal(record.messages[0].attachment_url, "https://media.example/receipt");
  assert.equal(record.messages[1].message_type, "VOICE_NOTE");
  assert.equal(record.messages[2].message_type, "REACTION");
  assert.equal(record.messages[2].text, "❤️");
  assert.equal(record.messages[2].quoted_message_id, "receipt");
  assert.equal(record.messages[3].message_type, "STICKER");
  assert.equal(record.messages[3].attachment_mime, "image/webp");
  assert.equal(record.metadata.customer_waiting_for_reply, true);
  assert.equal(record.statistics.attachments, 3);
  assert.equal(record.statistics.voice_notes, 1);
  assert.equal(record.statistics.reactions, 1);
});
