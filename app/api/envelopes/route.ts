import { readFile } from "node:fs/promises";
import path from "node:path";
import { degrees, PDFDocument } from "pdf-lib";

export const runtime = "nodejs";

const BASE_FONT_SIZE = 56.25;
const MIN_FONT_SIZE = 34;
const TEXT_BOX_WIDTH = 300;
const TEXT_BOX_HEIGHT = 150;
const TOP_TEXT_BOX_CENTER = { x: 301.8, y: 1564.2 };
const BOTTOM_TEXT_BOX_CENTER = { x: 301.8, y: 135.6 };

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
type EnvelopeNameImage = {
  pngBase64?: unknown;
  width?: unknown;
  height?: unknown;
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
    letterSpacing: numberSetting(settings.letterSpacing, 0, -10, 30),
    lineHeight: numberSetting(settings.lineHeight, 0.96, 0.5, 2),
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
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function rotatedLowerLeftForCenteredImage(center: { x: number; y: number }, angle: number, width: number, height: number) {
  const radians = angle * Math.PI / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    x: center.x - (Math.cos(radians) * halfWidth - Math.sin(radians) * halfHeight),
    y: center.y - (Math.sin(radians) * halfWidth + Math.cos(radians) * halfHeight),
  };
}

function cleanPngBase64(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/^data:image\/png;base64,/, "").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { names?: unknown[]; nameImages?: EnvelopeNameImage[]; settings?: EnvelopePdfSettings };
    const names = (body.names ?? []).map(cleanName).filter(Boolean);
    if (!names.length) return new Response("Choose at least one order.", { status: 400 });
    const nameImages = Array.isArray(body.nameImages) ? body.nameImages : [];
    if (nameImages.length < names.length) return new Response("Could not render every envelope name image.", { status: 400 });

    const settings = normalizeSettings(body.settings);
    const templateBase64 = await readFile(path.join(process.cwd(), "assets", "envelope-base.pdf.b64"), "utf8");
    const templateBytes = Buffer.from(templateBase64, "base64");

    const template = await PDFDocument.load(templateBytes);
    const output = await PDFDocument.create();

    for (let index = 0; index < names.length; index += 2) {
      const [page] = await output.copyPages(template, [0]);
      output.addPage(page);
      for (const placement of [
        { image: nameImages[index], center: settings.topCenter, angle: 225 },
        { image: nameImages[index + 1], center: settings.bottomCenter, angle: 315 },
      ]) {
        const pngBase64 = cleanPngBase64(placement.image?.pngBase64);
        if (!pngBase64) continue;
        const width = numberSetting(placement.image?.width, settings.textBoxWidth, 20, 1200);
        const height = numberSetting(placement.image?.height, settings.textBoxHeight, 20, 800);
        const image = await output.embedPng(Buffer.from(pngBase64, "base64"));
        const point = rotatedLowerLeftForCenteredImage(placement.center, placement.angle, width, height);
        page.drawImage(image, {
          x: point.x,
          y: point.y,
          width,
          height,
          rotate: degrees(placement.angle),
        });
      }
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
