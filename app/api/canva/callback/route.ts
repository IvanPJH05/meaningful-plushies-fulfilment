import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CANVA_REFRESH_COOKIE,
  CANVA_STATE_COOKIE,
  CANVA_VERIFIER_COOKIE,
  canvaCookieOptions,
  decryptCanvaValue,
  encryptCanvaValue,
  exchangeCanvaCode,
} from "../../../../lib/canva-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return redirectHome(request, `error:${error}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(CANVA_STATE_COOKIE)?.value;
  const verifierCookie = cookieStore.get(CANVA_VERIFIER_COOKIE)?.value;
  if (!code || !state || !stateCookie || !verifierCookie) return redirectHome(request, "error:missing_oauth_data");

  try {
    if (decryptCanvaValue(stateCookie) !== state) return redirectHome(request, "error:invalid_state");
    const tokens = await exchangeCanvaCode(code, decryptCanvaValue(verifierCookie));
    cookieStore.set(CANVA_REFRESH_COOKIE, encryptCanvaValue(tokens.refresh_token), {
      ...canvaCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    cookieStore.delete(CANVA_STATE_COOKIE);
    cookieStore.delete(CANVA_VERIFIER_COOKIE);
    return redirectHome(request, "connected");
  } catch (authError) {
    console.error(authError);
    return redirectHome(request, "error:token_exchange_failed");
  }
}

function redirectHome(request: Request, result: string) {
  const home = new URL("/", request.url);
  home.searchParams.set("canva", result);
  return NextResponse.redirect(home);
}
