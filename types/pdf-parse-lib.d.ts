declare module "pdf-parse/lib/pdf-parse" {
  type PdfParseResult = {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  };

  export default function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;
}
