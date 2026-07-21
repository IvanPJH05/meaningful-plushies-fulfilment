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
import { getWhatsAppAssistantTraining } from "@/src/modules/crm/whatsapp-ai-settings";
import {
  createWhatsAppAssistantReply,
  type WhatsAppAssistantMessage,
} from "@/src/modules/openai/whatsapp-assistant";
import {
  fallbackWhatsAppMediaContentType,
  whatsappMediaFromMessageMetadata,
} from "@/src/modules/whatsapp/media-metadata";
import {
  sendWhatsAppImageMessage,
  sendWhatsAppReactionMessage,
  sendWhatsAppTextMessage,
  sendWhatsAppVideoMessage,
} from "@/src/modules/whatsapp/outbound";
import { whatsAppDisplayTextFromMessage } from "@/src/modules/whatsapp/webhook-normalizer";

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

function rawWhatsAppMessageFromMetadata(metadata: unknown) {
  const root = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const raw = root.raw && typeof root.raw === "object" && !Array.isArray(root.raw)
    ? root.raw as Record<string, unknown>
    : {};
  return Object.keys(raw).length ? raw : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function whatsAppReactionFromMetadata(metadata: unknown) {
  const raw = rawWhatsAppMessageFromMetadata(metadata);
  if (!raw || stringValue(raw.type).toLowerCase() !== "reaction") return null;

  const reaction = recordValue(raw.reaction);
  const context = recordValue(raw.context);
  const emoji = stringValue(reaction.emoji);
  const targetExternalMessageId = firstStringValue(
    reaction.message_id,
    reaction.messageId,
    reaction.id,
    context.message_id,
    context.messageId,
    context.id,
  );

  return {
    emoji,
    targetExternalMessageId,
    actorKey: firstStringValue(raw.from, raw.to, `${raw.direction || ""}:${raw.sender_type || ""}`),
    removed: !emoji,
  };
}

function rawWhatsAppContextExternalId(metadata: unknown) {
  const raw = rawWhatsAppMessageFromMetadata(metadata);
  if (!raw) return "";
  const context = recordValue(raw.context);
  return firstStringValue(context.message_id, context.messageId, context.id);
}

function deliveryMessageId(delivery: unknown) {
  const root = recordValue(delivery);
  const response = recordValue(root.response);
  const messages = Array.isArray(response.messages) ? response.messages : [];
  const firstMessage = recordValue(messages[0]);
  return firstStringValue(firstMessage.id);
}

function rawWhatsAppDisplayText(metadata: unknown) {
  const raw = rawWhatsAppMessageFromMetadata(metadata);
  return raw ? whatsAppDisplayTextFromMessage(raw) : "";
}

function outboundMediaFromMetadata(messageId: string, metadata: unknown) {
  const root = recordValue(metadata);
  const media = recordValue(root.media);
  const url = stringValue(media.url);
  if (!url) return null;

  return {
    id: `outbound-media-${messageId}`,
    originalName: stringValue(media.filename) || "Flow image",
    contentType: stringValue(media.contentType) || stringValue(media.mimeType) || "image/jpeg",
    sizeBytes: null,
    previewCacheKey: `outbound-media:${url}`,
    url,
    downloadUrl: url,
  };
}

function messagePreview(message: {
  body: string | null;
  messageType?: MessageType | null;
  metadata?: unknown;
  attachments?: { contentType: string | null }[];
}) {
  const reaction = whatsAppReactionFromMetadata(message.metadata);
  if (reaction) return reaction.emoji ? `${reaction.emoji} reaction` : "Reaction removed";

  const text = textPreview(message.body);
  if (text) return text;

  const rawText = textPreview(rawWhatsAppDisplayText(message.metadata));
  if (rawText) return rawText;

  const attachment = message.attachments?.[0];
  if (attachment) return mediaPreviewLabel(attachment.contentType);

  return messageTypePreviewLabel(message.messageType);
}

function serializedMessageSenderLabel(message: {
  direction: MessageDirection;
  senderType: MessageSenderType;
}) {
  if (message.direction === MessageDirection.INBOUND) return "Customer";
  if (message.senderType === MessageSenderType.AI) return "AI";
  if (message.senderType === MessageSenderType.SYSTEM) return "System";
  return "You";
}

function replyPreviewForMessage(message: {
  id: string;
  externalMessageId: string | null;
  direction: MessageDirection;
  senderType: MessageSenderType;
  messageType?: MessageType | null;
  body: string | null;
  metadata?: unknown;
  createdAt?: Date | null;
  attachments?: { contentType: string | null }[];
}) {
  return {
    id: message.id,
    externalMessageId: message.externalMessageId,
    senderLabel: serializedMessageSenderLabel(message),
    preview: messagePreview(message),
    createdAt: serializeDate(message.createdAt),
  };
}

function replyPreviewFromMetadata(metadata: unknown) {
  const root = recordValue(metadata);
  const replyTo = recordValue(root.replyTo);
  const preview = stringValue(replyTo.preview);
  if (!preview) return null;

  return {
    id: stringValue(replyTo.id) || undefined,
    externalMessageId: stringValue(replyTo.externalMessageId) || undefined,
    senderLabel: stringValue(replyTo.senderLabel) || "Message",
    preview,
    createdAt: stringValue(replyTo.createdAt) || null,
  };
}

function messageBody(message: {
  body: string | null;
  metadata?: unknown;
  messageType?: MessageType | null;
  attachments?: { contentType: string | null }[];
}) {
  const reaction = whatsAppReactionFromMetadata(message.metadata);
  if (reaction) return reaction.emoji || "Reaction removed";

  const body = (message.body || "").trim();
  if (body) return message.body || "";

  const rawText = rawWhatsAppDisplayText(message.metadata);
  if (rawText) return rawText;

  if (message.attachments?.length) return "";
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

type InboxScope = "all" | "list" | "conversation" | "details";

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

async function getConversationList(businessId: string, limit = 75) {
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
          metadata: true,
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
    take: limit,
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

async function getSelectedConversation(
  businessId: string,
  conversationId?: string | null,
  includeDetails = true,
) {
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
          ...(includeDetails
            ? {
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
              }
            : {}),
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
      detailsLoaded: includeDetails,
      leads: includeDetails && "leads" in selectedConversation ? selectedConversation.leads.map((lead) => ({
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
      })) : [],
      commands: includeDetails && "aiCommands" in selectedConversation ? selectedConversation.aiCommands.map((command) => ({
        id: command.id,
        type: command.type,
        status: command.status,
        error: command.error,
        executedAt: serializeDate(command.executedAt),
        createdAt: serializeDate(command.createdAt),
      })) : [],
    }
    : null;
}

async function getConversationMessages(businessId: string, conversationId?: string | null, limit = 90) {
  const messages = conversationId
    ? (await prisma.message.findMany({
      where: { businessId, conversationId },
      select: {
        id: true,
        externalMessageId: true,
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
            storageKey: true,
            originalName: true,
            contentType: true,
            sizeBytes: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit * 2, 360),
    })).reverse()
    : [];

  type MessageReaction = {
    id: string;
    emoji: string;
    direction: MessageDirection;
    senderType: MessageSenderType;
    createdAt: string | null;
  };

  const reactionsByTarget = new Map<string, Map<string, MessageReaction>>();
  const displayMessages = [];
  const messagesByExternalId = new Map<string, typeof messages[number]>();

  for (const message of messages) {
    if (message.externalMessageId) {
      messagesByExternalId.set(message.externalMessageId, message);
    }
  }

  for (const message of messages) {
    const reaction = whatsAppReactionFromMetadata(message.metadata);
    if (reaction?.targetExternalMessageId) {
      const actorKey = reaction.actorKey || `${message.direction}:${message.senderType}`;
      const targetReactions = reactionsByTarget.get(reaction.targetExternalMessageId) || new Map<string, MessageReaction>();
      if (reaction.removed) {
        targetReactions.delete(actorKey);
      } else {
        targetReactions.set(actorKey, {
          id: message.id,
          emoji: reaction.emoji,
          direction: message.direction,
          senderType: message.senderType,
          createdAt: serializeDate(message.createdAt),
        });
      }
      reactionsByTarget.set(reaction.targetExternalMessageId, targetReactions);
      continue;
    }

    displayMessages.push(message);
  }

  return displayMessages.slice(-limit).map((message) => {
    const attachments = message.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      previewCacheKey: attachment.storageKey || (
        attachment.sizeBytes
          ? `${attachment.contentType}:${attachment.sizeBytes}:${attachment.originalName || ""}`
          : null
      ),
      url: `/api/crm/inbox/attachments/${attachment.id}`,
      downloadUrl: `/api/crm/inbox/attachments/${attachment.id}?download=1`,
    }));
    const media = attachments.length
      ? null
      : whatsappMediaFromMessageMetadata(message.metadata, message.messageType);
    const outboundMedia = !attachments.length && !media
      ? outboundMediaFromMetadata(message.id, message.metadata)
      : null;

    const savedReply = replyPreviewFromMetadata(message.metadata);
    const contextExternalMessageId = rawWhatsAppContextExternalId(message.metadata);
    const contextReply = contextExternalMessageId ? messagesByExternalId.get(contextExternalMessageId) : null;

    return {
      id: message.id,
      direction: message.direction,
      senderType: message.senderType,
      messageType: message.messageType,
      body: messageBody({
        body: message.body,
        metadata: message.metadata,
        messageType: message.messageType,
        attachments,
      }),
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
          previewCacheKey: `whatsapp-media:${media.id}`,
          url: `/api/crm/inbox/messages/${message.id}/media`,
          downloadUrl: `/api/crm/inbox/messages/${message.id}/media?download=1`,
        }]
        : outboundMedia
          ? [outboundMedia]
          : attachments,
      reactions: message.externalMessageId
        ? Array.from(reactionsByTarget.get(message.externalMessageId)?.values() || [])
        : [],
      replyTo: savedReply || (contextReply ? replyPreviewForMessage(contextReply) : null),
    };
  });
}

