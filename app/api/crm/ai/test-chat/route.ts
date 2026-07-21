import { NextResponse } from "next/server";

import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { getWhatsAppAssistantTraining } from "@/src/modules/crm/whatsapp-ai-settings";
import {
  createWhatsAppAssistantReply,
  openAiConfigured,
  type WhatsAppAssistantMedia,
  type WhatsAppAssistantMessage,
} from "@/src/modules/openai/whatsapp-assistant";

export const runtime = "nodejs";

const maxMediaItems = 4;
const maxDataUrlLength = 6_500_000;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanRole(value: unknown): WhatsAppAssistantMessage["direction"] {
  if (value === "assistant" || value === "team" || value === "system") return value;
  return "customer";
}

function cleanMedia(value: unknown): WhatsAppAssistantMedia[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, maxMediaItems).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const contentType = stringValue(row.contentType).slice(0, 120);
    const dataUrl = stringValue(row.dataUrl);
    const canSendImage = contentType.toLowerCase().startsWith("image/")
      && dataUrl.startsWith("data:image/")
      && dataUrl.length <= maxDataUrlLength;

    return {
      name: stringValue(row.name).slice(0, 180),
      contentType,
      sizeBytes: numberValue(row.sizeBytes),
      dataUrl: canSendImage ? dataUrl : undefined,
      note: stringValue(row.note).slice(0, 500),
    };
  });
}

function mediaSummary(media: WhatsAppAssistantMedia[]) {
  return media
    .map((item) => {
      const parts = [
        item.name || "uploaded media",
        item.contentType || "",
        item.sizeBytes ? `${item.sizeBytes} bytes` : "",
      ].filter(Boolean);
      return `[Media: ${parts.join(", ")}]`;
    })
    .join(" ");
}

function cleanMessages(value: unknown): WhatsAppAssistantMessage[] {
  if (!Array.isArray(value)) return [];

  return value.slice(-12).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const body = stringValue(row.body).trim();
    const media = cleanMedia(row.media);
    return {
      direction: cleanRole(row.role),
      body: [body, mediaSummary(media)].filter(Boolean).join(" ").trim(),
    };
  }).filter((message) => message.body.length > 0);
}

export async function POST(request: Request) {
  try {
    if (!openAiConfigured()) {
      return json(400, {
        ok: false,
        error: "OPENAI_API_KEY is not configured yet.",
      });
    }

    const business = await ensureDefaultBusiness();
    const training = await getWhatsAppAssistantTraining(business.id);
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const media = cleanMedia(payload.media);
    const messages = cleanMessages(payload.messages);
    const latestMessage = stringValue(payload.latestMessage).trim() || (media.length ? "Customer sent media." : "");

    if (!latestMessage) {
      return json(400, {
        ok: false,
        error: "Type a customer message or attach an image first.",
      });
    }

    const result = await createWhatsAppAssistantReply({
      customerName: stringValue(payload.customerName, "Test customer"),
      customerPhone: stringValue(payload.customerPhone, "WhatsApp test chat"),
      latestMessage,
      recentMessages: messages,
      media,
      training,
    });

    if (!result.ok || !result.reply) {
      return json(502, {
        ok: false,
        error: result.error || "AI could not generate a test reply.",
        reason: result.reason,
      });
    }

    return json(200, {
      ok: true,
      reply: result.reply,
      model: result.model,
      training,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "AI test chat failed.",
    });
  }
}
