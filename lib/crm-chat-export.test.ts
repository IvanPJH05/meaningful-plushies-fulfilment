import assert from "node:assert/strict";
import test from "node:test";

import { buildChatExportRecord, chatExportRecordSchema, recordToStructuredText, recordsToCsv } from "./crm-chat-export.ts";

const at = (value: string) => new Date(`${value}Z`);

test("builds a structured paid conversation record with receipt evidence", () => {
  const record = buildChatExportRecord({
    id: "conversation_123",
    contact: { displayName: "Aina", phone: "012-345 6789" },
    leads: [{ paymentStatus: "PAID", paidAmount: 125, paymentConfirmedAt: at("2026-08-01T06:00:00") }],
    orders: [{ paymentStatus: "PAID", totalAmount: 125, placedAt: at("2026-08-01T06:00:00") }],
    messages: [
      { direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "I want Hunnie 10 seconds", createdAt: at("2026-08-01T01:00:00") },
      { direction: "OUTBOUND", senderType: "TEAM", messageType: "TEXT", body: "Here is the customization form", createdAt: at("2026-08-01T02:00:00") },
      { direction: "INBOUND", senderType: "CUSTOMER", messageType: "DOCUMENT", body: "Bank payment receipt RM125", createdAt: at("2026-08-01T06:00:00"), attachments: [{ id: "attachment_1", originalName: "receipt.pdf", contentType: "application/pdf" }] },
    ],
  }, at("2026-08-02T00:00:00"));

  assert.equal(record.customer.phone_number, "+60123456789");
  assert.equal(record.summary.order_stage, "FULLY_PAID");
  assert.equal(record.summary.payment_evidence_found, "YES");
  assert.equal(record.summary.payment_evidence_attachment, "receipt.pdf");
  assert.equal(record.summary.character, "HUNNIE");
  assert.equal(record.summary.speaker_duration, "10_SECONDS");
  assert.doesNotThrow(() => chatExportRecordSchema.parse(record));
});

test("does not treat a form sent as a completed form", () => {
  const record = buildChatExportRecord({
    id: "conversation_form",
    contact: { waId: "60112223333" },
    messages: [
      { direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "How much is a plushie?", createdAt: at("2026-08-01T01:00:00") },
      { direction: "OUTBOUND", senderType: "TEAM", messageType: "TEXT", body: "Please complete this Google Form", createdAt: at("2026-08-01T02:00:00") },
    ],
  });
  assert.equal(record.summary.form_type, "GOOGLE_FORM");
  assert.equal(record.summary.form_sent, true);
  assert.equal(record.summary.form_completed, false);
  assert.equal(record.summary.order_stage, "FORM_SENT");
});

test("exports validated JSON-shaped records and CSV with the required fields", () => {
  const record = buildChatExportRecord({ id: "conversation_csv", contact: { phone: "60129998877" }, messages: [] });
  const structured = recordToStructuredText(record);
  const csv = recordsToCsv([record]);
  assert.match(structured, /CUSTOMER_RECORD_START/);
  assert.match(structured, /CUSTOMER_MESSAGES_END/);
  assert.match(csv, /conversation_id,customer_name,phone_number/);
  assert.match(csv, /conversation_csv/);
});
