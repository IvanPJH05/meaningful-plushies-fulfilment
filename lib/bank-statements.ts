export type ParsedBankStatementLine = {
  rowNumber: number;
  transactionDate: string;
  description: string;
  reference: string;
  moneyIn: number;
  moneyOut: number;
  balance: number | null;
  rawData: Record<string, string>;
  warnings: string[];
  suggestedEvent: string;
  suggestedAccount: string;
};

function parseStatementCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current);
  rows.push(row);
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findColumn(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.findIndex((header) => normalizedCandidates.includes(normalizeHeader(header)));
}

function parseMoney(value: string) {
  const raw = value.trim();
  if (!raw) return 0;
  const isNegative = raw.includes("(") || raw.includes("-") || /\bdr\b/i.test(raw);
  const numeric = Number(raw.replace(/rm/gi, "").replace(/[(),\s]/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  return isNegative ? -Math.abs(numeric) : numeric;
}

function moneyAbs(value: string) {
  return Math.abs(parseMoney(value));
}

function inferStatementYear(text: string) {
  const shortYear = text.match(/\b\d{1,2}\/\d{1,2}\/(\d{2})\b/)?.[1];
  if (shortYear) return `20${shortYear}`;
  const statementYear = text.match(/statement date\s*\d{1,2}\s+[a-z]+\s+(20\d{2})/i)?.[1];
  if (statementYear) return statementYear;
  const year = text.match(/\b(20\d{2})\b/)?.[1];
  return year ?? new Date().getFullYear().toString();
}

function parseDate(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function parseStatementDate(dayMonth: string, year: string) {
  const match = dayMonth.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return parseDate(dayMonth);
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function textAt(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function suggestLine(description: string, moneyIn: number, moneyOut: number) {
  const text = description.toLowerCase();
  const ownAccountTransfer = (
    (text.includes("mp gift shop") && text.includes("duitnow trsf cr")) ||
    (text.includes("mp gift shop") && text.includes("duitnow trsf dr")) ||
    (text.includes("ivan phang") && text.includes("transfer fr a/c"))
  );
  if (ownAccountTransfer) return { suggestedEvent: "internal_transfer", suggestedAccount: "Owner Transfer" };
  if (moneyIn > 0) {
    if (text.includes("stripe")) return { suggestedEvent: "payment_processor_paid", suggestedAccount: "Stripe" };
    if (text.includes("xendit")) return { suggestedEvent: "payment_processor_paid", suggestedAccount: "Xendit" };
    if (text.includes("owner") || text.includes("capital")) return { suggestedEvent: "payment_processor_paid", suggestedAccount: "Owner's Equity" };
    if (/\b(duitnow|transfer to a\/c|trsf cr|qr-)\b/i.test(description)) return { suggestedEvent: "ignore", suggestedAccount: "Bank transfer sales already recorded" };
    return { suggestedEvent: "other_income", suggestedAccount: "Other Income" };
  }
  if (text.includes("meta") || text.includes("facebook") || text.includes("facebk") || text.includes("fb.me")) return { suggestedEvent: "marketing_expense", suggestedAccount: "Meta Ads" };
  if (text.includes("tiktok") || text.includes("tik tok")) return { suggestedEvent: "marketing_expense", suggestedAccount: "TikTok Ads" };
  if (text.includes("shopify") || text.includes("canva") || text.includes("chatgpt") || text.includes("domain") || text.includes("hosting") || text.includes("upload")) return { suggestedEvent: "expense", suggestedAccount: "Software Expenses" };
  if (text.includes("jnt") || text.includes("j&t")) return { suggestedEvent: "expense", suggestedAccount: "JnT (Carriage Outwards)" };
  if (text.includes("box") || text.includes("speaker") || text.includes("nfc") || text.includes("plush") || text.includes("pack")) return { suggestedEvent: "inventory_purchase", suggestedAccount: "Packaging" };
  return { suggestedEvent: "expense", suggestedAccount: "Operating Expense" };
}

export function parseBankStatementCsv(text: string): ParsedBankStatementLine[] {
  const parsed = parseStatementCsv(text);
  if (parsed.length < 2) return [];
  const headers = parsed[0].map((header) => header.trim());
  const dateIndex = findColumn(headers, ["date", "transaction date", "posting date", "value date", "txn date", "bank date", "bank_date"]);
  const descriptionIndex = findColumn(headers, ["description", "details", "transaction details", "narration", "particulars", "merchant", "bank description", "bank_description"]);
  const referenceIndex = findColumn(headers, ["reference", "ref", "transaction id", "cheque no", "id", "bank reference", "bank_reference", "bank transaction id", "bank_transaction_id"]);
  const debitIndex = findColumn(headers, ["debit", "withdrawal", "money out", "paid out", "payment"]);
  const creditIndex = findColumn(headers, ["credit", "deposit", "money in", "paid in", "receipt"]);
  const amountIndex = findColumn(headers, ["amount", "transaction amount", "value", "bank amount", "bank_amount"]);
  const directionIndex = findColumn(headers, ["direction", "bank direction", "bank_direction", "money direction"]);
  const balanceIndex = findColumn(headers, ["balance", "running balance", "available balance"]);

  return parsed.slice(1).map((row, index) => {
    const rawData = headers.reduce<Record<string, string>>((data, header, headerIndex) => {
      data[header || `Column ${headerIndex + 1}`] = row[headerIndex]?.trim() ?? "";
      return data;
    }, {});
    const date = parseDate(textAt(row, dateIndex));
    const description = textAt(row, descriptionIndex) || row.filter(Boolean).join(" ");
    const debit = Math.abs(parseMoney(textAt(row, debitIndex)));
    const credit = Math.abs(parseMoney(textAt(row, creditIndex)));
    const signedAmount = parseMoney(textAt(row, amountIndex));
    const direction = textAt(row, directionIndex).toLowerCase().replace(/\s+/g, "_");
    const moneyOut = direction === "money_out" ? Math.abs(signedAmount) : debit > 0 ? debit : signedAmount < 0 ? Math.abs(signedAmount) : 0;
    const moneyIn = direction === "money_in" ? Math.abs(signedAmount) : credit > 0 ? credit : signedAmount > 0 && debitIndex < 0 && creditIndex < 0 ? signedAmount : 0;
    const warnings = [
      !date ? "No date detected" : "",
      !description ? "No description detected" : "",
      moneyIn <= 0 && moneyOut <= 0 ? "No money in/out detected" : "",
    ].filter(Boolean);
    const suggestion = suggestLine(description, moneyIn, moneyOut);
    return {
      rowNumber: index + 2,
      transactionDate: date,
      description,
      reference: textAt(row, referenceIndex),
      moneyIn,
      moneyOut,
      balance: balanceIndex >= 0 ? parseMoney(textAt(row, balanceIndex)) : null,
      rawData,
      warnings,
      ...suggestion,
    };
  });
}

export function parseBankStatementText(text: string): ParsedBankStatementLine[] {
  const year = inferStatementYear(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: ParsedBankStatementLine[] = [];
  let current: ParsedBankStatementLine | null = null;
  let lastPublicBankDate = "";

  function pushCurrent() {
    if (current && current.description && (current.moneyIn > 0 || current.moneyOut > 0)) {
      const suggestion = suggestLine(current.description, current.moneyIn, current.moneyOut);
      rows.push({ ...current, ...suggestion });
    }
    current = null;
  }

  for (const line of lines) {
    if (/^(beginning balance|balance b\/f|balance c\/f|ending balance|baki legar)/i.test(line)) {
      pushCurrent();
      continue;
    }
    const maybank = line.match(/^(\d{1,2}\/\d{1,2})\s*(.+?)\s*([\d,]+\.\d{2})\s*([+-])\s*([\d,]+\.\d{2})(?:\s*DR)?$/i);
    if (maybank) {
      pushCurrent();
      const amount = moneyAbs(maybank[3]);
      current = {
        rowNumber: rows.length + 1,
        transactionDate: parseStatementDate(maybank[1], year),
        description: maybank[2].trim(),
        reference: "",
        moneyIn: maybank[4] === "+" ? amount : 0,
        moneyOut: maybank[4] === "-" ? amount : 0,
        balance: moneyAbs(maybank[5]),
        rawData: { line },
        warnings: [],
        suggestedEvent: "",
        suggestedAccount: "",
      };
      continue;
    }
    const publicBank = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/i);
    const publicBankCompressed = line.match(/^(\d{1,2}\/\d{1,2})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})(.+)$/i);
    if ((publicBank && /\b(CR|DR)\b/i.test(publicBank[2])) || (publicBankCompressed && /\b(CR|DR)\b/i.test(publicBankCompressed[4]))) {
      pushCurrent();
      const date = publicBank?.[1] ?? publicBankCompressed?.[1] ?? "";
      const description = publicBank?.[2] ?? publicBankCompressed?.[4]?.trim() ?? "";
      const amountText = publicBank?.[3] ?? publicBankCompressed?.[2] ?? "0";
      const balanceText = publicBank?.[4] ?? publicBankCompressed?.[3] ?? "0";
      const isCredit = /\bCR\b/i.test(description) && !/\bDR\b/i.test(description.replace(/\bCR\b/i, ""));
      const amount = moneyAbs(amountText);
      current = {
        rowNumber: rows.length + 1,
        transactionDate: parseStatementDate(date, year),
        description,
        reference: "",
        moneyIn: isCredit ? amount : 0,
        moneyOut: isCredit ? 0 : amount,
        balance: moneyAbs(balanceText),
        rawData: { line },
        warnings: [],
        suggestedEvent: "",
        suggestedAccount: "",
      };
      lastPublicBankDate = date;
      continue;
    }
    const publicBankSameDate = line.match(/^([\d,]+\.\d{2})\s*([\d,]+\.\d{2})(.+)$/i);
    if (lastPublicBankDate && publicBankSameDate && /\b(CR|DR)\b/i.test(publicBankSameDate[3]) && !/^balance/i.test(publicBankSameDate[3])) {
      pushCurrent();
      const description = publicBankSameDate[3].trim();
      const isCredit = /\bCR\b/i.test(description) && !/\bDR\b/i.test(description.replace(/\bCR\b/i, ""));
      const amount = moneyAbs(publicBankSameDate[1]);
      current = {
        rowNumber: rows.length + 1,
        transactionDate: parseStatementDate(lastPublicBankDate, year),
        description,
        reference: "",
        moneyIn: isCredit ? amount : 0,
        moneyOut: isCredit ? 0 : amount,
        balance: moneyAbs(publicBankSameDate[2]),
        rawData: { line },
        warnings: [],
        suggestedEvent: "",
        suggestedAccount: "",
      };
      continue;
    }
    if (/^\d{1,2}\/\d{1,2}\s+/i.test(line)) {
      pushCurrent();
      continue;
    }
    if (current && !/^(malayan banking|pavilion|muka|tarikh penyata|account number|protected by|date transaction|tarikh urus|penyata ini)/i.test(line)) {
      current.description = `${current.description} ${line}`.trim();
      current.rawData.line = `${current.rawData.line}\n${line}`;
    }
  }
  pushCurrent();
  return rows.map((row, index) => ({ ...row, rowNumber: index + 1 }));
}
