import { degrees, PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";

import { code128Modules, code128UnitCount } from "@/lib/code128";
import { orderBarcodeValue } from "@/lib/order-barcode";

export const runtime = "nodejs";

const MM = 72 / 25.4;
const A6_WIDTH = 105 * MM;
const A6_HEIGHT = 148 * MM;

type PackingPdfOrder = {
  id?: string;
  orderNumber?: string;
  setIndicator?: string;
  salesChannel?: string;
  character?: string;
  plushName?: string;
  customerName?: string;
  phone?: string;
  remark?: string;
  shippingLabelUrl?: string;
  source?: string;
  isCod?: boolean;
  address?: string;
  codAmount?: number;
};

function value(input: unknown) {
  if (typeof input !== "string") return "";
  // The built-in print font supports WinAnsi only. Keep the text readable
  // (including names with accents) and omit decorative emoji such as a blue
  // heart, rather than allowing one character to stop the whole batch.
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
}

function fitLines(text: string, maxWidth: number, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, maxLines: number) {
  const words = (text || "-").replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  const last = lines.at(-1);
  if (last && lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[lines.length - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`;
  return lines;
}

function drawBarcode(page: PDFPage, text: string, x: number, y: number, width: number, height: number) {
  const modules = code128Modules(text);
  // Code 128 needs empty quiet zones before and after the bars. The scanner
  // value remains MP-<order>, but its bars are wider than Code 39 at A6 size.
  const quietZoneUnits = 10;
  const scale = width / (code128UnitCount(text) + quietZoneUnits * 2);
  let cursor = x + quietZoneUnits * scale;
  for (const segment of modules) {
    const barWidth = segment.width * scale;
    if (segment.black) page.drawRectangle({ x: cursor, y, width: barWidth, height, color: rgb(0, 0, 0) });
    cursor += barWidth;
  }
}

function drawPackingSlip(page: PDFPage, order: PackingPdfOrder, regular: PDFFont, bold: PDFFont) {
  const margin = 8 * MM;
  const right = A6_WIDTH - margin;
  const drawText = (text: string, x: number, y: number, size: number, useBold = false, color = rgb(0, 0, 0)) => page.drawText(text, { x, y, size, font: useBold ? bold : regular, color });
  // Match the A6 preview: all markers are black and white and the source is
  // a bordered label at the top right.
  const source = (value(order.source) || (/tiktok/i.test(value(order.salesChannel)) ? "TIKTOK SHOP" : "SHOPIFY")).toUpperCase();
  const rawOrderNumber = value(order.orderNumber);
  const tikTokShortNumber = /tiktok/i.test(value(order.salesChannel))
    ? rawOrderNumber.match(/\b(TT\d+)\b\s+(\d+)/i)
    : null;
  const shownOrderNumber = tikTokShortNumber ? `${tikTokShortNumber[1].toUpperCase()} ${tikTokShortNumber[2].slice(-4)}` : rawOrderNumber;
  const orderLabel = `${tikTokShortNumber ? "" : "#"}${shownOrderNumber || "-"}${value(order.setIndicator) ? ` ${value(order.setIndicator)}` : ""}`;
  const top = A6_HEIGHT - margin;

  if (order.isCod) page.drawText("COD", { x: 23 * MM, y: 40 * MM, size: 92, font: bold, color: rgb(0.82, 0.82, 0.82), rotate: degrees(-36) });

  drawText("ORDER ID", margin, top - 9, 9, true);
  const sourceFontSize = 16;
  const sourcePaddingX = 4;
  const sourcePaddingY = 3;
  const sourceWidth = bold.widthOfTextAtSize(source, sourceFontSize) + sourcePaddingX * 2;
  const sourceHeight = sourceFontSize + sourcePaddingY * 2;
  page.drawRectangle({ x: right - sourceWidth, y: top - sourceHeight, width: sourceWidth, height: sourceHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.75 });
  drawText(source, right - sourceWidth + sourcePaddingX, top - sourceHeight + sourcePaddingY, sourceFontSize, true);
  if (order.isCod) {
    const cod = "COD - COLLECT ON DELIVERY";
    const codFontSize = 7;
    const codWidth = bold.widthOfTextAtSize(cod, codFontSize) + 8;
    page.drawRectangle({ x: right - codWidth, y: top - sourceHeight - 14, width: codWidth, height: 10, color: rgb(0, 0, 0) });
    drawText(cod, right - codWidth + 4, top - sourceHeight - 11, codFontSize, true, rgb(1, 1, 1));
  }
  drawText(orderLabel, margin, top - 38, 38, true);
  const headerRuleY = top - 70;
  page.drawLine({ start: { x: margin, y: headerRuleY }, end: { x: right, y: headerRuleY }, thickness: 2.25, color: rgb(0, 0, 0) });

  let y = headerRuleY - 25;
  const fields: Array<[string, string, number, number]> = [
    ["CHARACTER:", value(order.character) || "-", 18, 1],
    ["PLUSH NAME:", value(order.plushName) || "-", 18, 1],
    ["CUSTOMER:", value(order.customerName) || "-", 13, 2],
    ["PHONE:", value(order.phone) || "-", 13, 1],
    ["REMARK:", value(order.remark) || "-", 13, 2],
  ];
  for (const [label, fieldValue, size, maxLines] of fields) {
    drawText(label, margin, y, 8, true);
    const lines = fitLines(fieldValue, right - margin, bold, size, maxLines);
    lines.forEach((line, index) => drawText(line, margin, y - 15 - index * (size + 2), size, true));
    const fieldHeight = 28 + Math.max(0, lines.length - 1) * (size + 2);
    y -= fieldHeight;
    page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.35, color: rgb(0.72, 0.72, 0.72) });
    y -= 9;
  }

  const barcode = orderBarcodeValue(order);
  // A centered half-page barcode leaves a generous blank area on both sides
  // and makes the bars taller, so it is much easier for the packing scanner
  // to read on a thermal printer.
  const barcodeWidth = A6_WIDTH / 2;
  const barcodeHeight = 14 * MM;
  const barcodeX = (A6_WIDTH - barcodeWidth) / 2;
  drawBarcode(page, barcode, barcodeX, margin + 10, barcodeWidth, barcodeHeight);
  const barcodeTextWidth = bold.widthOfTextAtSize(barcode, 8);
  drawText(barcode, (A6_WIDTH - barcodeTextWidth) / 2, margin + 2, 8, true);
}

function drawInstructionPage(page: PDFPage, order: PackingPdfOrder, regular: PDFFont, bold: PDFFont, pairedWithSlip: boolean) {
  const margin = 10 * MM;
  const right = A6_WIDTH - margin;
  const drawText = (text: string, x: number, y: number, size: number, useBold = false, color = rgb(0, 0, 0)) => page.drawText(text, { x, y, size, font: useBold ? bold : regular, color });
  const orderName = `#${value(order.orderNumber) || "-"}`;
  const title = `PLEASE PRINT ${order.isCod ? "COD " : ""}SHIPPING LABEL`;
  drawText(title, margin, A6_HEIGHT - margin - 22, 16, true);
  drawText(`FOR ORDER ${orderName}`, margin, A6_HEIGHT - margin - 45, 17, true);
  if (pairedWithSlip) {
    drawText("↑", A6_WIDTH / 2 - 14, A6_HEIGHT - margin - 82, 38, true);
    drawText("PAIR WITH THE PACKING SLIP ABOVE", margin, A6_HEIGHT - margin - 104, 10, true);
  }
  let y = A6_HEIGHT - margin - (pairedWithSlip ? 140 : 82);
  if (order.isCod) {
    const amount = Number.isFinite(order.codAmount) ? Number(order.codAmount) : 0;
    drawText(`COD AMOUNT TO COLLECT: RM ${amount.toFixed(2)}`, margin, y, 14, true);
    y -= 30;
  }
  const details: Array<[string, string]> = [
    ["CUSTOMER", value(order.customerName) || "-"],
    ["PHONE", value(order.phone) || "-"],
    ["ADDRESS", value(order.address) || "NO ADDRESS SAVED"],
  ];
  for (const [label, detail] of details) {
    drawText(label, margin, y, 8, true);
    const lines = fitLines(detail, right - margin, regular, 12, label === "ADDRESS" ? 4 : 2);
    lines.forEach((line, index) => drawText(line, margin, y - 16 - index * 14, 12, false));
    y -= 30 + Math.max(0, lines.length - 1) * 14;
    page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.4, color: rgb(0.68, 0.68, 0.68) });
    y -= 12;
  }
}

async function labelBytes(url: string, origin: string) {
  const parsed = new URL(url);
  if (parsed.origin !== origin) throw new Error("A shipping label must come from this fulfilment system.");
  const response = await fetch(parsed, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !/application\/pdf/i.test(contentType)) throw new Error("The paired shipping-label PDF could not be loaded.");
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orders?: PackingPdfOrder[]; mode?: "packing" | "labels" | "both" };
    const orders = Array.isArray(body.orders) ? body.orders : [];
    const mode = body.mode === "packing" || body.mode === "labels" || body.mode === "both" ? body.mode : "both";
    if (!orders.length) return NextResponse.json({ ok: false, error: "Choose at least one packing slip." }, { status: 400 });
    if (orders.length > 100) return NextResponse.json({ ok: false, error: "Print up to 100 orders at a time." }, { status: 400 });

    const output = await PDFDocument.create();
    const regular = await output.embedFont(StandardFonts.Helvetica);
    const bold = await output.embedFont(StandardFonts.HelveticaBold);
    const origin = new URL(request.url).origin;
    for (const order of orders) {
      if (mode !== "labels") {
        const slip = output.addPage([A6_WIDTH, A6_HEIGHT]);
        drawPackingSlip(slip, order, regular, bold);
      }
      if (mode === "packing") continue;
      const labelUrl = value(order.shippingLabelUrl);
      if (!order.isCod && labelUrl) {
        const source = await PDFDocument.load(await labelBytes(labelUrl, origin));
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => output.addPage(page));
      } else {
        const instruction = output.addPage([A6_WIDTH, A6_HEIGHT]);
        drawInstructionPage(instruction, order, regular, bold, mode === "both");
      }
    }
    const pdfBytes = await output.save();
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=meaningful-plushies-packing-and-labels.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create the print PDF." }, { status: 500 });
  }
}
