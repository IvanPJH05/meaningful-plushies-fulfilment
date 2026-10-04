import { NextResponse } from "next/server";

import { saveSnowyCharmVoice } from "../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function cors(response: NextResponse, origin = "") {
  const allowedOrigin = ["https://meaningfulplushies.com", "https://n1rdwf-40.myshopify.com", "https://admin.shopify.com"].includes(origin) ? origin : "https://meaningfulplushies.com";
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  return response;
}

export function OPTIONS(request: Request) {
  return cors(new NextResponse(null, { status: 204 }), request.headers.get("origin") || "");
}

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  const origin = request.headers.get("origin") || "";
  try {
    const body = await request.json() as { voiceStoragePath?: string };
    const saved = await saveSnowyCharmVoice(token, String(body.voiceStoragePath || ""));
    return cors(NextResponse.json({ ok: true, ...saved }), origin);
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save your Snowy Charm voice message." }, { status: 400 }), origin);
  }
}
