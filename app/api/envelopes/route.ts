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
const CHARACTER_SPACING = 4.5;
const TOP_TEXT_BOX_CENTER = { x: 301.8, y: 1564.2 };
const BOTTOM_TEXT_BOX_CENTER = { x: 301.8, y: 135.6 };
const NAME_COLOR = rgb(0.26, 0.37, 0.46);

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 60);
}

function lineWidth(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * CHARACTER_SPACING;
}

function splitLongWord(font: PDFFont, word: string, size: number) {
  const chunks: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = `${current}${character}`;
    if (current && lineWidth(font, candidate, size) > TEXT_BOX_WIDTH) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapName(font: PDFFont, name: string, size: number) {
  const words = name.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (lineWidth(font, word, size) > TEXT_BOX_WIDTH) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(...splitLongWord(font, word, size));
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && lineWidth(font, candidate, size) > TEXT_BOX_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.map((line) => line.trim()).filter(Boolean);
}

function layoutName(font: PDFFont, name: string) {
  for (let size = BASE_FONT_SIZE; size >= MIN_FONT_SIZE; size -= 1) {
    const lines = wrapName(font, name, size);
    const height = Math.max(1, lines.length) * size * LINE_HEIGHT_RATIO;
    if (lines.length <= 3 && height <= TEXT_BOX_HEIGHT) return { lines, size };
  }
  return { lines: wrapName(font, name, MIN_FONT_SIZE).slice(0, 3), size: MIN_FONT_SIZE };
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
) {
  if (!name) return;

  const { lines, size } = layoutName(font, name);
  const lineHeight = size * LINE_HEIGHT_RATIO;
  lines.forEach((line, index) => {
    const localY = ((lines.length - 1) / 2 - index) * lineHeight;
    const point = rotatedPoint(center, angle, -lineWidth(font, line, size) / 2, localY);
    page.drawText(line, {
      x: point.x,
      y: point.y,
      size,
      font,
      color: NAME_COLOR,
      rotate: degrees(angle),
      characterSpacing: CHARACTER_SPACING,
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { names?: unknown[] };
    const names = (body.names ?? []).map(cleanName).filter(Boolean);
    if (!names.length) return new Response("Choose at least one order.", { status: 400 });

    const [templateBase64, fontBase64] = await Promise.all([
      readFile(path.join(process.cwd(), "assets", "envelope-base.pdf.b64"), "utf8"),
      readFile(path.join(process.cwd(), "assets", "Jingleberry.otf.b64"), "utf8"),
    ]);
    const templateBytes = Buffer.from(templateBase64, "base64");
    const fontBytes = Buffer.from(fontBase64, "base64");

    const template = await PDFDocument.load(templateBytes);
    const output = await PDFDocument.create();
    output.registerFontkit(fontkit);
    const font = await output.embedFont(fontBytes, { subset: true });

    for (let index = 0; index < names.length; index += 2) {
      const [page] = await output.copyPages(template, [0]);
      output.addPage(page);
      drawCenteredName(page, font, names[index], TOP_TEXT_BOX_CENTER, 225);
      drawCenteredName(page, font, names[index + 1] ?? "", BOTTOM_TEXT_BOX_CENTER, 315);
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
