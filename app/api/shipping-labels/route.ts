import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse/lib/pdf-parse";
import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { createOrReuseMediaAssetFromBytes, mediaAssetPublicUrls } from "@/src/modules/whatsapp/media-assets";

export const runtime = "nodejs";

type LabelSource = "jnt" | "tiktok";

function pageText(buffer: Buffer) {
  const pages: string[] = [];
  return pdfParse(buffer, {
    pagerender: async (page: { getTextContent: (options: { normalizeWhitespace: boolean }) => Promise<{ items: Array<{ str?: string }> }> }) => {
      const content = await page.getTextContent({ normalizeWhitespace: true });
      pages.push(content.items.map((item) => item.str || "").join(" "));
      return "";
    },
  }).then(() => pages);
}

function identifyLabel(text: string): { source: LabelSource; reference: string } | null {
  const compact = text.replace(/\s+/g, " ");
  const tiktokOrder = compact.match(/order\s*id\s*:?\s*(\d{8,})/i);
  if (tiktokOrder) return { source: "tiktok", reference: tiktokOrder[1] };
  // J&T renders the Shopify reference as "#1726 Remark" in the supplied
  // labels, so deliberately use the number directly before that label.
  const jntRemark = compact.match(/#\s*(\d{3,})\s+remark/i);
  return jntRemark ? { source: "jnt", reference: jntRemark[1] } : null;
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
      const detected = identifyLabel(texts[index] || "");
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
