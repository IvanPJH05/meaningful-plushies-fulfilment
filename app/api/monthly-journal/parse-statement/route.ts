import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse/lib/pdf-parse.js";

type ParsedRow = { paidDate: string; description: string; moneyIn: number; moneyOut: number; balance: number | null };
const money = (value: string) => Number(value.replace(/,/g, ""));
const dateFor = (dayMonth: string, fallbackYear: number) => {
  const [day, month] = dayMonth.split("/").map(Number);
  return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const monthNumber = (month: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month.slice(0, 3).toLowerCase()) + 1;
const statementDate = (text: string) => {
  const match = text.match(/(?:statement\s*date|tarikh\s*penyata)[\s\S]{0,300}?(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})/i);
  return match ? { month: monthNumber(match[2]), year: Number(match[3]) } : null;
};
const statementYear = (dayMonth: string, statement: { month: number; year: number } | null) => {
  if (!statement) return new Date().getFullYear();
  const month = Number(dayMonth.split("/")[1]);
  return month > statement.month ? statement.year - 1 : statement.year;
};

type PdfTextItem = { str: string; transform: number[] };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfParser = (buffer: Buffer, options?: { pagerender: (page: PdfPage) => Promise<string> }) => Promise<{ text: string }>;
const parsePdf = pdf as unknown as PdfParser;

async function publicBankCoordinateText(page: PdfPage) {
  const content = await page.getTextContent();
  const items = content.items.filter((item) => item.str.trim());
  const pageText = items.map((item) => item.str).join(" ");
  const date = statementDate(pageText);
  const rows = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const y = Math.round(item.transform[5] * 10);
    rows.set(y, [...(rows.get(y) ?? []), item]);
  }
  const output = [date ? `PBSTATEMENT|${date.month}|${date.year}` : ""];
  for (const [position, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
    // Public Bank keeps its branch address above the ledger and footer below it.
    // The actual transaction table sits between these two areas on every page.
    if (position >= 6800 || position <= 800) continue;
    const cells = row.sort((a, b) => a.transform[4] - b.transform[4]);
    const dateCell = cells.filter((item) => item.transform[4] < 80).map((item) => item.str).join(" ").trim();
    const description = cells.filter((item) => item.transform[4] >= 80 && item.transform[4] < 320).map((item) => item.str).join(" ").trim();
    const debit = cells.filter((item) => item.transform[4] >= 320 && item.transform[4] < 390).map((item) => item.str).find((item) => /^[\d,]+\.\d{2}$/.test(item)) ?? "";
    const credit = cells.filter((item) => item.transform[4] >= 390 && item.transform[4] < 480).map((item) => item.str).find((item) => /^[\d,]+\.\d{2}$/.test(item)) ?? "";
    const balance = cells.filter((item) => item.transform[4] >= 480).map((item) => item.str).find((item) => /^[\d,]+\.\d{2}$/.test(item)) ?? "";
    if (dateCell || description || debit || credit || balance) output.push(`PBROW|${dateCell}|${description}|${debit}|${credit}|${balance}`);
  }
  return output.join("\n");
}

function parsePublicBankCoordinates(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let statement: { month: number; year: number } | null = null;
  let lastPaidDate = "";
  let current: ParsedRow | null = null;
  const pageNoise = /^(?:this is a computer|jln kelang|dilindungi|protected by|nombor akaun|tarikh penyata|muka surat|urus niaga|date transaction|penyata akaun|ringkasan|tegasan|closing balance|baki harian|terima kasih|daily and closing|thank you|anda boleh|you may view|perhatian|attention)/i;
  const flush = () => { if (current && (current.moneyIn || current.moneyOut) && current.description) rows.push(current); current = null; };
  for (const line of text.split(/\r?\n/)) {
    const statementMatch = line.match(/^PBSTATEMENT\|(\d+)\|(20\d{2})$/);
    if (statementMatch) { statement = { month: Number(statementMatch[1]), year: Number(statementMatch[2]) }; continue; }
    const parts = line.split("|");
    if (parts[0] !== "PBROW") continue;
    const [, rawDate, rawDescription, debit, credit, balance] = parts;
    const date = rawDate.replace(/\s*\/\s*/g, "/").match(/^\d{1,2}\/\d{1,2}$/)?.[0] ?? "";
    const description = rawDescription.replace(/\s+/g, " ").trim();
    if (date) lastPaidDate = dateFor(date, statementYear(date, statement));
    if (debit || credit) {
      flush();
      current = { paidDate: lastPaidDate, description: pageNoise.test(description) ? "" : description, moneyIn: credit ? money(credit) : 0, moneyOut: debit ? money(debit) : 0, balance: balance ? money(balance) : null };
    } else if (current && description && !/^balance\b/i.test(description) && !pageNoise.test(description)) {
      current.description = `${current.description} ${description}`.trim();
    }
  }
  flush();
  return rows;
}

function parseRows(text: string): ParsedRow[] {
  const year = statementDate(text)?.year ?? new Date().getFullYear();
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
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const text = (await parsePdf(fileBuffer)).text;
    const bank = requestedBank || (/maybank|malayan banking/i.test(text) ? "Maybank" : /public bank|penyata akaun/i.test(text) ? "Public Bank" : "");
    if (!bank) return NextResponse.json({ error: "This PDF is not recognised. Choose Maybank or Public Bank." }, { status: 400 });
    const rows = bank === "Public Bank" ? parsePublicBankCoordinates((await parsePdf(fileBuffer, { pagerender: publicBankCoordinateText })).text) : parseRows(text);
    if (!rows.length) return NextResponse.json({ error: "No transaction rows were found in this PDF." }, { status: 400 });
    return NextResponse.json({ bank, rows });
  } catch { return NextResponse.json({ error: "Could not read this PDF." }, { status: 400 }); }
}
