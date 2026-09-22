import { NextResponse } from "next/server";

import { createCompleteNowSession } from "../../../../lib/customisation";

export const runtime = "nodejs";

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST() {
  try {
    const session = await createCompleteNowSession();
    return cors(NextResponse.json({ ok: true, sessionId: session.id, token: session.token }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start your Snowy Charm audio session." }, { status: 400 }));
  }
}
