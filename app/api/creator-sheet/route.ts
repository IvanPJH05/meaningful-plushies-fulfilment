import { NextResponse } from "next/server";
import { requireMobileSession } from "../../../lib/mobile-api";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers });
    return NextResponse.json({ url: process.env.CREATOR_GOOGLE_SHEET_URL?.trim() || "" }, { headers });
  } catch { return NextResponse.json({ error: "Sign in required." }, { status: 401, headers }); }
}
