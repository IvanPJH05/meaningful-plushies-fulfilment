import { NextRequest, NextResponse } from "next/server";

import { prepareManualOrderIntakeVoiceUpload, startManualOrderIntake, submitManualOrderIntake } from "@/lib/manual-order-intakes";

export const runtime = "nodejs";

const lockedLinks = {
  b5: { character: "Billy", productKey: "plushie_5s" }, b10: { character: "Billy", productKey: "plushie_10s" }, b20: { character: "Billy", productKey: "plushie_20s" },
  t5: { character: "Tootsie", productKey: "plushie_5s" }, t10: { character: "Tootsie", productKey: "plushie_10s" }, t20: { character: "Tootsie", productKey: "plushie_20s" },
  d5: { character: "Dragon Warrior", productKey: "plushie_5s" }, d10: { character: "Dragon Warrior", productKey: "plushie_10s" }, d20: { character: "Dragon Warrior", productKey: "plushie_20s" },
  h5: { character: "Hunnie", productKey: "plushie_5s" }, h10: { character: "Hunnie", productKey: "plushie_10s" }, h20: { character: "Hunnie", productKey: "plushie_20s" },
} as const;

function result(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const link = lockedLinks[String(body.collectionCode || "").toLowerCase() as keyof typeof lockedLinks];
    if (!link) return result({ ok: false, error: "This customisation link is not available." }, 404);
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "start") return result({ ok: true, session: await startManualOrderIntake() });
    if (action === "prepare_voice_upload") {
      const upload = await prepareManualOrderIntakeVoiceUpload(String(body.sessionToken || ""), String(body.fileName || "voice-message.webm"), String(body.contentType || "audio/webm"));
      return result({ ok: true, upload });
    }
    if (action === "submit") {
      const intake = await submitManualOrderIntake({
        customerName: String(body.customerName || ""), customerEmail: String(body.customerEmail || ""), phone: String(body.phone || ""),
        character: link.character, productKey: link.productKey, shippingRegion: body.shippingRegion === "EAST" ? "EAST" : "WEST",
        shippingAddress: (body.shippingAddress || {}) as never, form: (body.form || {}) as never,
        sessionToken: String(body.sessionToken || ""), voiceStoragePath: String(body.voiceStoragePath || ""),
      });
      return result({ ok: true, intakeId: intake.id, reference: intake.reference, whatsAppUrl: intake.whatsAppUrl || undefined });
    }
    return result({ ok: false, error: "That collection action is not supported." }, 400);
  } catch (error) {
    return result({ ok: false, error: error instanceof Error ? error.message : "Your information could not be saved." }, 400);
  }
}
