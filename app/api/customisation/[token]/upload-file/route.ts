import { NextResponse } from "next/server";

import { uploadVoiceFile } from "../../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const file = (await request.formData()).get("voice");
    if (!(file instanceof File)) throw new Error("Choose your voice recording first.");
    const voiceStoragePath = await uploadVoiceFile(token, file);
    return cors(NextResponse.json({ ok: true, voiceStoragePath }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not upload your voice." }, { status: 400 }));
  }
}
