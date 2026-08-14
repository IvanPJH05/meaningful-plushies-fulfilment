import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";

type ParsedRow = { paidDate: string; description: string; moneyIn: number; moneyOut: number; balance: number | null };
const money = (value: string) => Number(value.replace(/,/g, ""));
const dateFor = (dayMonth: string, fallbackYear: number) => {
  const [day, month] = dayMonth.split("/").map(Number);
  return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

function parseRows(text: string, bank: string): ParsedRow[] {
  const year = Number((text.match(/(?:statement date|tarikh penyata)[^\d]*(?:\d{1,2})[\s/]+(?:\d{1,2}|[a-z]{3,9})[\s/]+(20\d{2})/i) || [])[1] || new Date().getFullYear());
  const rows: ParsedRow[] = [];
  for (const line of text.split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const maybank = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})\s*([+-])\s*([\d,]+\.\d{2})(?:\s*DR)?$/i);
    if (maybank) { rows.push({ paidDate: dateFor(maybank[1], year), description: maybank[2], moneyIn: maybank[4] === "+" ? money(maybank[3]) : 0, moneyOut: maybank[4] === "-" ? money(maybank[3]) : 0, balance: money(maybank[5]) }); continue; }
    const publicBank = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?:\s*DR)?$/i);
    if (publicBank && /\b(?:CR|DR)\b|^DEP-ECP\b/i.test(publicBank[2])) { const credit = /^DEP-ECP\b/i.test(publicBank[2]) || (/\bCR\b/i.test(publicBank[2]) && !/\bDR\b/i.test(publicBank[2])); rows.push({ paidDate: dateFor(publicBank[1], year), description: publicBank[2], moneyIn: credit ? money(publicBank[3]) : 0, moneyOut: credit ? 0 : money(publicBank[3]), balance: money(publicBank[4]) }); }
  }
  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const file = body.get("file"); const requestedBank = String(body.get("bank") || "");
    if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "Choose a PDF statement." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Choose a PDF smaller than 15 MB." }, { status: 400 });
    const text = (await pdf(Buffer.from(await file.arrayBuffer()))).text;
    const bank = requestedBank || (/maybank|malayan banking/i.test(text) ? "Maybank" : /public bank|penyata akaun/i.test(text) ? "Public Bank" : "");
    if (!bank) return NextResponse.json({ error: "This PDF is not recognised. Choose Maybank or Public Bank." }, { status: 400 });
    const rows = parseRows(text, bank);
    if (!rows.length) return NextResponse.json({ error: "No transaction rows were found in this PDF." }, { status: 400 });
    return NextResponse.json({ bank, rows });
  } catch { return NextResponse.json({ error: "Could not read this PDF." }, { status: 400 }); }
}