async function getInbox(
  conversationId?: string | null,
  scope: InboxScope = "all",
  listLimit = 75,
  messageLimit = 90,
  includeDetails = true,
) {
  const business = await ensureDefaultBusiness();
  const conversations = scope === "conversation" || scope === "details" ? [] : await getConversationList(business.id, listLimit);
  const selectedConversationId = conversationId || conversations[0]?.id || null;
  const selectedConversation = scope === "list" ? null : await getSelectedConversation(business.id, selectedConversationId, includeDetails);
  const messages = scope === "list" || scope === "details" ? [] : await getConversationMessages(business.id, selectedConversationId, messageLimit);

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
    const scope: InboxScope = requestedScope === "list" || requestedScope === "conversation" || requestedScope === "details"
      ? requestedScope
      : "all";
    const limit = clampNumber(url.searchParams.get("limit"), 75, 1, 1000);
    const messageLimit = clampNumber(url.searchParams.get("messageLimit"), 90, 1, 180);
    const includeDetails = scope === "details" || url.searchParams.get("details") !== "0";
    return json(200, { ok: true, inbox: await getInbox(conversationId, scope, limit, messageLimit, includeDetails) });
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
      replyToMessageId?: string;
      targetMessageId?: string;
      reactionEmoji?: string;
      mediaType?: string;
      mediaUrl?: string;
      action?: "send" | "suggest" | "react";
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

      const training = await getWhatsAppAssistantTraining(business.id);
      if (!training.enabled) {
        return json(400, { ok: false, error: "WhatsApp AI suggestions are turned off in CRM setup." });
      }

      const suggestion = await createWhatsAppAssistantReply({
        customerName: conversation.contact.displayName || conversation.contact.phone || undefined,
        customerPhone: conversation.contact.phone || conversation.contact.waId || undefined,
        latestMessage: latestCustomerMessage.body,
        training,
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
            promptVersion: "whatsapp-sales-v2",
            humanReviewRequired: training.requiresHumanReview,
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

    if (body.action === "react") {
      const emoji = stringValue(body.reactionEmoji);
      if (!emoji) {
        return json(400, { ok: false, error: "Reaction emoji is required." });
      }

      const targetMessage = body.targetMessageId
        ? await prisma.message.findFirst({
          where: {
            businessId: business.id,
            conversationId: conversation.id,
            id: body.targetMessageId,
          },
          select: {
            id: true,
            externalMessageId: true,
          },
        })
        : null;

      if (!targetMessage) {
        return json(404, { ok: false, error: "Message not found." });
      }

      if (!targetMessage.externalMessageId) {
        return json(400, {
          ok: false,
          error: "This message cannot be reacted to until WhatsApp confirms it.",
        });
      }

      let delivery: unknown = null;
      let deliveryError = "";
      let status: MessageStatus = MessageStatus.QUEUED;

      try {
        delivery = await sendWhatsAppReactionMessage({
          to: recipient,
          messageId: targetMessage.externalMessageId,
          emoji,
        });
        const sent = Boolean(delivery && typeof delivery === "object" && (delivery as { sent?: boolean }).sent);
        status = sent ? MessageStatus.SENT : MessageStatus.QUEUED;
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : "WhatsApp reaction could not be sent.";
        status = MessageStatus.FAILED;
      }

      const externalMessageId = deliveryMessageId(delivery);
      const message = await prisma.message.create({
        data: {
          businessId: business.id,
          conversationId: conversation.id,
          externalMessageId: externalMessageId || undefined,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.TEAM,
          messageType: MessageType.SYSTEM,
          body: emoji,
          status,
          metadata: jsonValue({
            sentFromInbox: true,
            raw: {
              type: "reaction",
              from: process.env.WHATSAPP_PHONE_NUMBER_ID || "team",
              to: recipient,
              direction: "OUTBOUND",
              sender_type: "TEAM",
              reaction: {
                message_id: targetMessage.externalMessageId,
                emoji,
              },
            },
            delivery,
          }),
          sentAt: status === MessageStatus.SENT ? new Date() : undefined,
          failedReason: deliveryError || undefined,
        },
      });

      return json(200, {
        ok: status !== MessageStatus.FAILED,
        delivery,
        error: deliveryError || undefined,
        reaction: {
          id: message.id,
          emoji,
          direction: message.direction,
          senderType: message.senderType,
          createdAt: serializeDate(message.createdAt),
        },
        targetMessageId: targetMessage.id,
      });
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

    const replyToMessage = body.replyToMessageId
      ? await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          id: body.replyToMessageId,
        },
        select: {
          id: true,
          externalMessageId: true,
          direction: true,
          senderType: true,
          messageType: true,
          body: true,
          metadata: true,
          createdAt: true,
          attachments: {
            select: { contentType: true },
            take: 1,
          },
        },
      })
      : null;
    const replyContextMessageId = replyToMessage?.externalMessageId || undefined;
    const replyToMetadata = replyToMessage ? replyPreviewForMessage(replyToMessage) : null;

    const mediaType = stringValue(body.mediaType).toLowerCase();
    const mediaUrl = stringValue(body.mediaUrl);
    const sendingImage = mediaType === "image" && Boolean(mediaUrl);
    const sendingVideo = mediaType === "video" && Boolean(mediaUrl);
    const sendingMedia = sendingImage || sendingVideo;
    const messageBody = (body.body || existingMessage?.body || "").trim();
    if (!messageBody && !sendingMedia) {
      return json(400, { ok: false, error: "Message body or media is required." });
    }

    let delivery: unknown = null;
    let deliveryError = "";
    let status: MessageStatus = MessageStatus.QUEUED;
    const outboundMessageType = sendingImage ? MessageType.IMAGE : sendingVideo ? MessageType.VIDEO : MessageType.TEXT;
    const mediaContentType = sendingVideo ? "video/mp4" : "image/jpeg";
    const mediaFilename = sendingVideo ? "Flow video" : "Flow image";

    try {
      delivery = sendingImage
        ? await sendWhatsAppImageMessage({
          to: recipient,
          imageUrl: mediaUrl,
          caption: messageBody || undefined,
          contextMessageId: replyContextMessageId,
        })
        : sendingVideo
          ? await sendWhatsAppVideoMessage({
            to: recipient,
            videoUrl: mediaUrl,
            caption: messageBody || undefined,
            contextMessageId: replyContextMessageId,
          })
        : await sendWhatsAppTextMessage({
          to: recipient,
          body: messageBody,
          contextMessageId: replyContextMessageId,
        });
      const sent = Boolean(delivery && typeof delivery === "object" && (delivery as { sent?: boolean }).sent);
      status = sent ? MessageStatus.SENT : MessageStatus.QUEUED;
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "WhatsApp message could not be sent.";
      status = MessageStatus.FAILED;
    }

    const externalMessageId = deliveryMessageId(delivery);
    const message = existingMessage
      ? await prisma.message.update({
        where: { id: existingMessage.id },
        data: {
          externalMessageId: externalMessageId || existingMessage.externalMessageId || undefined,
          body: messageBody,
          messageType: outboundMessageType,
          status,
          metadata: jsonValue({
            ...(existingMessage.metadata && typeof existingMessage.metadata === "object" ? existingMessage.metadata : {}),
            sentFromInbox: true,
            ...(sendingMedia ? { media: { url: mediaUrl, contentType: mediaContentType, filename: mediaFilename } } : {}),
            ...(replyToMetadata ? { replyTo: replyToMetadata } : {}),
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
          externalMessageId: externalMessageId || undefined,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.TEAM,
          messageType: outboundMessageType,
          body: messageBody,
          status,
          metadata: jsonValue({
            sentFromInbox: true,
            ...(sendingMedia ? { media: { url: mediaUrl, contentType: mediaContentType, filename: mediaFilename } } : {}),
            ...(replyToMetadata ? { replyTo: replyToMetadata } : {}),
            delivery,
          }),
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
        replyTo: replyToMetadata,
        attachments: sendingMedia
          ? [{
            id: `outbound-${mediaType}-${message.id}`,
            originalName: mediaFilename,
            contentType: mediaContentType,
            sizeBytes: null,
            previewCacheKey: `outbound-${mediaType}:${mediaUrl}`,
            url: mediaUrl,
            downloadUrl: mediaUrl,
          }]
          : [],
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp message could not be sent.",
    });
  }
}
