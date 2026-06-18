import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const fontBase64 = await readFile(path.join(process.cwd(), "assets", "Jingleberry.otf.b64"), "utf8");
  const fontBytes = Buffer.from(fontBase64, "base64");

  return new Response(fontBytes, {
    headers: {
      "Content-Type": "font/otf",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
