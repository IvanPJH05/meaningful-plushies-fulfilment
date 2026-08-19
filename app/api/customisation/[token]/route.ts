import { NextResponse } from "next/server";

import { getPublicSession, saveSubmittedSession } from "../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(_: Request, { params }: Context) {
  const { token } = await params;
  try {
    const session = await getPublicSession(token);
    return session ? NextResponse.json({ ok: true, session }) : NextResponse.json({ ok: false, error: "This customisation link is no longer available." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load customisation." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  try {
    const body = await request.json() as { form?: unknown; voiceStoragePath?: string };
    await saveSubmittedSession(token, body.form, String(body.voiceStoragePath || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save customisation." }, { status: 400 });
  }
}
