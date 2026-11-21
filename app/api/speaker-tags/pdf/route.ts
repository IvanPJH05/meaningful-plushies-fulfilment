import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MM = 72 / 25.4;
const WIDTH = 20 * MM;
const HEIGHT = 10 * MM;
const MARGIN = 1.5 * MM;

function printable(input: unknown) {
  return typeof input === "string"
    ? input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim()
    : "";
}

function fittedSize(text: string, font: PDFFont, preferred: number) {
  return Math.min(preferred, (WIDTH - MARGIN * 2) / font.widthOfTextAtSize(text, 1));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.orders) || !body.orders.length || body.orders.length > 100) {
      return NextResponse.json({ error: "Select between 1 and 100 orders for speaker tags." }, { status: 400 });
    }
    const orders = body.orders.map((order: { orderLabel?: unknown; character?: unknown } | null) => ({
      orderLabel: printable(order?.orderLabel), character: printable(order?.character),
    }));
    if (orders.some((order: { orderLabel: string; character: string }) => !order.orderLabel || !order.character || order.orderLabel.length > 40 || order.character.length > 60)) {
      return NextResponse.json({ error: "Each speaker tag needs an order number and chosen character. Check the selected orders before printing." }, { status: 400 });
    }
    const pdf = await PDFDocument.create();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const order of orders) {
      const page = pdf.addPage([WIDTH, HEIGHT]);
      const orderSize = fittedSize(order.orderLabel, bold, 10);
      const characterSize = fittedSize(order.character, bold, 7.5);
      page.drawText(order.orderLabel, { x: (WIDTH - bold.widthOfTextAtSize(order.orderLabel, orderSize)) / 2, y: HEIGHT - MARGIN - 10, size: orderSize, font: bold, color: rgb(0, 0, 0) });
      page.drawText(order.character, { x: (WIDTH - bold.widthOfTextAtSize(order.character, characterSize)) / 2, y: MARGIN + 1, size: characterSize, font: bold, color: rgb(0, 0, 0) });
    }
    return new Response(Buffer.from(await pdf.save()), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=speaker-tags-20x10mm.pdf",
      "Cache-Control": "no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Could not generate speaker tags. Please try again." }, { status: 400 });
  }
}
