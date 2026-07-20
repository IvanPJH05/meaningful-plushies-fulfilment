import { NextResponse } from "next/server";
import {
  AiMode,
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  createWhatsAppAssistantReply,
  type WhatsAppAssistantMessage,
} from "@/src/modules/openai/whatsapp-assistant";
import {
  fallbackWhatsAppMediaContentType,
  whatsappMediaFromMessageMetadata,
} from "@/src/modules/whatsapp/media-metadata";
import { sendWhatsAppTextMessage } from "@/src/modules/whatsapp/outbound";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function textPreview(body: string | null | undefined) {
  const text = (body || "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function mediaPreviewLabel(contentType: string | null | undefined) {
  const type = (contentType || "").toLowerCase();
  if (type.startsWith("image/")) return "Photo";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Voice message";
  if (type.includes("pdf")) return "PDF";
  return "Attachment";
}

function messageTypePreviewLabel(messageType: MessageType | null | undefined) {
  switch (messageType) {
    case MessageType.IMAGE:
      return "Photo";
    case MessageType.VIDEO:
      return "Video";
    case MessageType.AUDIO:
      return "Voice message";
    case MessageType.DOCUMENT:
      return "Document";
    case MessageType.TEMPLATE:
      return "Template message";
    case MessageType.SYSTEM:
      return "System message";
    case MessageType.TEXT:
    default:
      return "Message";
  }
}

function messagePreview(message: {
  body: string | null;
  messageType?: MessageType | null;
  attachments?: { contentType: string | null }[];
}) {
  const text = textPreview(message.body);
  if (text) return text;

  const attachment = message.attachments?.[0];
  if (attachment) return mediaPreviewLabel(attachment.contentType);

  return messageTypePreviewLabel(message.messageType);
}

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function assistantDirection(direction: MessageDirection, senderType: MessageSenderType): WhatsAppAssistantMessage["direction"] {
  if (direction === MessageDirection.INBOUND) return "customer";
  if (senderType === MessageSenderType.TEAM) return "team";
  if (senderType === MessageSenderType.AI) return "assistant";
  return "system";
}

function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === "string" && Object.values(ConversationStatus).includes(value as ConversationStatus);
}

function isAiMode(value: unknown): value is AiMode {
  return typeof value === "string" && Object.values(AiMode).includes(value as AiMode);
}

type InboxScope = "all" | "list" | "conversation";

async function getConversationList(businessId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { businessId },
    select: {
      id: true,
      status: true,
      aiMode: true,
      unreadCount: true,
      lastMessageAt: true,
      updatedAt: true,
      contact: {
        select: {
          id: true,
          waId: true,
          phone: true,
          displayName: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          messageType: true,
          direction: true,
          senderType: true,
          status: true,
          createdAt: true,
          attachments: {
            select: { contentType: true },
            take: 1,
          },
        },
        take: 1,
      },
    },
    orderBy: [
      { lastMessageAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: 75,
  });

  return conversations.map((conversation) => {
    const lastMessage = conversation.messages[0];
    return {
      id: conversation.id,
      status: conversation.status,
      aiMode: conversation.aiMode,
      unreadCount: conversation.unreadCount,
      lastMessageAt: serializeDate(conversation.lastMessageAt || conversation.updatedAt),
      contact: {
        id: conversation.contact.id,
        waId: conversation.contact.waId,
        phone: conversation.contact.phone,
        displayName: conversation.contact.displayName || conversation.contact.phone || conversation.contact.waId || "WhatsApp customer",
      },
      lastMessage: lastMessage
        ? {
          id: lastMessage.id,
          preview: messagePreview(lastMessage),
          direction: lastMessage.direction,
          senderType: lastMessage.senderType,
          status: lastMessage.status,
          createdAt: serializeDate(lastMessage.createdAt),
        }
        : null,
    };
  });
}

