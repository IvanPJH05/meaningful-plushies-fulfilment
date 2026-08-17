import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse/lib/pdf-parse.js";

type ParsedPurchase = { purchaseDate: string; description: string; amount: number; reference: string };

const isoDate = (value: string) => {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
};

function productDescription(text: string, reference: string) {
  const details = text.match(/Order Details\s*([\s\S]*?)(?:End of receipt|$)/i)?.[1] ?? "";
  const lines = details.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const useful = lines.filter((line) => !/^(?:no\.?product|variation|net product price|qty|subtotal|order details|\d+|rm\s*[\d,.]+)$/i.test(line) && !/^[\d,.]+\d+\s*\d+\s*[\d,.]+$/.test(line));
  const textDescription = useful.slice(0, 3).join(" ").replace(/\s+(?:\d+(?:\.\d+)?\s*){2,}$/g, "").trim();
  return textDescription.slice(0, 220) || `Shopee order ${reference || "purchase"}`;
}

function parseShopeeReceipts(text: string): ParsedPurchase[] {
  const chunks = text.split(/(?=ORDER RECEIPT)/i).filter((chunk) => /(?:order receipt|shopee)/i.test(chunk));
  const rows: ParsedPurchase[] = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const reference = chunk.match(/Order SN:\s*([A-Z0-9-]+)/i)?.[1] ?? chunk.match(/Receipt Number:\s*([A-Z0-9-]+)/i)?.[1] ?? "";
    const date = isoDate(chunk.match(/Receipt Date:\s*([^\n]+)/i)?.[1] ?? "") || isoDate(chunk.match(/Order Paid Date:\s*([^\n]+)/i)?.[1] ?? "");
    const total = chunk.match(/Total Paid\s*(?:\r?\n)?\s*RM\s*([\d,]+\.\d{2})/i)?.[1] ?? chunk.match(/Total Paid\s*RM\s*([\d,]+\.\d{2})/i)?.[1];
    const amount = Number(total?.replace(/,/g, ""));
    if (date && reference && Number.isFinite(amount) && amount > 0) rows.push({ purchaseDate: date, description: productDescription(chunk, reference), amount, reference });
  }
  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File) || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) return NextResponse.json({ error: "Choose a Shopee PDF." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Choose a PDF smaller than 15 MB." }, { status: 400 });
    const text = (await pdf(Buffer.from(await file.arrayBuffer()))).text;
    const rows = parseShopeeReceipts(text);
    if (!rows.length) return NextResponse.json({ error: "No Shopee order receipts were found in this PDF. The file was not imported." }, { status: 400 });
    return NextResponse.json({ rows });
  } catch { return NextResponse.json({ error: "Could not read this Shopee PDF." }, { status: 400 }); }
}
