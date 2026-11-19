import { NextResponse } from "next/server";
import { requireMobileSession } from "../../../../lib/mobile-api";

const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const password = process.env.NFC_SHARED_CARD_PASSWORD?.trim();
    if (!password || !/^[A-Z0-9]{4}$/.test(password)) {
      return NextResponse.json({ error: "The system NFC password is not configured. Contact the administrator." }, { status: 503, headers });
    }
    return NextResponse.json({ password }, { headers });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "WAREHOUSE_ACCESS_REQUIRED";
    return NextResponse.json({ error: forbidden ? "Warehouse access required." : "Sign in to use the system NFC password." }, { status: forbidden ? 403 : 401, headers });
  }
}

