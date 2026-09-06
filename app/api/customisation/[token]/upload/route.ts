import { NextResponse } from "next/server";

import { createVoiceUpload } from "../../../../../lib/customisation";

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
    const body = await request.json() as { fileName?: string; contentType?: string };
    const upload = await createVoiceUpload(token, String(body.fileName || "voice-audio"), String(body.contentType || ""));
    return cors(NextResponse.json({ ok: true, upload }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not prepare upload." }, { status: 400 }));
  }
}
