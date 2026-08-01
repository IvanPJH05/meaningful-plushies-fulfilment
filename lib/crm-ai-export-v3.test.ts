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
