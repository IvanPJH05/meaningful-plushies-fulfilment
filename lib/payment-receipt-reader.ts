import { createCanvas } from "@napi-rs/canvas";
import Tesseract from "tesseract.js";

export type ReceiptPaymentDetails = {
  paidAt: string;
  reference: string;
  amount: number | null;
};

const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;
const MALAYSIA_UTC_OFFSET_HOURS = 8;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function localMalaysiaIso(year: number, month: number, day: number, hours = 12, minutes = 0) {
  const value = new Date(Date.UTC(year, month, day, hours - MALAYSIA_UTC_OFFSET_HOURS, minutes));
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function readPaidAt(text: string) {
  const named = text.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*(20\d{2})(?:\s*,?\s*(\d{1,2})[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?)?/i);
  if (named) {
    let hours = Number(named[4] || 12);
    const meridiem = (named[6] || "").replace(/\./g, "").toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return localMalaysiaIso(Number(named[3]), MONTHS[named[2].slice(0, 3).toLowerCase()], Number(named[1]), hours, Number(named[5] || 0));
  }

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})(?:\s*(\d{1,2})[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?)?/i);
  if (!numeric) return "";
  let hours = Number(numeric[4] || 12);
  const meridiem = (numeric[6] || "").replace(/\./g, "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return localMalaysiaIso(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]), hours, Number(numeric[5] || 0));
}

function readReference(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const marker = lines.findIndex((line) => /(?:reference|transaction|receipt)\s*(?:id|no|number)?/i.test(line));
  if (marker >= 0) {
    const candidate = lines.slice(marker + 1, marker + 5).find((line) => /^[A-Z0-9][A-Z0-9-]{5,}$/i.test(line));
    if (candidate) return candidate;
  }
  return text.match(/(?:reference|transaction)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{5,})/i)?.[1] || "";
}

function readAmount(text: string) {
  const value = text.match(/(?:amount|jumlah)\s*(?:rm|myr)?\s*([\d,]+\.\d{2})/i)?.[1]
    || text.match(/\b(?:rm|myr)\s*([\d,]+\.\d{2})/i)?.[1];
  if (!value) return null;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

async function firstPdfPageAsPng(bytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await (document as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

export async function readPaymentReceiptDetails(bytes: Buffer, contentType: string): Promise<ReceiptPaymentDetails> {
  if (!bytes.byteLength || bytes.byteLength > MAX_RECEIPT_BYTES) throw new Error("Receipt files must be 15 MB or smaller to read their payment details.");
  const image = contentType.toLowerCase().split(";")[0].trim() === "application/pdf"
    ? await firstPdfPageAsPng(bytes)
    : bytes;
  const { data } = await Tesseract.recognize(image, "eng", { cachePath: "/tmp/tesseract" });
  const text = data.text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  return { paidAt: readPaidAt(text), reference: readReference(text), amount: readAmount(text) };
}
