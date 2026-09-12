import { NextRequest, NextResponse } from "next/server";

import { prepareManualOrderIntakeVoiceUpload, startManualOrderIntake, submitManualOrderIntake } from "@/lib/manual-order-intakes";

export const runtime = "nodejs";

function result(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "start") {
      const session = await startManualOrderIntake();
      return result({ ok: true, session });
    }
    if (action === "prepare_voice_upload") {
      const upload = await prepareManualOrderIntakeVoiceUpload(String(body.sessionToken || ""), String(body.fileName || "voice-message.webm"), String(body.contentType || "audio/webm"));
      return result({ ok: true, upload });
    }
    if (action === "submit") {
      const intake = await submitManualOrderIntake({
        customerName: String(body.customerName || ""),
        customerEmail: String(body.customerEmail || ""),
        phone: String(body.phone || ""),
        character: String(body.character || ""),
        productKey: String(body.productKey || ""),
        shippingRegion: body.shippingRegion === "EAST" ? "EAST" : "WEST",
        shippingAddress: (body.shippingAddress || {}) as never,
        form: (body.form || {}) as never,
        sessionToken: String(body.sessionToken || ""),
        voiceStoragePath: String(body.voiceStoragePath || ""),
      });
      return result({ ok: true, intakeId: intake.id });
    }
    return result({ ok: false, error: "That collection action is not supported." }, 400);
  } catch (error) {
    return result({ ok: false, error: error instanceof Error ? error.message : "Your information could not be saved." }, 400);
  }
}
