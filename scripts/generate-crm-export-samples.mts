import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { buildChatExportRecord, recordToStructuredText, recordsToCsv } from "../lib/crm-chat-export.ts";

const record = buildChatExportRecord({
  id: "sample_conversation_001",
  contact: { displayName: "Sample Customer", phone: "012-345 6789" },
  leads: [{ paymentStatus: "PARTIALLY_PAID", paidAmount: 50, requestedCharacter: "Hunnie", requestedVoice: "10 seconds" }],
  orders: [{ paymentStatus: "UNPAID", totalAmount: 125 }],
  messages: [
    { direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", body: "I want Hunnie 10 seconds. How much?", createdAt: new Date("2026-08-01T09:00:00Z") },
    { direction: "OUTBOUND", senderType: "TEAM", messageType: "TEXT", body: "Please complete this customization form and send RM50 deposit.", createdAt: new Date("2026-08-01T09:05:00Z") },
    { direction: "INBOUND", senderType: "CUSTOMER", messageType: "DOCUMENT", body: "Deposit receipt RM50", createdAt: new Date("2026-08-01T10:00:00Z"), attachments: [{ id: "sample_receipt", originalName: "deposit-receipt.pdf", contentType: "application/pdf" }] },
  ],
}, new Date("2026-08-02T00:00:00Z"));

const out = join(process.cwd(), "output", "crm-export-samples");
await mkdir(out, { recursive: true });
await writeFile(join(out, "conversation-sample.json"), `${JSON.stringify([record], null, 2)}\n`);
await writeFile(join(out, "conversation-summary-sample.csv"), recordsToCsv([record]));

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Courier);
const page = pdf.addPage([595.28, 841.89]);
let y = 800;
for (const sourceLine of recordToStructuredText(record).split("\n")) {
  const words = sourceLine.replace(/[^\x20-\x7E]/g, "?").split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, 7) < 520) line = candidate;
    else { page.drawText(line, { x: 38, y, size: 7, font, color: rgb(0.06, 0.1, 0.16) }); y -= 9; line = word; }
  }
  page.drawText(line, { x: 38, y, size: 7, font, color: rgb(0.06, 0.1, 0.16) });
  y -= 9;
}
await writeFile(join(out, "conversation-sample.pdf"), await pdf.save());
