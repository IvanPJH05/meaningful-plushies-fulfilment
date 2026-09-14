import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MM = 72 / 25.4;
const A6_WIDTH = 105 * MM;
const A6_HEIGHT = 148 * MM;

type PackingPdfOrder = {
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
};

const code39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnnw", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn",
  "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function barcodeValue(order: PackingPdfOrder) {
  if (order.salesChannel === "tiktok") {
    const tikTok = value(order.orderNumber).toUpperCase().match(/\bTT\d+\b/);
    if (tikTok) return `MP-${tikTok[0]}`;
  }
  const number = value(order.orderNumber).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return `MP-${number || "ORDER"}`;
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
  const encoded = `*${text.toUpperCase().replace(/[^A-Z0-9 .\-$/+%]/g, "")}*`;
  const units = [...encoded].reduce((total, character) => total + [...(code39[character] ?? code39["-"])].reduce((sum, unit) => sum + (unit === "w" ? 3 : 1), 0) + 1, 0);
  const scale = width / units;
  let cursor = x;
  for (const character of encoded) {
    const pattern = code39[character] ?? code39["-"];
    for (let index = 0; index < pattern.length; index += 1) {
      const barWidth = (pattern[index] === "w" ? 3 : 1) * scale;
      if (index % 2 === 0) page.drawRectangle({ x: cursor, y, width: barWidth, height, color: rgb(0, 0, 0) });
      cursor += barWidth;
    }
    cursor += scale;
  }
}

function drawPackingSlip(page: PDFPage, order: PackingPdfOrder, regular: PDFFont, bold: PDFFont) {
  const margin = 8 * MM;
  const right = A6_WIDTH - margin;
  const drawText = (text: string, x: number, y: number, size: number, useBold = false) => page.drawText(text, { x, y, size, font: useBold ? bold : regular, color: rgb(0, 0, 0) });
  const source = value(order.source) || (order.salesChannel === "tiktok" ? "TIKTOK SHOP" : "SHOPIFY");
  const orderLabel = `#${value(order.orderNumber) || "-"}${value(order.setIndicator) ? ` ${value(order.setIndicator)}` : ""}`;

  drawText("ORDER ID", margin, A6_HEIGHT - margin - 8, 8, true);
  const sourceWidth = bold.widthOfTextAtSize(source, 12);
  drawText(source, right - sourceWidth, A6_HEIGHT - margin - 10, 12, true);
  if (order.isCod) {
    const cod = "COD";
    const codWidth = bold.widthOfTextAtSize(cod, 7) + 8;
    page.drawRectangle({ x: right - codWidth, y: A6_HEIGHT - margin - 25, width: codWidth, height: 10, color: rgb(0, 0, 0) });
    drawText(cod, right - codWidth + 4, A6_HEIGHT - margin - 22, 7, true);
  }
  drawText(orderLabel, margin, A6_HEIGHT - margin - 34, 34, true);
  page.drawLine({ start: { x: margin, y: A6_HEIGHT - margin - 43 }, end: { x: right, y: A6_HEIGHT - margin - 43 }, thickness: 1.5, color: rgb(0, 0, 0) });

  let y = A6_HEIGHT - margin - 58;
  const fields: Array<[string, string, number, number]> = [
    ["CHARACTER:", value(order.character) || "-", 15, 1],
    ["PLUSH NAME:", value(order.plushName) || "-", 15, 1],
    ["CUSTOMER:", value(order.customerName) || "-", 11, 2],
    ["PHONE:", value(order.phone) || "-", 11, 1],
    ["REMARK:", value(order.remark) || "-", 10, 3],
  ];
  for (const [label, fieldValue, size, maxLines] of fields) {
    drawText(label, margin, y, 7, true);
    const lines = fitLines(fieldValue, right - margin, bold, size, maxLines);
    lines.forEach((line, index) => drawText(line, margin, y - 12 - index * (size + 2), size, true));
    const fieldHeight = 20 + Math.max(0, lines.length - 1) * (size + 2);
    y -= fieldHeight;
    page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.35, color: rgb(0.72, 0.72, 0.72) });
    y -= 8;
  }

  const barcode = barcodeValue(order);
  const barcodeHeight = 10 * MM;
  drawBarcode(page, barcode, margin + 5, margin + 10, right - margin - 10, barcodeHeight);
  const barcodeWidth = bold.widthOfTextAtSize(barcode, 6);
  drawText(barcode, (A6_WIDTH - barcodeWidth) / 2, margin + 4, 6, true);
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
    const body = await request.json() as { orders?: PackingPdfOrder[] };
    const orders = Array.isArray(body.orders) ? body.orders : [];
    if (!orders.length) return NextResponse.json({ ok: false, error: "Choose at least one packing slip." }, { status: 400 });
    if (orders.length > 100) return NextResponse.json({ ok: false, error: "Print up to 100 orders at a time." }, { status: 400 });

    const output = await PDFDocument.create();
    const regular = await output.embedFont(StandardFonts.Helvetica);
    const bold = await output.embedFont(StandardFonts.HelveticaBold);
    const origin = new URL(request.url).origin;
    for (const order of orders) {
      const slip = output.addPage([A6_WIDTH, A6_HEIGHT]);
      drawPackingSlip(slip, order, regular, bold);
      const labelUrl = value(order.shippingLabelUrl);
      if (!labelUrl) continue;
      const source = await PDFDocument.load(await labelBytes(labelUrl, origin));
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
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
