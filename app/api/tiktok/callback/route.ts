import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";
import { tikTokTokenRequest, tikTokRequest } from "@/lib/tiktok-client";
import { requireTikTokAdmin, tokenFields } from "@/lib/tiktok-connection";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const origin = new URL(process.env.TIKTOK_SHOP_REDIRECT_URI || request.url).origin;
  let success = false;
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    const code = request.nextUrl.searchParams.get("code") || "";
    if (!/^[a-f0-9]{64}$/.test(state) || request.cookies.get("tiktok_oauth_state")?.value !== state || !code) throw new Error("Invalid callback.");
    const db = mobileServiceClient();
    const { data, error } = await db.from("tiktok_oauth_states").delete().eq("state_hash", createHash("sha256").update(state).digest("hex")).gt("expires_at", new Date().toISOString()).select("session_token").maybeSingle();
    if (error || !data) throw new Error("Authorization expired.");
    await requireTikTokAdmin(new Request(request.url, { headers: { authorization: `Bearer ${data.session_token}` } }));
    const tokens = await tikTokTokenRequest({ auth_code: code, grant_type: "authorized_code" });
    const shops = await tikTokRequest<{ shops: { id: string; cipher: string; name: string; region: string }[] }>("/authorization/202309/shops", tokens.access_token);
    const candidates = shops.shops.filter(shop => shop.region === "MY" && (!process.env.TIKTOK_SHOP_ID || shop.id === process.env.TIKTOK_SHOP_ID));
    if (candidates.length !== 1) throw new Error("Configure the intended Malaysia shop ID.");
    const shop = candidates[0];
    const saved = await db.from("tiktok_connection").upsert({ id: true, shop_id: shop.id, shop_cipher: shop.cipher, shop_name: shop.name, ...tokenFields(tokens), refresh_lock_until: new Date(0).toISOString() });
    if (saved.error) throw new Error("Could not save connection.");
    success = true;
  } catch { /* Do not expose codes, tokens or provider response bodies. */ }
  const response = NextResponse.redirect(`${origin}/tiktok-connect?connection=${success ? "success" : "failed"}`);
  response.cookies.set("tiktok_oauth_state", "", { path: "/api/tiktok", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
