import { NextResponse } from "next/server";

import { createCompleteNowSession } from "../../../../lib/customisation";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  try {
    const session = await createCompleteNowSession();
    return cors(NextResponse.json({ ok: true, sessionId: session.id, token: session.token }), origin);
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start your Snowy Charm audio session." }, { status: 400 }), origin);
  }
}
