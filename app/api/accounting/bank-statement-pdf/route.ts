import pdfParse from "pdf-parse/lib/pdf-parse";
import { parseBankStatementText } from "../../../../lib/bank-statements";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Upload a PDF bank statement first." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await pdfParse(buffer);
    const rows = parseBankStatementText(extracted.text || "");
    return Response.json({ rows, textLength: extracted.text?.length ?? 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read this PDF bank statement." }, { status: 500 });
  }
}
