import { NextResponse } from "next/server";
import {
  AiCommandStatus,
  AiCommandType,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
  WebhookEventStatus,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  createWhatsAppAssistantReply,
  crmAiAutoReplyEnabled,
  crmAiSuggestEnabled,
  openAiConfigured,
  whatsappAssistantModel,
  type WhatsAppAssistantMessage,
} from "@/src/modules/openai/whatsapp-assistant";
import { verifyMetaWebhookSignature } from "@/src/modules/whatsapp/meta-signature";
import { sendWhatsAppTextMessage } from "@/src/modules/whatsapp/outbound";
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

type StoredInboundMessage = {
  businessId: string;
  conversationId: string;
  contactId: string;
  customerName: string;
  waId: string;
  text: string;
  messageType: MessageType;
  created: boolean;
};

function assistantHistoryDirection(message: {
  direction: MessageDirection;
  senderType: MessageSenderType;
}): WhatsAppAssistantMessage["direction"] {
  if (message.direction === MessageDirection.INBOUND) return "customer";
  if (message.senderType === MessageSenderType.AI) return "assistant";
  if (message.senderType === MessageSenderType.SYSTEM) return "system";
  return "team";
}

async function handleAiForInboundMessage(item: StoredInboundMessage) {
  if (!item.created || item.messageType !== MessageType.TEXT || !item.text.trim()) {
    return { skipped: true, reason: "not_new_customer_text" };
  }

  const shouldSuggest = crmAiSuggestEnabled();
  const shouldAutoReply = crmAiAutoReplyEnabled();
  if (!shouldSuggest && !shouldAutoReply) {
    return { skipped: true, reason: "ai_disabled" };
  }

  if (!openAiConfigured()) {
    return { skipped: true, reason: "missing_openai_api_key" };
  }

  const recentMessages = await prisma.message.findMany({
    where: { conversationId: item.conversationId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const history = recentMessages.reverse()
    .map((message) => ({
      direction: assistantHistoryDirection(message),
      body: message.body ?? "",
    }))
    .filter((message) => message.body.trim());

  const aiRun = await prisma.aiRun.create({
    data: {
      businessId: item.businessId,
      conversationId: item.conversationId,
      model: whatsappAssistantModel(),
      promptVersion: "whatsapp-sales-v1",
    },
  });

  const result = await createWhatsAppAssistantReply({
    customerName: item.customerName,
    customerPhone: item.waId,
    latestMessage: item.text,
    recentMessages: history,
  });

  if (!result.ok || !result.reply) {
    await prisma.aiRun.update({
      where: { id: aiRun.id },
      data: {
        error: result.error || result.reason || "OpenAI reply could not be generated.",
        result: jsonValue(result),
      },
    });
    return { skipped: true, reason: result.reason || "openai_failed" };
  }

  let delivery: unknown = null;
  let deliveryError = "";
  let messageStatus: MessageStatus = MessageStatus.QUEUED;
  let commandStatus: AiCommandStatus = AiCommandStatus.DRAFT;

  if (shouldAutoReply) {
    try {
      delivery = await sendWhatsAppTextMessage({
        to: item.waId,
        body: result.reply,
      });
      const sent = Boolean(delivery && typeof delivery === "object" && (delivery as { sent?: boolean }).sent);
      messageStatus = sent ? MessageStatus.SENT : MessageStatus.QUEUED;
      commandStatus = sent ? AiCommandStatus.EXECUTED : AiCommandStatus.READY;
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "WhatsApp message could not be sent.";
      messageStatus = MessageStatus.FAILED;
      commandStatus = AiCommandStatus.FAILED;
    }
  }

  const outbound = await prisma.message.create({
    data: {
      businessId: item.businessId,
      conversationId: item.conversationId,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.AI,
      messageType: MessageType.TEXT,
      body: result.reply,
      status: messageStatus,
      metadata: jsonValue({
        aiRunId: aiRun.id,
        mode: shouldAutoReply ? "auto_reply" : "suggest_only",
        model: result.model,
        delivery,
        deliveryError,
      }),
      sentAt: messageStatus === MessageStatus.SENT ? new Date() : undefined,
      failedReason: deliveryError || undefined,
    },
  });

  await prisma.aiCommand.create({
    data: {
      businessId: item.businessId,
      conversationId: item.conversationId,
      aiRunId: aiRun.id,
      type: AiCommandType.SEND_WHATSAPP_MESSAGE,
      status: commandStatus,
      requiresPaymentConfirmed: false,
      payload: jsonValue({
        to: item.waId,
        body: result.reply,
        mode: shouldAutoReply ? "auto_reply" : "suggest_only",
      }),
      result: jsonValue({ outboundMessageId: outbound.id, delivery }),
      error: deliveryError || undefined,
      executedAt: commandStatus === AiCommandStatus.EXECUTED ? new Date() : undefined,
    },
  });

  await prisma.aiRun.update({
    where: { id: aiRun.id },
    data: {
      result: jsonValue({
        reply: result.reply,
        outboundMessageId: outbound.id,
        mode: shouldAutoReply ? "auto_reply" : "suggest_only",
      }),
    },
  });

  return {
    skipped: false,
    mode: shouldAutoReply ? "auto_reply" : "suggest_only",
    outboundMessageId: outbound.id,
  };
}

async function storeInboundMessages(rawPayload: unknown) {
  const business = await ensureDefaultBusiness();
  const normalizedMessages = normalizeWhatsAppWebhookPayload(rawPayload);
  const storedMessages: StoredInboundMessage[] = [];

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

    const existingInboundMessage = await prisma.message.findUnique({
      where: {
        businessId_externalMessageId: {
          businessId: business.id,
          externalMessageId: message.messageId,
        },
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

    storedMessages.push({
      businessId: business.id,
      conversationId: conversation.id,
      contactId: contact.id,
      customerName: message.displayName,
      waId: message.waId,
      text: message.text,
      messageType: messageType(message.messageType),
      created: !existingInboundMessage,
    });
  }

  return storedMessages;
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
    const storedMessages = await storeInboundMessages(payload);
    const ai = [];
    for (const message of storedMessages) {
      ai.push(await handleAiForInboundMessage(message));
    }
    return json(200, { ok: true, stored: storedMessages.length, ai });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp webhook could not be processed.",
    });
  }
}