async function getSelectedConversation(businessId: string, conversationId?: string | null) {
  const selectedConversation = conversationId
    ? await prisma.conversation.findFirst({
        where: { businessId, id: conversationId },
        select: {
          id: true,
          status: true,
          aiMode: true,
          unreadCount: true,
          lastMessageAt: true,
          updatedAt: true,
          contact: {
            select: {
              id: true,
              waId: true,
              phone: true,
              displayName: true,
              email: true,
              source: true,
              tags: true,
            },
          },
          leads: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              stage: true,
              temperature: true,
              customerName: true,
              phone: true,
              requestedCharacter: true,
              requestedVoice: true,
              estimatedValue: true,
              paymentStatus: true,
              paidAmount: true,
              manualOrderId: true,
              manualOrderLinkSentAt: true,
              updatedAt: true,
            },
            take: 5,
          },
          aiCommands: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              status: true,
              error: true,
              executedAt: true,
              createdAt: true,
            },
            take: 5,
          },
        },
      })
    : null;

  return selectedConversation
    ? {
      id: selectedConversation.id,
      status: selectedConversation.status,
      aiMode: selectedConversation.aiMode,
      unreadCount: selectedConversation.unreadCount,
      lastMessageAt: serializeDate(selectedConversation.lastMessageAt || selectedConversation.updatedAt),
      contact: {
        id: selectedConversation.contact.id,
        waId: selectedConversation.contact.waId,
        phone: selectedConversation.contact.phone,
        displayName: selectedConversation.contact.displayName || selectedConversation.contact.phone || selectedConversation.contact.waId || "WhatsApp customer",
        email: selectedConversation.contact.email,
        source: selectedConversation.contact.source,
        tags: selectedConversation.contact.tags,
      },
      leads: selectedConversation.leads.map((lead) => ({
        id: lead.id,
        stage: lead.stage,
        temperature: lead.temperature,
        customerName: lead.customerName,
        phone: lead.phone,
        requestedCharacter: lead.requestedCharacter,
        requestedVoice: lead.requestedVoice,
        estimatedValue: decimalNumber(lead.estimatedValue),
        paymentStatus: lead.paymentStatus,
        paidAmount: decimalNumber(lead.paidAmount),
        manualOrderId: lead.manualOrderId,
        manualOrderLinkSentAt: serializeDate(lead.manualOrderLinkSentAt),
        updatedAt: serializeDate(lead.updatedAt),
      })),
      commands: selectedConversation.aiCommands.map((command) => ({
        id: command.id,
        type: command.type,
        status: command.status,
        error: command.error,
        executedAt: serializeDate(command.executedAt),
        createdAt: serializeDate(command.createdAt),
      })),
    }
    : null;
}

async function getConversationMessages(businessId: string, conversationId?: string | null) {
  const messages = conversationId
    ? (await prisma.message.findMany({
      where: { businessId, conversationId },
      select: {
        id: true,
        direction: true,
        senderType: true,
        messageType: true,
        body: true,
        status: true,
        failedReason: true,
        metadata: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        attachments: {
          select: {
            id: true,
            originalName: true,
            contentType: true,
            sizeBytes: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 180,
    })).reverse()
    : [];

  return messages.map((message) => {
    const attachments = message.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      url: `/api/crm/inbox/attachments/${attachment.id}`,
      downloadUrl: `/api/crm/inbox/attachments/${attachment.id}?download=1`,
    }));
    const media = attachments.length
      ? null
      : whatsappMediaFromMessageMetadata(message.metadata, message.messageType);

    return {
      id: message.id,
      direction: message.direction,
      senderType: message.senderType,
      messageType: message.messageType,
      body: message.body || "",
      status: message.status,
      failedReason: message.failedReason,
      createdAt: serializeDate(message.createdAt),
      sentAt: serializeDate(message.sentAt),
      deliveredAt: serializeDate(message.deliveredAt),
      readAt: serializeDate(message.readAt),
      attachments: media
        ? [{
          id: `whatsapp-media-${message.id}`,
          originalName: media.filename || null,
          contentType: media.mimeType || fallbackWhatsAppMediaContentType(message.messageType),
          sizeBytes: null,
          url: `/api/crm/inbox/messages/${message.id}/media`,
          downloadUrl: `/api/crm/inbox/messages/${message.id}/media?download=1`,
        }]
        : attachments,
    };
  });
}

