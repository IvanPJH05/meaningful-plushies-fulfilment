import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CANVA_SCOPES,
  CANVA_STATE_COOKIE,
  CANVA_VERIFIER_COOKIE,
  canvaConfigured,
  canvaCookieOptions,
  encryptCanvaValue,
} from "../../../../lib/canva-auth";

export const runtime = "nodejs";

export async function GET() {
  if (!canvaConfigured()) return new Response("Canva OAuth is not configured in Vercel.", { status: 503 });

  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(CANVA_STATE_COOKIE, encryptCanvaValue(state), { ...canvaCookieOptions, maxAge: 600 });
  cookieStore.set(CANVA_VERIFIER_COOKIE, encryptCanvaValue(verifier), { ...canvaCookieOptions, maxAge: 600 });

  const authorize = new URL("https://www.canva.com/api/oauth/authorize");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("scope", CANVA_SCOPES);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", process.env.CANVA_CLIENT_ID!);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("redirect_uri", process.env.CANVA_REDIRECT_URI!);
  return NextResponse.redirect(authorize);
}
