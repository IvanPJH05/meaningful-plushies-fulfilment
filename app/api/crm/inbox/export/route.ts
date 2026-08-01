import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

import { buildChatExportRecord, recordToStructuredText, recordsToCsv, type ChatExportRecord } from "@/lib/crm-chat-export";
import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

type ExportFormat = "pdf" | "csv" | "json";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 38;
const BODY_SIZE = 8;
const BODY_LINE_HEIGHT = 11;

function dateRangeValue(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function exportFormat(value: string | null): ExportFormat {
  return value === "csv" || value === "json" ? value : "pdf";
}

// Helvetica is used for the PDF's machine labels. Unsupported glyphs are retained in
// JSON/CSV unchanged and represented as their Unicode code point in the PDF so an
// uncommon emoji or script never breaks, or silently disappears from, an export.
function pdfSafe(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n\r\t]/g, (character) => `\\u{${character.codePointAt(0)?.toString(16).toUpperCase()}}`);
}

function wrapText(text: string, width: number, font: PDFFont, size: number) {
  const lines: string[] = [];
  for (const sourceLine of pdfSafe(text).replace(/\r\n/g, "\n").split("\n")) {
    if (!sourceLine) { lines.push(""); continue; }
    let line = "";
    for (const word of sourceLine.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue; }
      let remainder = word;
      while (remainder) {
        let length = remainder.length;
        while (length > 1 && font.widthOfTextAtSize(remainder.slice(0, length), size) > width) length -= 1;
        lines.push(remainder.slice(0, length));
        remainder = remainder.slice(length);
      }
      line = "";
    }
    if (line) lines.push(line);
  }
  return lines;
}

function pageHeader(page: ReturnType<PDFDocument["addPage"]>, record: ChatExportRecord, pageNumber: number, font: PDFFont, bold: PDFFont) {
  page.drawText(pdfSafe(record.customer.name), { x: MARGIN, y: PAGE_HEIGHT - 25, size: 11, font: bold, color: rgb(0.05, 0.15, 0.28) });
  page.drawText(pdfSafe(`${record.customer.phone_number || "No phone"} | Conversation ${record.conversation_id} | Page ${pageNumber}`), { x: MARGIN, y: PAGE_HEIGHT - 39, size: 7.5, font, color: rgb(0.32, 0.42, 0.54) });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 46 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 46 }, thickness: 0.5, color: rgb(0.76, 0.83, 0.91) });
}

async function buildPdf(records: ChatExportRecord[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const record of records) {
    const lines = wrapText(recordToStructuredText(record), PAGE_WIDTH - MARGIN * 2, font, BODY_SIZE);
    let pageNumber = 1;
    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageHeader(page, record, pageNumber, font, bold);
    let y = PAGE_HEIGHT - 62;
    for (const line of lines) {
      if (y < MARGIN + BODY_LINE_HEIGHT) {
        pageNumber += 1;
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        pageHeader(page, record, pageNumber, font, bold);
        y = PAGE_HEIGHT - 62;
      }
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0.08, 0.12, 0.18) });
      y -= BODY_LINE_HEIGHT;
    }
  }
  return pdf.save();
}

export async function GET(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const { searchParams } = new URL(request.url);
    const dateField = searchParams.get("dateField") === "last_texted" ? "last_texted" : "first_message";
    const from = dateRangeValue(searchParams.get("from"));
    const to = dateRangeValue(searchParams.get("to"), true);
    const requestedStatus = searchParams.get("status") as "Cold" | "Warm" | "Paid" | "Unpaid" | "all" | null;
    const status = requestedStatus === "Cold" || requestedStatus === "Warm" || requestedStatus === "Paid" || requestedStatus === "Unpaid" ? requestedStatus : "all";
    const format = exportFormat(searchParams.get("format"));
    const conversations = await prisma.conversation.findMany({
      where: { businessId: business.id },
      include: {
        contact: { select: { displayName: true, phone: true, waId: true, orders: { select: { paymentStatus: true, totalAmount: true, placedAt: true, payments: { select: { amount: true, paidAt: true } } } } } },
        leads: { orderBy: { updatedAt: "desc" }, take: 1, select: { stage: true, temperature: true, paymentStatus: true, paidAmount: true, paymentConfirmedAt: true, requestedCharacter: true, requestedVoice: true, notes: true } },
        messages: { select: { body: true, direction: true, senderType: true, messageType: true, status: true, createdAt: true, attachments: { select: { id: true, originalName: true, contentType: true, externalMediaId: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });
    const exportedAt = new Date();
    const records: ChatExportRecord[] = [];
    for (const conversation of conversations) {
      try {
        records.push(buildChatExportRecord(conversation, exportedAt));
      } catch (error) {
        // Keep processing the remaining customers, but record the exact failure for support.
        console.error("CRM conversation export record failed", { conversationId: conversation.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const selectedRecords = records.filter((record) => {
      if (status !== "all" && record.metadata.crm_status !== status) return false;
      const targetDate = dateField === "last_texted"
        ? [...record.messages].reverse().find((message) => message.sender === "TEAM")?.timestamp
        : record.metadata.first_message_at;
      const target = targetDate ? new Date(targetDate) : null;
      return Boolean(target && (!from || target >= from) && (!to || target <= to));
    });

    if (format === "json") {
      return new Response(JSON.stringify(selectedRecords, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="meaningful-plushies-conversations.json"', "cache-control": "no-store" } });
    }
    if (format === "csv") {
      return new Response(recordsToCsv(selectedRecords), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="meaningful-plushies-conversation-summary.csv"', "cache-control": "no-store" } });
    }
    const bytes = await buildPdf(selectedRecords);
    const fileBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(fileBody, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="meaningful-plushies-conversations.pdf"', "cache-control": "no-store" } });
  } catch (error) {
    console.error("CRM conversation export failed", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Chats could not be exported." }, { status: 500 });
  }
}
