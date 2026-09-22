import { NextResponse } from "next/server";

import { saveSnowyCharmVoice } from "../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  try {
    const body = await request.json() as { voiceStoragePath?: string };
    const saved = await saveSnowyCharmVoice(token, String(body.voiceStoragePath || ""));
    return cors(NextResponse.json({ ok: true, ...saved }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save your Snowy Charm voice message." }, { status: 400 }));
  }
}
