import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processCertificateSync } from "@/lib/certificate-sync";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const expected = process.env.CERTIFICATE_SYNC_SECRET?.trim() || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await processCertificateSync(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Certificate queue is unavailable." }, { status: 503 });
  }
}
