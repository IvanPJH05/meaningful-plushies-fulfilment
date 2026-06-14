import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb } from "pdf-lib";

export const runtime = "nodejs";

function cleanName(value: unknown) {
  return String(value ?? "").trim().toUpperCase().slice(0, 32);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { names?: unknown[] };
    const names = (body.names ?? []).map(cleanName).filter(Boolean);
    if (!names.length) return new Response("Choose at least one order.", { status: 400 });

    const [templateBytes, fontBytes] = await Promise.all([
      readFile(path.join(process.cwd(), "public", "envelope-template.pdf")),
      readFile(path.join(process.cwd(), "public", "fonts", "jingleberry.ttf")),
    ]);
    const template = await PDFDocument.load(templateBytes);
    const output = await PDFDocument.create();
    output.registerFontkit(fontkit);
    const font = await output.embedFont(fontBytes, { subset: true });
    for (let index = 0; index < names.length; index += 2) {
      const [page] = await output.copyPages(template, [0]);
      output.addPage(page);
      const { width, height } = page.getSize();

      page.drawRectangle({ x: width * .07, y: height * .76, width: width * .36, height: height * .20, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: width * .07, y: height * .02, width: width * .36, height: height * .20, color: rgb(1, 1, 1) });

      drawName(page, names[index], font, width * .235, height * .87, 45);
      if (names[index + 1]) drawName(page, names[index + 1], font, width * .235, height * .105, -45);
    }

    return new Response(await output.save(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=meaningful-plushies-envelopes.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("The envelope PDF could not be generated. A name may contain a character unavailable in the Jingleberry template font.", { status: 500 });
  }
}

function drawName(page: ReturnType<PDFDocument["getPage"]>, name: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, centerX: number, centerY: number, angle: number) {
  let size = 68;
  while (size > 36 && font.widthOfTextAtSize(name, size) > 380) size -= 2;
  const width = font.widthOfTextAtSize(name, size);
  page.drawText(name, {
    x: centerX - width / 2,
    y: centerY - size / 3,
    size,
    font,
    color: rgb(.27, .38, .49),
    rotate: degrees(angle),
  });
}
