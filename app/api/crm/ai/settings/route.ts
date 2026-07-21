import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  getWhatsAppAssistantTraining,
  saveWhatsAppAssistantTraining,
} from "@/src/modules/crm/whatsapp-ai-settings";
import {
  normalizeWhatsAppAssistantTraining,
  openAiConfigured,
  type WhatsAppAssistantTraining,
  whatsappAssistantModel,
} from "@/src/modules/openai/whatsapp-assistant";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const business = await ensureDefaultBusiness();
    const training = await getWhatsAppAssistantTraining(business.id);
    return json(200, {
      ok: true,
      training,
      openAiConfigured: openAiConfigured(),
      model: whatsappAssistantModel(),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp AI settings could not be loaded.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as Partial<WhatsAppAssistantTraining>;
    const training = normalizeWhatsAppAssistantTraining(payload);
    const saved = await saveWhatsAppAssistantTraining(business.id, training);

    return json(200, {
      ok: true,
      training: saved.training,
      openAiConfigured: openAiConfigured(),
      model: whatsappAssistantModel(),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp AI settings could not be saved.",
    });
  }
}
