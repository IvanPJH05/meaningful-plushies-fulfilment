import { NextResponse } from "next/server";

import { getPublicSession, saveSubmittedSession } from "../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(_: Request, { params }: Context) {
  const { token } = await params;
  try {
    const session = await getPublicSession(token);
    return cors(session ? NextResponse.json({ ok: true, session }) : NextResponse.json({ ok: false, error: "This customisation link is no longer available." }, { status: 404 }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load customisation." }, { status: 500 }));
  }
}

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  try {
    const body = await request.json() as { form?: unknown; voiceStoragePath?: string };
    await saveSubmittedSession(token, body.form, String(body.voiceStoragePath || ""));
    return cors(NextResponse.json({ ok: true }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save customisation." }, { status: 400 }));
  }
}
