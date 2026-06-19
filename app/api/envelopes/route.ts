import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { degrees, PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

export const runtime = "nodejs";

const BASE_FONT_SIZE = 56.25;
const MIN_FONT_SIZE = 34;
const TEXT_BOX_WIDTH = 300;
const TEXT_BOX_HEIGHT = 150;
const LINE_HEIGHT_RATIO = 0.96;
const CHARACTER_SPACING = 2.5;
const TOP_TEXT_BOX_CENTER = { x: 301.8, y: 1564.2 };
const BOTTOM_TEXT_BOX_CENTER = { x: 301.8, y: 135.6 };
const NAME_COLOR = rgb(0.26, 0.37, 0.46);

type EnvelopePdfSettings = {
  fontSize?: number;
  minFontSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textBoxWidth?: number;
  textBoxHeight?: number;
  topX?: number;
  topY?: number;
  bottomX?: number;
  bottomY?: number;
};

function numberSetting(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeSettings(settings: EnvelopePdfSettings = {}) {
  const fontSize = numberSetting(settings.fontSize, BASE_FONT_SIZE, 8, 140);
  return {
    fontSize,
    minFontSize: Math.min(fontSize, numberSetting(settings.minFontSize, MIN_FONT_SIZE, 8, 140)),
    letterSpacing: numberSetting(settings.letterSpacing, CHARACTER_SPACING, -10, 30),
    lineHeight: numberSetting(settings.lineHeight, LINE_HEIGHT_RATIO, 0.5, 2),
    textBoxWidth: numberSetting(settings.textBoxWidth, TEXT_BOX_WIDTH, 50, 900),
    textBoxHeight: numberSetting(settings.textBoxHeight, TEXT_BOX_HEIGHT, 30, 500),
    topCenter: {
      x: numberSetting(settings.topX, TOP_TEXT_BOX_CENTER.x, -500, 2000),
      y: numberSetting(settings.topY, TOP_TEXT_BOX_CENTER.y, -500, 2500),
    },
    bottomCenter: {
      x: numberSetting(settings.bottomX, BOTTOM_TEXT_BOX_CENTER.x, -500, 2000),
      y: numberSetting(settings.bottomY, BOTTOM_TEXT_BOX_CENTER.y, -500, 2500),
    },
  };
}

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 60);
}

function lineWidth(font: PDFFont, text: string, size: number, letterSpacing: number) {
  return font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * letterSpacing;
}

function splitLongWord(font: PDFFont, word: string, size: number, textBoxWidth: number, letterSpacing: number) {
  const chunks: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = `${current}${character}`;
    if (current && lineWidth(font, candidate, size, letterSpacing) > textBoxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapName(font: PDFFont, name: string, size: number, textBoxWidth: number, letterSpacing: number) {
  const words = name.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (lineWidth(font, word, size, letterSpacing) > textBoxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(...splitLongWord(font, word, size, textBoxWidth, letterSpacing));
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && lineWidth(font, candidate, size, letterSpacing) > textBoxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.map((line) => line.trim()).filter(Boolean);
}

function layoutName(font: PDFFont, name: string, settings: ReturnType<typeof normalizeSettings>) {
  for (let size = settings.fontSize; size >= settings.minFontSize; size -= 1) {
    const lines = wrapName(font, name, size, settings.textBoxWidth, settings.letterSpacing);
    const height = Math.max(1, lines.length) * size * settings.lineHeight;
    if (lines.length <= 3 && height <= settings.textBoxHeight) return { lines, size };
  }
  return { lines: wrapName(font, name, settings.minFontSize, settings.textBoxWidth, settings.letterSpacing).slice(0, 3), size: settings.minFontSize };
}

function rotatedPoint(center: { x: number; y: number }, angle: number, localX: number, localY: number) {
  const radians = angle * Math.PI / 180;
  const alongX = Math.cos(radians);
  const alongY = Math.sin(radians);
  const normalX = -alongY;
  const normalY = alongX;
  return {
    x: center.x + alongX * localX + normalX * localY,
    y: center.y + alongY * localX + normalY * localY,
  };
}

function drawCenteredName(
  page: PDFPage,
  font: PDFFont,
  name: string,
  center: { x: number; y: number },
  angle: number,
  settings: ReturnType<typeof normalizeSettings>,
) {
  if (!name) return;

  const { lines, size } = layoutName(font, name, settings);
  const lineHeight = size * settings.lineHeight;
  lines.forEach((line, index) => {
    const localY = ((lines.length - 1) / 2 - index) * lineHeight;
    let cursor = -lineWidth(font, line, size, settings.letterSpacing) / 2;

    for (const character of line) {
      const characterWidth = font.widthOfTextAtSize(character, size);
      if (character !== " ") {
        const point = rotatedPoint(center, angle, cursor, localY);
        page.drawText(character, {
          x: point.x,
          y: point.y,
          size,
          font,
          color: NAME_COLOR,
          rotate: degrees(angle),
        });
      }
      cursor += characterWidth + settings.letterSpacing;
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { names?: unknown[]; fontBase64?: unknown; settings?: EnvelopePdfSettings };
    const names = (body.names ?? []).map(cleanName).filter(Boolean);
    if (!names.length) return new Response("Choose at least one order.", { status: 400 });
    if (typeof body.fontBase64 !== "string" || !body.fontBase64.trim()) return new Response("Upload an envelope font before generating the PDF.", { status: 400 });

    const settings = normalizeSettings(body.settings);
    const templateBase64 = await readFile(path.join(process.cwd(), "assets", "envelope-base.pdf.b64"), "utf8");
    const templateBytes = Buffer.from(templateBase64, "base64");
    const fontBytes = Buffer.from(body.fontBase64.replace(/^data:[^;]+;base64,/, ""), "base64");

    const template = await PDFDocument.load(templateBytes);
    const output = await PDFDocument.create();
    output.registerFontkit(fontkit);
    const font = await output.embedFont(fontBytes, { subset: true });

    for (let index = 0; index < names.length; index += 2) {
      const [page] = await output.copyPages(template, [0]);
      output.addPage(page);
      drawCenteredName(page, font, names[index], settings.topCenter, 225, settings);
      drawCenteredName(page, font, names[index + 1] ?? "", settings.bottomCenter, 315, settings);
    }

    const pdfBytes = await output.save();
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=meaningful-plushies-envelopes.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(error instanceof Error ? error.message : "The envelope PDF could not be generated.", { status: 500 });
  }
}