async function getInbox(conversationId?: string | null, scope: InboxScope = "all") {
  const business = await ensureDefaultBusiness();
  const conversations = scope === "conversation" ? [] : await getConversationList(business.id);
  const selectedConversationId = conversationId || conversations[0]?.id || null;
  const selectedConversation = scope === "list" ? null : await getSelectedConversation(business.id, selectedConversationId);
  const messages = scope === "list" ? [] : await getConversationMessages(business.id, selectedConversationId);

  return {
    conversations,
    selectedConversation,
    messages,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    const requestedScope = url.searchParams.get("scope");
    const scope: InboxScope = requestedScope === "list" || requestedScope === "conversation" ? requestedScope : "all";
    return json(200, { ok: true, inbox: await getInbox(conversationId, scope) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "CRM inbox could not be loaded.",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const body = await request.json().catch(() => ({})) as {
      conversationId?: string;
      status?: unknown;
      aiMode?: unknown;
      displayName?: unknown;
    };

    if (!body.conversationId) {
      return json(400, { ok: false, error: "conversationId is required." });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { businessId: business.id, id: body.conversationId },
      include: { contact: true },
    });
    if (!conversation) {
      return json(404, { ok: false, error: "Conversation not found." });
    }

    const conversationData: {
      status?: ConversationStatus;
      aiMode?: AiMode;
      unreadCount?: number;
    } = {};
    if (body.status !== undefined) {
      if (!isConversationStatus(body.status)) {
        return json(400, { ok: false, error: "Choose a valid conversation status." });
      }
      conversationData.status = body.status;
      if (body.status !== ConversationStatus.WAITING_TEAM) {
        conversationData.unreadCount = 0;
      }
    }
    if (body.aiMode !== undefined) {
      if (!isAiMode(body.aiMode)) {
        return json(400, { ok: false, error: "Choose a valid AI mode." });
      }
      conversationData.aiMode = body.aiMode;
    }

    if (Object.keys(conversationData).length) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: conversationData,
      });
    }

    if (typeof body.displayName === "string" && body.displayName.trim()) {
      await prisma.contact.update({
        where: { id: conversation.contact.id },
        data: { displayName: body.displayName.trim() },
      });
    }

    return json(200, { ok: true, inbox: await getInbox(body.conversationId) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Conversation could not be updated.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const body = await request.json().catch(() => ({})) as {
      conversationId?: string;
      body?: string;
      messageId?: string;
      action?: "send" | "suggest";
    };

    if (!body.conversationId) {
      return json(400, { ok: false, error: "conversationId is required." });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { businessId: business.id, id: body.conversationId },
      include: { contact: true },
    });
    if (!conversation) {
      return json(404, { ok: false, error: "Conversation not found." });
    }

    if (body.action === "suggest") {
      const recentDescending = await prisma.message.findMany({
        where: { businessId: business.id, conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const recentMessages = recentDescending.reverse();
      const latestCustomerMessage = [...recentMessages]
        .reverse()
        .find((message) => message.direction === MessageDirection.INBOUND && message.body?.trim());

      if (!latestCustomerMessage?.body?.trim()) {
        return json(400, { ok: false, error: "There is no customer message for AI to reply to yet." });
      }

      const suggestion = await createWhatsAppAssistantReply({
        customerName: conversation.contact.displayName || conversation.contact.phone || undefined,
        customerPhone: conversation.contact.phone || conversation.contact.waId || undefined,
        latestMessage: latestCustomerMessage.body,
        recentMessages: recentMessages
          .filter((message) => message.body?.trim())
          .map((message) => ({
            direction: assistantDirection(message.direction, message.senderType),
            body: message.body || "",
          })),
      });

      if (!suggestion.ok || !suggestion.reply) {
        const error = suggestion.reason === "missing_openai_api_key"
          ? "OPENAI_API_KEY is missing in Vercel, so AI replies cannot be generated yet."
          : suggestion.error || "AI reply could not be generated.";
        return json(400, { ok: false, error });
      }

      const message = await prisma.message.create({
        data: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.AI,
          messageType: MessageType.TEXT,
          body: suggestion.reply,
          status: MessageStatus.QUEUED,
          metadata: jsonValue({
            generatedFromInbox: true,
            model: suggestion.model,
            promptVersion: "whatsapp-sales-v1",
          }),
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
        },
      });

      return json(200, {
        ok: true,
        message: {
          id: message.id,
          direction: message.direction,
          senderType: message.senderType,
          messageType: message.messageType,
          body: message.body || "",
          status: message.status,
          failedReason: message.failedReason,
          createdAt: serializeDate(message.createdAt),
          sentAt: serializeDate(message.sentAt),
        },
      });
    }

    const recipient = conversation.contact.waId || conversation.contact.phone;
    if (!recipient) {
      return json(400, { ok: false, error: "This contact has no WhatsApp phone number." });
    }

    const existingMessage = body.messageId
      ? await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          id: body.messageId,
        },
      })
      : null;

    const messageBody = (body.body || existingMessage?.body || "").trim();
    if (!messageBody) {
      return json(400, { ok: false, error: "Message body is required." });
    }

    let delivery: unknown = null;
    let deliveryError = "";
    let status: MessageStatus = MessageStatus.QUEUED;

    try {
      delivery = await sendWhatsAppTextMessage({ to: recipient, body: messageBody });
      const sent = Boolean(delivery && typeof delivery === "object" && (delivery as { sent?: boolean }).sent);
      status = sent ? MessageStatus.SENT : MessageStatus.QUEUED;
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "WhatsApp message could not be sent.";
      status = MessageStatus.FAILED;
    }

    const message = existingMessage
      ? await prisma.message.update({
        where: { id: existingMessage.id },
        data: {
          body: messageBody,
          status,
          metadata: jsonValue({
            ...(existingMessage.metadata && typeof existingMessage.metadata === "object" ? existingMessage.metadata : {}),
            sentFromInbox: true,
            delivery,
          }),
          sentAt: status === MessageStatus.SENT ? new Date() : existingMessage.sentAt,
          failedReason: deliveryError || undefined,
        },
      })
      : await prisma.message.create({
        data: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.TEAM,
          messageType: MessageType.TEXT,
          body: messageBody,
          status,
          metadata: jsonValue({ sentFromInbox: true, delivery }),
          sentAt: status === MessageStatus.SENT ? new Date() : undefined,
          failedReason: deliveryError || undefined,
        },
      });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "WAITING_CUSTOMER",
        unreadCount: 0,
        lastMessageAt: new Date(),
      },
    });

    return json(200, {
      ok: status !== MessageStatus.FAILED,
      delivery,
      error: deliveryError || undefined,
      message: {
        id: message.id,
        direction: message.direction,
        senderType: message.senderType,
        messageType: message.messageType,
        body: message.body || "",
        status: message.status,
        failedReason: message.failedReason,
        createdAt: serializeDate(message.createdAt),
        sentAt: serializeDate(message.sentAt),
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp message could not be sent.",
    });
  }
}
