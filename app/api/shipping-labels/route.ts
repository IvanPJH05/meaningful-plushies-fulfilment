import { PDFDocument } from "pdf-lib";
import pdfjs from "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js";
import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { createOrReuseMediaAssetFromBytes, mediaAssetPublicUrls } from "@/src/modules/whatsapp/media-assets";
import { identifyShippingLabel } from "@/lib/shipping-labels";

export const runtime = "nodejs";

type PdfTextContent = { items: Array<{ str?: string }> };
type PdfPage = { getTextContent: (options: { normalizeWhitespace: boolean }) => Promise<PdfTextContent> };
type PdfDocumentProxy = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };

async function pageText(buffer: Buffer) {
  const document = await (pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise as Promise<PdfDocumentProxy>);
  const pages: string[] = [];
  // Read in PDF page order. The old callback accumulated pages as their async
  // text extraction completed, which could make the first J&T label attach to
  // no order or the wrong order.
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent({ normalizeWhitespace: true });
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }
  return pages;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Choose a PDF containing shipping labels." }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Shipping-label PDFs must be 25 MB or smaller." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const [texts, sourcePdf] = await Promise.all([pageText(bytes), PDFDocument.load(bytes)]);
    const business = await ensureDefaultBusiness();
    const origin = new URL(request.url).origin;
    const labels = [];

    for (let index = 0; index < sourcePdf.getPageCount(); index += 1) {
      const labelPdf = await PDFDocument.create();
      const [page] = await labelPdf.copyPages(sourcePdf, [index]);
      labelPdf.addPage(page);
      const labelBytes = await labelPdf.save();
      const asset = await createOrReuseMediaAssetFromBytes({ businessId: business.id, bytes: Buffer.from(labelBytes), contentType: "application/pdf" });
      if (!asset) throw new Error("Shared label storage is not available yet.");
      const detected = identifyShippingLabel(texts[index] || "");
      labels.push({
        page: index + 1,
        source: detected?.source ?? null,
        reference: detected?.reference ?? "",
        fileName: `${file.name.replace(/\.pdf$/i, "")}-label-${index + 1}.pdf`,
        url: `${origin}${mediaAssetPublicUrls(asset.contentHash).originalUrl}`,
      });
    }
    return NextResponse.json({ ok: true, labels });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not read the shipping-label PDF." }, { status: 500 });
  }
}
