import { NextResponse } from "next/server";
import {
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
  WebhookEventStatus,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { verifyMetaWebhookSignature } from "@/src/modules/whatsapp/meta-signature";
import { normalizeWhatsAppWebhookPayload } from "@/src/modules/whatsapp/webhook-normalizer";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function messageType(type: string) {
  if (type === "image") return MessageType.IMAGE;
  if (type === "audio") return MessageType.AUDIO;
  if (type === "video") return MessageType.VIDEO;
  if (type === "document") return MessageType.DOCUMENT;
  return MessageType.TEXT;
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function storeInboundMessages(rawPayload: unknown) {
  const business = await ensureDefaultBusiness();
  const normalizedMessages = normalizeWhatsAppWebhookPayload(rawPayload);

  for (const message of normalizedMessages) {
    if (!message.messageId || !message.waId) continue;

    await prisma.webhookEvent.upsert({
      where: {
        businessId_source_externalEventId: {
          businessId: business.id,
          source: "meta_whatsapp",
          externalEventId: message.messageId,
        },
      },
      update: {
        payload: jsonValue(message.raw),
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
      create: {
        businessId: business.id,
        source: "meta_whatsapp",
        externalEventId: message.messageId,
        payload: jsonValue(message.raw),
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    const contact = await prisma.contact.upsert({
      where: {
        businessId_waId: {
          businessId: business.id,
          waId: message.waId,
        },
      },
      update: {
        phone: message.waId,
        displayName: message.displayName || undefined,
      },
      create: {
        businessId: business.id,
        waId: message.waId,
        phone: message.waId,
        displayName: message.displayName || undefined,
        source: "whatsapp",
      },
    });

    const conversation = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        contactId: contact.id,
        status: { notIn: ["RESOLVED", "ARCHIVED"] },
      },
      orderBy: { updatedAt: "desc" },
    }) ?? await prisma.conversation.create({
      data: {
        businessId: business.id,
        contactId: contact.id,
        lastMessageAt: message.timestamp,
        unreadCount: 1,
      },
    });

    await prisma.message.upsert({
      where: {
        businessId_externalMessageId: {
          businessId: business.id,
          externalMessageId: message.messageId,
        },
      },
      update: {
        body: message.text,
        metadata: jsonValue({ phoneNumberId: message.phoneNumberId, raw: message.raw }),
      },
      create: {
        businessId: business.id,
        conversationId: conversation.id,
        externalMessageId: message.messageId,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CUSTOMER,
        messageType: messageType(message.messageType),
        body: message.text,
        status: MessageStatus.DELIVERED,
        metadata: jsonValue({ phoneNumberId: message.phoneNumberId, raw: message.raw }),
        deliveredAt: message.timestamp,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: message.timestamp,
        unreadCount: { increment: 1 },
      },
    });
  }

  return normalizedMessages.length;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return json(403, { ok: false, error: "WhatsApp webhook verification failed." });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_APP_SECRET;

  if (!verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
    return json(401, { ok: false, error: "Invalid Meta webhook signature." });
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;
    const stored = await storeInboundMessages(payload);
    return json(200, { ok: true, stored });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp webhook could not be processed.",
    });
  }
}
