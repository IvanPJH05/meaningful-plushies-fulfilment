import { NextResponse } from "next/server";
import {
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
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

function messagePreview(body: string | null | undefined) {
  const text = (body || "").replace(/\s+/g, " ").trim();
  if (!text) return "No message text";
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

async function getInbox(conversationId?: string | null) {
  const business = await ensureDefaultBusiness();
  const conversations = await prisma.conversation.findMany({
    where: { businessId: business.id },
    include: {
      contact: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [
      { lastMessageAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: 75,
  });

  const selectedConversationId = conversationId || conversations[0]?.id || null;
  const selectedConversation = selectedConversationId
    ? conversations.find((item) => item.id === selectedConversationId)
      || await prisma.conversation.findFirst({
        where: { businessId: business.id, id: selectedConversationId },
        include: { contact: true },
      })
    : null;

  const messages = selectedConversationId
    ? await prisma.message.findMany({
      where: { businessId: business.id, conversationId: selectedConversationId },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
      take: 250,
    })
    : [];

  return {
    conversations: conversations.map((conversation) => {
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
            preview: messagePreview(lastMessage.body),
            direction: lastMessage.direction,
            senderType: lastMessage.senderType,
            status: lastMessage.status,
            createdAt: serializeDate(lastMessage.createdAt),
          }
          : null,
      };
    }),
    selectedConversation: selectedConversation
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
        },
      }
      : null,
    messages: messages.map((message) => ({
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
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      })),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    return json(200, { ok: true, inbox: await getInbox(conversationId) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "CRM inbox could not be loaded.",
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
