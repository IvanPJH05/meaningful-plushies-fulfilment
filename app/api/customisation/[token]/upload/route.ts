import { NextResponse } from "next/server";

import { createVoiceUpload } from "../../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  try {
    const body = await request.json() as { fileName?: string; contentType?: string };
    const upload = await createVoiceUpload(token, String(body.fileName || "voice-audio"), String(body.contentType || ""));
    return NextResponse.json({ ok: true, upload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not prepare upload." }, { status: 400 });
  }
}
