import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await request.json() as { token?: unknown; platform?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = body.platform === "ios" ? "ios" : "android";
    if (token.length < 20 || token.length > 4096) {
      return NextResponse.json({ error: "A valid device notification token is required." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { error } = await mobileServiceClient().from("mobile_push_devices").upsert({
      account_username: session.username,
      token,
      platform,
      active: true,
      updated_at: now,
    }, { onConflict: "token" });
    if (error) throw error;
    return NextResponse.json({ registered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "NOTIFICATION_REGISTRATION_FAILED";
    const status = message === "SIGN_IN_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
