import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { degrees, PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

export const runtime = "nodejs";

const BASE_FONT_SIZE = 56.25;
const MIN_FONT_SIZE = 38;
const MAX_TEXT_WIDTH = 285;
const TOP_BASELINE_CENTER = { x: 291.4, y: 1566.6 };
const BOTTOM_BASELINE_CENTER = { x: 291.4, y: 117.5 };
const NAME_COLOR = rgb(0.26, 0.37, 0.46);

function cleanName(value: unknown) {
  return String(value ?? "").trim().toUpperCase().slice(0, 40);
}

function fittedSize(font: PDFFont, name: string) {
  const width = font.widthOfTextAtSize(name, BASE_FONT_SIZE);
  return Math.max(MIN_FONT_SIZE, Math.min(BASE_FONT_SIZE, BASE_FONT_SIZE * MAX_TEXT_WIDTH / width));
}

function drawCenteredName(
  page: PDFPage,
  font: PDFFont,
  name: string,
  center: { x: number; y: number },
  angle: number,
) {
  if (!name) return;

  const size = fittedSize(font, name);
  const width = font.widthOfTextAtSize(name, size);
  const radians = angle * Math.PI / 180;
  const alongX = Math.cos(radians);
  const alongY = Math.sin(radians);

  page.drawText(name, {
    x: center.x - alongX * width / 2,
    y: center.y - alongY * width / 2,
    size,
    font,
    color: NAME_COLOR,
    rotate: degrees(angle),
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
      drawCenteredName(page, font, names[index], TOP_BASELINE_CENTER, 225);
      drawCenteredName(page, font, names[index + 1] ?? "", BOTTOM_BASELINE_CENTER, 315);
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

