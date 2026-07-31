import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

const PAGE_WIDTH = 595.28;
const PAGE_MIN_HEIGHT = 841.89;
const MARGIN = 42;
const BODY_FONT_SIZE = 9;
const BODY_LINE_HEIGHT = 13;

function printableText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n\r\t]/g, "?")
    .replace(/\r\n/g, "\n");
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function wrapText(text: string, width: number, font: PDFFont, size: number) {
  const lines: string[] = [];
  for (const paragraph of printableText(text).split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
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

export async function GET() {
  try {
    const business = await ensureDefaultBusiness();
    const conversations = await prisma.conversation.findMany({
      where: { businessId: business.id },
      include: {
        contact: { select: { displayName: true, phone: true, waId: true } },
        messages: {
          select: { body: true, direction: true, senderType: true, messageType: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const exportLabel = dateLabel(new Date());

    for (const conversation of conversations) {
      const chatLines = conversation.messages.flatMap((message) => {
        const sender = message.direction === "INBOUND"
          ? "Customer"
          : message.senderType === "AI" ? "AI" : "Team";
        const content = printableText(message.body).trim() || `[${message.messageType.toLowerCase()}]`;
        return wrapText(`${dateLabel(message.createdAt)}  ${sender}: ${content}`, PAGE_WIDTH - MARGIN * 2, regular, BODY_FONT_SIZE);
      });
      const pageHeight = Math.max(PAGE_MIN_HEIGHT, MARGIN * 2 + 76 + Math.max(1, chatLines.length) * BODY_LINE_HEIGHT);
      const page = pdf.addPage([PAGE_WIDTH, pageHeight]);
      const title = printableText(conversation.contact.displayName || conversation.contact.phone || conversation.contact.waId || "WhatsApp customer");
      const phone = printableText(conversation.contact.phone || conversation.contact.waId || "No phone number");
      let y = pageHeight - MARGIN;

      page.drawText(title, { x: MARGIN, y: y - 16, size: 16, font: bold, color: rgb(0.06, 0.13, 0.2) });
      y -= 35;
      page.drawText(`${phone}  |  ${conversation.messages.length} message${conversation.messages.length === 1 ? "" : "s"}`, { x: MARGIN, y, size: 9, font: regular, color: rgb(0.3, 0.4, 0.52) });
      y -= 18;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.7, color: rgb(0.78, 0.84, 0.92) });
      y -= 16;

      if (!chatLines.length) {
        page.drawText("No messages in this chat.", { x: MARGIN, y, size: BODY_FONT_SIZE, font: regular, color: rgb(0.3, 0.4, 0.52) });
      } else {
        for (const line of chatLines) {
          page.drawText(line, { x: MARGIN, y, size: BODY_FONT_SIZE, font: regular, color: rgb(0.08, 0.13, 0.2) });
          y -= BODY_LINE_HEIGHT;
        }
      }
      page.drawText(`Meaningful Plushies - exported ${exportLabel}`, { x: MARGIN, y: MARGIN - 14, size: 8, font: regular, color: rgb(0.42, 0.5, 0.6) });
    }

    const bytes = await pdf.save();
    return new Response(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="meaningful-plushies-chats.pdf"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Chats could not be exported." }, { status: 500 });
  }
}
