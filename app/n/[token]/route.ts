import { NextResponse } from "next/server";
import { nfcCardUrl, nfcTokenPattern } from "@/lib/nfc-cards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (!nfcTokenPattern.test(token)) return new NextResponse("Invalid NFC link.", { status: 404, headers });
  return NextResponse.redirect(nfcCardUrl(token), { status: 307, headers });
}
