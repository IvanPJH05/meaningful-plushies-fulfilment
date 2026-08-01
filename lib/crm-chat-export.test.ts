import assert from "node:assert/strict";
import test from "node:test";

import { buildChatExportRecord, chatExportRecordSchema } from "./crm-chat-export.ts";

const at = (value: string) => new Date(`${value}Z`);

test("exports complete factual conversation records without classification", () => {
  const record = buildChatExportRecord({
    id: "conversation_123", status: "ARCHIVED", unreadCount: 2, assignedUserId: "user_1", createdAt: at("2026-08-01T00:00:00"), updatedAt: at("2026-08-02T00:00:00"),
    contact: { id: "contact_1", displayName: "Aina", phone: "012-345 6789", tags: ["Instagram"], createdAt: at("2026-08-01T00:00:00"), updatedAt: at("2026-08-02T00:00:00"), orders: [{ id: "order_1", source: "SHOPIFY", externalOrderId: "gid://shopify/Order/1", orderNumber: "#1001", paymentStatus: "PAID", createdAt: at("2026-08-01T03:00:00"), payments: [{ id: "payment_1", provider: "shopify", externalPaymentId: "pay_1", amount: 125, currency: "MYR", paidAt: at("2026-08-01T03:01:00"), createdAt: at("2026-08-01T03:01:00") }] }], },
    leads: [{ notes: "Asked for blue thread", manualOrderLinkSentAt: at("2026-08-01T02:00:00"), events: [{ id: "event_1", type: "CUSTOMISATION_LINK_SENT", createdAt: at("2026-08-01T01:00:00"), details: { link: "https://example.test" } }] }],
    messages: [{ id: "message_2", direction: "OUTBOUND", senderType: "TEAM", messageType: "DOCUMENT", status: "DELIVERED", body: "Your receipt", metadata: { quotedMessageId: "message_1", edited: true }, createdAt: at("2026-08-01T02:00:00"), attachments: [{ id: "attachment_1", originalName: "receipt.pdf", contentType: "application/pdf", sizeBytes: 200 }] }, { id: "message_1", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", status: "READ", body: "I want a plushie", createdAt: at("2026-08-01T01:00:00") }],
  });

  assert.equal(record.customer.phone_number, "+60123456789");
  assert.equal(record.metadata.archived, true);
  assert.equal(record.messages[0].message_id, "message_1");
  assert.equal(record.messages[1].attachment_filename, "receipt.pdf");
  assert.equal(record.messages[1].quoted_message_id, "message_1");
  assert.equal(record.messages[1].edited, true);
  assert.equal(record.customer_profile.total_paid_orders, 1);
  assert.deepEqual(record.events.map((event) => event.type), ["CUSTOMISATION_LINK_SENT", "MANUAL_ORDER_LINK_SENT", "SHOPIFY_ORDER_CREATED", "PAYMENT_RECORDED"]);
  assert.equal("summary" in record, false);
  assert.doesNotThrow(() => chatExportRecordSchema.parse(record));
});

test("preserves unrecognised raw message facts rather than classifying them", () => {
  const record = buildChatExportRecord({ id: "conversation_raw", status: "OPEN", unreadCount: 0, createdAt: at("2026-08-01T00:00:00"), updatedAt: at("2026-08-01T00:00:00"), contact: { id: "contact_raw", waId: "60112223333", createdAt: at("2026-08-01T00:00:00"), updatedAt: at("2026-08-01T00:00:00") }, messages: [{ id: "message_raw", direction: "INBOUND", senderType: "CUSTOMER", messageType: "REACTION", status: "QUEUED", body: "👍", metadata: { reaction: "👍" }, createdAt: at("2026-08-01T01:00:00") }] });
  assert.equal(record.messages[0].message_type, "REACTION");
  assert.equal(record.messages[0].delivery_status, null);
  assert.deepEqual(record.messages[0].raw_metadata, { reaction: "👍" });
});
