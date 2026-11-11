import { PDFDocument } from "pdf-lib";

// Loaded only when a large batch needs PDF merging. Twenty names keep each
// canvas payload bounded; an even chunk size preserves the two-name A4 layout.
export async function batchEnvelopePdf(names: string[], generate: (part: string[]) => Promise<Blob>): Promise<Blob> {
  const merged = await PDFDocument.create();
  for (let offset = 0; offset < names.length; offset += 20) {
    const selected = names.slice(offset, offset + 20);
    const part = await PDFDocument.load(await (await generate(selected)).arrayBuffer());
    if (part.getPageCount() !== Math.ceil(selected.length / 2)) throw new Error("The envelope PDF did not contain every selected name. Try again.");
    for (const page of await merged.copyPages(part, part.getPageIndices())) merged.addPage(page);
  }
  return new Blob([Uint8Array.from(await merged.save()).buffer], { type: "application/pdf" });
}
