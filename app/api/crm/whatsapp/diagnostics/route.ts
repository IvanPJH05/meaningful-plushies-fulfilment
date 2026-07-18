import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  normalizeWebhookVerifyToken,
  verifyWebhookChallenge,
} from "@/src/modules/whatsapp/webhook-verification";

export const runtime = "nodejs";

function hashPreview(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function GET(request: Request) {
  const debugSecret = process.env.CRM_SESSION_SECRET;
  const providedSecret = request.headers.get("x-crm-debug-secret");
  if (!debugSecret || providedSecret !== debugSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expected = normalizeWebhookVerifyToken(process.env.WHATSAPP_VERIFY_TOKEN);
  const provided = normalizeWebhookVerifyToken(token);

  return NextResponse.json({
    ok: true,
    runtimeTokenPresent: Boolean(expected),
    runtimeTokenLength: expected.length,
    runtimeTokenHash: hashPreview(expected),
    providedTokenPresent: Boolean(provided),
    providedTokenLength: provided.length,
    providedTokenHash: hashPreview(provided),
    verificationPasses: verifyWebhookChallenge({
      mode: "subscribe",
      token,
      expectedToken: process.env.WHATSAPP_VERIFY_TOKEN,
      challenge: "diagnostic",
    }),
  });
}
