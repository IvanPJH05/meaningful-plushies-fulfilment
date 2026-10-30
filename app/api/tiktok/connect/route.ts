import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireTikTokAdmin } from "@/lib/tiktok-connection";
import { mobileServiceClient } from "@/lib/mobile-api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const session = await requireTikTokAdmin(request);
    const base = process.env.TIKTOK_SHOP_AUTHORIZATION_URL;
    if (!base || !process.env.TIKTOK_SHOP_REDIRECT_URI || !process.env.TIKTOK_TOKEN_ENCRYPTION_KEY) return NextResponse.json({ error: "TikTok connection setup is incomplete." }, { status: 503 });
    const url = new URL(base);
    if (url.protocol !== "https:" || !/^services(?:\.[a-z]+)?\.tiktokshop\.com$/.test(url.hostname)) throw new Error("Invalid seller authorization URL.");
    const state = randomBytes(32).toString("hex");
    const db = mobileServiceClient();
    await db.from("tiktok_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const { error } = await db.from("tiktok_oauth_states").insert({ state_hash: createHash("sha256").update(state).digest("hex"), session_token: session.token, expires_at: new Date(Date.now() + 600000).toISOString() });
    if (error) throw new Error("Could not start TikTok connection.");
    url.searchParams.set("state", state);
    const response = NextResponse.json({ url: url.toString() });
    response.cookies.set("tiktok_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
    return response;
  } catch { return NextResponse.json({ error: "Sign in as an administrator to connect TikTok." }, { status: 403 }); }
}
