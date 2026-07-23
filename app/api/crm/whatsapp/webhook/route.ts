import { after, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  AiCommandStatus,
  AiCommandType,
  ConversationStatus,
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
import {
  enqueueWhatsAppMediaJobsForMessages,
  processDueWhatsAppMediaJobs,
} from "@/src/modules/whatsapp/media-jobs";
import { fallbackWhatsAppMediaContentType } from "@/src/modules/whatsapp/media-metadata";
import {
  sendWhatsAppButtonMessage,
  sendWhatsAppDocumentMessage,
  sendWhatsAppImageMessage,
  sendWhatsAppTextMessage,
  sendWhatsAppVideoMessage,
} from "@/src/modules/whatsapp/outbound";
import { verifyWebhookChallenge } from "@/src/modules/whatsapp/webhook-verification";
import {
  normalizeWhatsAppWebhookPayload,
  type NormalizedWhatsAppMessageSource,
} from "@/src/modules/whatsapp/webhook-normalizer";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function hashPreview(value: string | null | undefined) {
  return createHash("sha256").update(value || "").digest("hex").slice(0, 12);
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function messageType(type: string) {
  if (type === "image") return MessageType.IMAGE;
  if (type === "audio") return MessageType.AUDIO;
  if (type === "video") return MessageType.VIDEO;
  if (type === "document") return MessageType.DOCUMENT;
  if (type === "button" || type === "interactive") return MessageType.TEXT;
  if (type !== "text") return MessageType.SYSTEM;
  return MessageType.TEXT;
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function payloadHasWhatsAppHistory(payload: unknown) {
  for (const entry of arrayValue(objectValue(payload).entry)) {
    for (const change of arrayValue(objectValue(entry).changes)) {
      const value = objectValue(objectValue(change).value);
      if (value.history !== undefined) return true;
    }
  }
  return false;
}

function payloadHasLiveWhatsAppMessages(payload: unknown) {
  for (const entry of arrayValue(objectValue(payload).entry)) {
    for (const change of arrayValue(objectValue(entry).changes)) {
      const value = objectValue(objectValue(change).value);
      if (arrayValue(value.messages).length || arrayValue(value.message_echoes).length) return true;
    }
  }
  return false;
}

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function timestampFromValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function whatsAppStatusError(status: Record<string, unknown>) {
  const firstError = objectValue(arrayValue(status.errors)[0]);
  const errorData = objectValue(firstError.error_data);
  return firstTextValue(
    errorData.details,
    firstError.message,
    firstError.title,
    status.status,
  );
}

type NormalizedWhatsAppStatus = {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  error: string;
};

function normalizeWhatsAppStatuses(payload: unknown): NormalizedWhatsAppStatus[] {
  const statuses: NormalizedWhatsAppStatus[] = [];
  const seen = new Set<string>();

  for (const entry of arrayValue(objectValue(payload).entry)) {
    for (const change of arrayValue(objectValue(entry).changes)) {
      const value = objectValue(objectValue(change).value);
      for (const item of arrayValue(value.statuses)) {
        const status = objectValue(item);
        const messageId = firstTextValue(status.id);
        const statusName = firstTextValue(status.status).toLowerCase();
        if (!messageId || !["sent", "delivered", "read", "failed"].includes(statusName)) continue;

        const key = `${messageId}:${statusName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        statuses.push({
          messageId,
          status: statusName as NormalizedWhatsAppStatus["status"],
          timestamp: timestampFromValue(status.timestamp),
          error: whatsAppStatusError(status),
        });
      }
    }
  }

  return statuses;
}

async function applyWhatsAppStatuses(payload: unknown) {
  const business = await ensureDefaultBusiness();
  const statuses = normalizeWhatsAppStatuses(payload);
  let updated = 0;

  for (const item of statuses) {
    if (item.status === "failed") {
      const result = await prisma.message.updateMany({
        where: {
          businessId: business.id,
          externalMessageId: item.messageId,
        },
        data: {
          status: MessageStatus.FAILED,
          failedReason: item.error || "WhatsApp could not deliver this message.",
        },
      });
      updated += result.count;
      continue;
    }

    if (item.status === "read") {
      const result = await prisma.message.updateMany({
        where: {
          businessId: business.id,
          externalMessageId: item.messageId,
          status: { not: MessageStatus.FAILED },
        },
        data: {
          status: MessageStatus.READ,
          deliveredAt: item.timestamp,
          readAt: item.timestamp,
          failedReason: null,
        },
      });
      updated += result.count;
      continue;
    }

    if (item.status === "delivered") {
      const result = await prisma.message.updateMany({
        where: {
          businessId: business.id,
          externalMessageId: item.messageId,
          status: { in: [MessageStatus.QUEUED, MessageStatus.SENT] },
        },
        data: {
          status: MessageStatus.DELIVERED,
          deliveredAt: item.timestamp,
          failedReason: null,
        },
      });
      updated += result.count;
      continue;
    }

    const result = await prisma.message.updateMany({
      where: {
        businessId: business.id,
        externalMessageId: item.messageId,
        status: MessageStatus.QUEUED,
      },
      data: {
        status: MessageStatus.SENT,
        sentAt: item.timestamp,
        failedReason: null,
      },
    });
    updated += result.count;
  }

  return { received: statuses.length, updated };
}

async function recordRawWhatsAppWebhook(args: {
  rawBody: string;
  payload: unknown;
  status: WebhookEventStatus;
  parsedMessageCount?: number;
  parsedStatusCount?: number;
  updatedStatusCount?: number;
  error?: string;
}) {
  const business = await ensureDefaultBusiness();
  const externalEventId = hashValue(args.rawBody);
  await prisma.webhookEvent.upsert({
    where: {
      businessId_source_externalEventId: {
        businessId: business.id,
        source: "meta_whatsapp_raw",
        externalEventId,
      },
    },
    update: {
      payload: jsonValue({
        raw: args.payload,
        parsedMessageCount: args.parsedMessageCount ?? null,
        parsedStatusCount: args.parsedStatusCount ?? null,
        updatedStatusCount: args.updatedStatusCount ?? null,
      }),
      status: args.status,
      processedAt: args.status === WebhookEventStatus.RECEIVED ? undefined : new Date(),
      error: args.error || null,
    },
    create: {
      businessId: business.id,
      source: "meta_whatsapp_raw",
      externalEventId,
      payload: jsonValue({
        raw: args.payload,
        parsedMessageCount: args.parsedMessageCount ?? null,
        parsedStatusCount: args.parsedStatusCount ?? null,
        updatedStatusCount: args.updatedStatusCount ?? null,
      }),
      status: args.status,
      processedAt: args.status === WebhookEventStatus.RECEIVED ? undefined : new Date(),
      error: args.error || null,
    },
  });
}

type StoredWhatsAppMessage = {
  messageId: string;
  businessId: string;
  conversationId: string;
  contactId: string;
  customerName: string;
  waId: string;
  direction: "inbound" | "outbound";
  text: string;
  messageType: MessageType;
  created: boolean;
  source: NormalizedWhatsAppMessageSource;
  raw: Record<string, unknown>;
};

function scheduleAiForStoredMessages(storedMessages: StoredWhatsAppMessage[]) {
  const aiMessages = storedMessages.filter((message) => (
    message.direction === "inbound"
    && message.source !== "history"
    && message.source !== "provider_history"
  ));

  if (aiMessages.length) {
    after(async () => {
      try {
        await Promise.all(aiMessages.map((message) => handleAiForInboundMessage(message)));
      } catch (error) {
        console.error("WhatsApp AI background task failed", error);
      }
    });
  }

  return aiMessages.length;
}

function mediaJobBatchLimit() {
  return Math.max(1, Math.min(Number(process.env.WHATSAPP_MEDIA_JOBS_PER_WEBHOOK || 3), 10));
}

function scheduleMediaForStoredMessages(storedMessages: StoredWhatsAppMessage[]) {
  const messageIds = Array.from(new Set(storedMessages.map((message) => message.messageId).filter(Boolean)));
  if (!messageIds.length) return 0;

  after(async () => {
    try {
      await enqueueWhatsAppMediaJobsForMessages(messageIds);
      await processDueWhatsAppMediaJobs({ limit: mediaJobBatchLimit() });
    } catch (error) {
      console.error("WhatsApp media background task failed", error);
    }
  });

  return messageIds.length;
}

type FlowStep = {
  type?: string;
  delayValue?: string;
  delayUnit?: string;
  message?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: Array<{ type?: string; url?: string; caption?: string; fileName?: string }>;
  options?: Array<{
    id?: string;
    label?: string;
    followUpMessage?: string;
    targetFlowId?: string;
    targetFlowName?: string;
  }>;
};

function deliveryMessageId(delivery: unknown) {
  const response = objectValue(objectValue(delivery).response);
  const firstMessage = objectValue(arrayValue(response.messages)[0]);
  return textValue(firstMessage.id) || "";
}

function flowButtonReplyId(raw: Record<string, unknown>) {
  const interactive = objectValue(raw.interactive);
  const buttonReply = objectValue(interactive.button_reply);
  return textValue(buttonReply.id);
}

function flowDelayMsFromStep(step: FlowStep) {
  const value = Math.max(0, Number(step.delayValue || 0) || 0);
  const unit = textValue(step.delayUnit).toLowerCase();
  if (unit === "days") return value * 24 * 60 * 60 * 1000;
  if (unit === "hours") return value * 60 * 60 * 1000;
  if (unit === "seconds") return value * 1000;
  return value * 60 * 1000;
}

async function wait(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30_000)));
}

async function recordFlowOutbound(args: {
  businessId: string;
  conversationId: string;
  body: string;
  messageType?: MessageType;
  metadata: Record<string, unknown>;
  delivery: unknown;
  deliveryError?: string;
}) {
  const sent = Boolean(objectValue(args.delivery).sent);
  await prisma.message.create({
    data: {
      businessId: args.businessId,
      conversationId: args.conversationId,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.SYSTEM,
      messageType: args.messageType || MessageType.TEXT,
      body: args.body,
      status: sent ? MessageStatus.SENT : MessageStatus.FAILED,
      externalMessageId: deliveryMessageId(args.delivery) || undefined,
      metadata: jsonValue(args.metadata),
      sentAt: sent ? new Date() : undefined,
      failedReason: args.deliveryError || undefined,
    },
  });
}

function flowMediaItems(step: FlowStep) {
  const items = Array.isArray(step.mediaItems) ? step.mediaItems : [];
  const normalised = items
    .map((item) => ({
      type: item.type === "video" ? "video" as const : item.type === "pdf" || item.type === "document" ? "pdf" as const : "image" as const,
      url: textValue(item.url).trim(),
      caption: textValue(item.caption).trim(),
      fileName: textValue(item.fileName).trim(),
    }))
    .filter((item) => item.url);
  if (normalised.length) return normalised;
  if (step.imageUrl) return [{ type: "image" as const, url: step.imageUrl, caption: step.message || "" }];
  if (step.videoUrl) return [{ type: "video" as const, url: step.videoUrl, caption: step.message || "" }];
  return [];
}

async function sendFlowStepFromWebhook(args: {
  item: StoredWhatsAppMessage;
  flowId: string;
  stepIndex: number;
  step: FlowStep;
}) {
  const type = textValue(args.step.type) || "Send Message";
  const body = textValue(args.step.message);
  if (type === "Ask Selection") {
    const buttons = arrayValue(args.step.options)
      .map((option, optionIndex) => {
        const record = objectValue(option);
        const label = textValue(record.label).trim();
        const optionId = textValue(record.id) || `option_${optionIndex + 1}`;
        return {
          id: `flow:${args.flowId}:${args.stepIndex}:${optionId}`,
          title: label,
        };
      })
      .filter((option) => option.title)
      .slice(0, 3);
    if (!body || !buttons.length) return "pause";
    const delivery = await sendWhatsAppButtonMessage({
      to: args.item.waId,
      body,
      buttons,
    });
    await recordFlowOutbound({
      businessId: args.item.businessId,
      conversationId: args.item.conversationId,
      body,
      metadata: { flowId: args.flowId, stepIndex: args.stepIndex, interactive: { type: "button", buttons }, delivery },
      delivery,
    });
    return "pause";
  }

  if (type === "Send Media" || type === "Send Image" || type === "Send Video") {
    for (const media of flowMediaItems(args.step)) {
      const caption = media.caption || body;
      const delivery = media.type === "video"
        ? await sendWhatsAppVideoMessage({ to: args.item.waId, videoUrl: media.url, caption: caption || undefined })
        : media.type === "pdf"
          ? await sendWhatsAppDocumentMessage({ to: args.item.waId, documentUrl: media.url, caption: caption || undefined, filename: media.fileName || "Flow PDF" })
          : await sendWhatsAppImageMessage({ to: args.item.waId, imageUrl: media.url, caption: caption || undefined });
      await recordFlowOutbound({
        businessId: args.item.businessId,
        conversationId: args.item.conversationId,
        body: caption || (media.type === "video" ? "Video" : media.type === "pdf" ? "PDF" : "Photo"),
        messageType: media.type === "video" ? MessageType.VIDEO : media.type === "pdf" ? MessageType.DOCUMENT : MessageType.IMAGE,
        metadata: { flowId: args.flowId, stepIndex: args.stepIndex, media, delivery },
        delivery,
      });
    }
    return "continue";
  }

  if (type === "Send Message" && body) {
    const delivery = await sendWhatsAppTextMessage({ to: args.item.waId, body });
    await recordFlowOutbound({
      businessId: args.item.businessId,
      conversationId: args.item.conversationId,
      body,
      metadata: { flowId: args.flowId, stepIndex: args.stepIndex, delivery },
      delivery,
    });
  }
  return "continue";
}

async function runWebhookFlow(args: {
  item: StoredWhatsAppMessage;
  flow: { id: string; messages: unknown };
  startIndex?: number;
  onlySteps?: FlowStep[];
}) {
  const steps = args.onlySteps || (Array.isArray(args.flow.messages) ? args.flow.messages.map((step) => objectValue(step) as FlowStep) : []);
  for (let index = args.startIndex || 0; index < steps.length; index += 1) {
    const step = steps[index];
    await wait(flowDelayMsFromStep(step));
    const result = await sendFlowStepFromWebhook({
      item: args.item,
      flowId: args.flow.id,
      stepIndex: index,
      step,
    });
    if (result === "pause") return;
  }
}

async function findFlowTriggeredBySelection(args: {
  businessId: string;
  sourceFlowId: string;
  optionId: string;
  optionLabel: string;
  targetFlowId: string;
  targetFlowName: string;
}) {
  if (args.targetFlowId) {
    const flow = await prisma.whatsAppFlow.findFirst({
      where: { id: args.targetFlowId, businessId: args.businessId, active: true },
    });
    if (flow) return flow;
  }

  const label = args.optionLabel.trim();
  const candidates = await prisma.whatsAppFlow.findMany({
    where: {
      businessId: args.businessId,
      active: true,
      triggerType: "selection_button",
    },
    orderBy: { updatedAt: "desc" },
  });
  const normalizedLabel = label.toLowerCase();
  const normalizedTargetName = args.targetFlowName.trim().toLowerCase();
  return candidates.find((flow) => (
    flow.id !== args.sourceFlowId
    && (
      (flow.triggerButtonLabel || "").trim().toLowerCase() === normalizedLabel
      || (normalizedTargetName && flow.name.trim().toLowerCase() === normalizedTargetName)
      || (flow.triggerButtonLabel || "").trim().toLowerCase() === args.optionId.trim().toLowerCase()
    )
  )) || null;
}

async function handleFlowAutomationForInboundMessages(storedMessages: StoredWhatsAppMessage[]) {
  const inboundMessages = storedMessages.filter((message) => (
    message.created
    && message.direction === "inbound"
    && message.source !== "history"
    && message.source !== "provider_history"
  ));
  if (!inboundMessages.length) return 0;

  let scheduled = 0;
  for (const item of inboundMessages) {
    const replyId = flowButtonReplyId(item.raw);
    if (replyId.startsWith("flow:")) {
      const [, flowId, stepIndexText, optionId] = replyId.split(":");
      const flow = await prisma.whatsAppFlow.findFirst({
        where: { id: flowId, businessId: item.businessId, active: true },
      });
      const stepIndex = Number(stepIndexText);
      const steps = Array.isArray(flow?.messages) ? flow.messages.map((step) => objectValue(step) as FlowStep) : [];
      const matchedOption = arrayValue(steps[stepIndex]?.options)
        .map(objectValue)
        .find((candidate) => (textValue(candidate.id) || "").trim() === optionId);
      const optionLabel = textValue(matchedOption?.label);
      const targetFlowId = textValue(matchedOption?.targetFlowId);
      const targetFlowName = textValue(matchedOption?.targetFlowName);
      const targetFlow = await findFlowTriggeredBySelection({
        businessId: item.businessId,
        sourceFlowId: flowId,
        optionId,
        optionLabel,
        targetFlowId,
        targetFlowName,
      });
      if (targetFlow) {
        await runWebhookFlow({ item, flow: targetFlow });
        scheduled += 1;
        continue;
      }
      const followUpMessage = textValue(matchedOption?.followUpMessage);
      if (flow && followUpMessage) {
        await runWebhookFlow({
          item,
          flow,
          onlySteps: [{ type: "Send Message", delayValue: "0", delayUnit: "seconds", message: followUpMessage }],
        });
        scheduled += 1;
      }
      continue;
    }

    const inboundCount = await prisma.message.count({
      where: {
        businessId: item.businessId,
        conversationId: item.conversationId,
        direction: MessageDirection.INBOUND,
      },
    });
    if (inboundCount !== 1) continue;

    const flows = await prisma.whatsAppFlow.findMany({
      where: {
        businessId: item.businessId,
        active: true,
        triggerType: "first_message",
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
    });
    for (const flow of flows) {
      await runWebhookFlow({ item, flow });
      scheduled += 1;
    }
  }

  return scheduled;
}

async function saveWhatsAppMediaAttachment(args: {
  messageId: string;
  media?: {
    id: string;
    mimeType: string;
    filename: string;
  };
  messageType: string;
}) {
  if (!args.media?.id) return;

  const storageKey = `whatsapp-media:${args.media.id}`;
  const existing = await prisma.messageAttachment.findFirst({
    where: { messageId: args.messageId, storageKey },
  });

  const contentType = args.media.mimeType || fallbackWhatsAppMediaContentType(args.messageType);
  const data = {
    storageKey,
    contentType,
    originalName: args.media.filename || `${args.messageType}-${args.media.id}`,
    externalMediaId: args.media.id,
    mediaMimeType: contentType,
    processingStatus: existing?.originalStoragePath ? "ready" : "pending",
  };

  if (existing) {
    await prisma.messageAttachment.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.messageAttachment.create({
    data: {
      messageId: args.messageId,
      ...data,
    },
  });
}

function assistantHistoryDirection(message: {
  direction: MessageDirection;
  senderType: MessageSenderType;
}): WhatsAppAssistantMessage["direction"] {
  if (message.direction === MessageDirection.INBOUND) return "customer";
  if (message.senderType === MessageSenderType.AI) return "assistant";
  if (message.senderType === MessageSenderType.SYSTEM) return "system";
  return "team";
}

async function handleAiForInboundMessage(item: StoredWhatsAppMessage) {
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

async function storeWhatsAppMessages(rawPayload: unknown) {
  const business = await ensureDefaultBusiness();
  const normalizedMessages = normalizeWhatsAppWebhookPayload(rawPayload);
  const storedMessages: StoredWhatsAppMessage[] = [];

  for (const message of normalizedMessages) {
    if (!message.messageId || !message.waId) continue;
    const isInbound = message.direction === "inbound";
    const isHistorySync = message.source === "history" || message.source === "provider_history";
    const metadataSource = isHistorySync ? "meta_whatsapp_history_sync" : "meta_whatsapp_webhook";
    const direction = isInbound ? MessageDirection.INBOUND : MessageDirection.OUTBOUND;
    const senderType = isInbound ? MessageSenderType.CUSTOMER : MessageSenderType.TEAM;
    const status = isInbound ? MessageStatus.DELIVERED : MessageStatus.SENT;
    const displayName = message.displayName.trim();

    await prisma.webhookEvent.upsert({
      where: {
        businessId_source_externalEventId: {
          businessId: business.id,
          source: "meta_whatsapp",
          externalEventId: `${message.direction}:${message.messageId}`,
        },
      },
      update: {
        payload: jsonValue({ direction: message.direction, source: message.source, raw: message.raw }),
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
      create: {
        businessId: business.id,
        source: "meta_whatsapp",
        externalEventId: `${message.direction}:${message.messageId}`,
        payload: jsonValue({ direction: message.direction, source: message.source, raw: message.raw }),
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
        displayName: displayName || undefined,
      },
      create: {
        businessId: business.id,
        waId: message.waId,
        phone: message.waId,
        displayName: displayName || undefined,
        source: "whatsapp",
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        contactId: contact.id,
        status: { notIn: ["RESOLVED", "ARCHIVED"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId: business.id,
          contactId: contact.id,
          status: isHistorySync
            ? ConversationStatus.OPEN
            : isInbound
              ? ConversationStatus.WAITING_TEAM
              : ConversationStatus.WAITING_CUSTOMER,
          lastMessageAt: message.timestamp,
          unreadCount: 0,
        },
      });
    }

    const existingMessage = await prisma.message.findUnique({
      where: {
        businessId_externalMessageId: {
          businessId: business.id,
          externalMessageId: message.messageId,
        },
      },
    });

    const storedMessage = await prisma.message.upsert({
      where: {
        businessId_externalMessageId: {
          businessId: business.id,
          externalMessageId: message.messageId,
        },
      },
      update: {
        body: message.text,
        direction,
        senderType,
        messageType: messageType(message.messageType),
        status,
        metadata: jsonValue({
          direction: message.direction,
          phoneNumberId: message.phoneNumberId,
          source: metadataSource,
          webhookSource: message.source,
          media: message.media || null,
          raw: message.raw,
        }),
        sentAt: isInbound ? undefined : message.timestamp,
        deliveredAt: isInbound ? message.timestamp : undefined,
      },
      create: {
        businessId: business.id,
        conversationId: conversation.id,
        externalMessageId: message.messageId,
        direction,
        senderType,
        messageType: messageType(message.messageType),
        body: message.text,
        status,
        metadata: jsonValue({
          direction: message.direction,
          phoneNumberId: message.phoneNumberId,
          source: metadataSource,
          webhookSource: message.source,
          media: message.media || null,
          raw: message.raw,
        }),
        createdAt: message.timestamp,
        sentAt: isInbound ? undefined : message.timestamp,
        deliveredAt: isInbound ? message.timestamp : undefined,
      },
    });

    await saveWhatsAppMediaAttachment({
      messageId: storedMessage.id,
      media: message.media,
      messageType: message.messageType,
    });

    const previousLastMessageAt = conversation.lastMessageAt || conversation.updatedAt || new Date(0);
    const shouldMoveLastMessageAt = message.timestamp.getTime() >= previousLastMessageAt.getTime();
    const shouldChangeLiveState = !existingMessage && !isHistorySync;
    const conversationUpdate = {
      ...(shouldMoveLastMessageAt ? { lastMessageAt: message.timestamp } : {}),
      ...(shouldChangeLiveState && isInbound
        ? { status: ConversationStatus.WAITING_TEAM, unreadCount: { increment: 1 } }
        : {}),
      ...(shouldChangeLiveState && !isInbound
        ? { status: ConversationStatus.WAITING_CUSTOMER, unreadCount: 0 }
        : {}),
    };

    if (Object.keys(conversationUpdate).length) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: conversationUpdate,
      });
    }

    storedMessages.push({
      messageId: storedMessage.id,
      businessId: business.id,
      conversationId: conversation.id,
      contactId: contact.id,
      customerName: displayName,
      waId: message.waId,
      direction: message.direction,
      text: message.text,
      messageType: messageType(message.messageType),
      created: !existingMessage,
      source: message.source,
      raw: message.raw,
    });
  }

  return storedMessages;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (verifyWebhookChallenge({
    mode,
    token,
    expectedToken: process.env.WHATSAPP_VERIFY_TOKEN,
    challenge,
  })) {
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("WhatsApp webhook verification failed", {
    hasMode: Boolean(mode),
    mode,
    hasChallenge: Boolean(challenge),
    providedTokenLength: token?.length ?? 0,
    expectedTokenLength: process.env.WHATSAPP_VERIFY_TOKEN?.length ?? 0,
    providedTokenHash: hashPreview(token),
    expectedTokenHash: hashPreview(process.env.WHATSAPP_VERIFY_TOKEN),
  });

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
    const isHistoryOnlyPayload = payloadHasWhatsAppHistory(payload) && !payloadHasLiveWhatsAppMessages(payload);

    if (isHistoryOnlyPayload) {
      await recordRawWhatsAppWebhook({
        rawBody,
        payload,
        status: WebhookEventStatus.RECEIVED,
      });

      after(async () => {
        try {
          const storedMessages = await storeWhatsAppMessages(payload);
          const statusResult = await applyWhatsAppStatuses(payload);
          const messageIds = Array.from(new Set(storedMessages.map((message) => message.messageId).filter(Boolean)));
          if (messageIds.length) {
            await enqueueWhatsAppMediaJobsForMessages(messageIds);
            await processDueWhatsAppMediaJobs({ limit: mediaJobBatchLimit() });
          }
          await recordRawWhatsAppWebhook({
            rawBody,
            payload,
            status: WebhookEventStatus.PROCESSED,
            parsedMessageCount: storedMessages.length,
            parsedStatusCount: statusResult.received,
            updatedStatusCount: statusResult.updated,
          });
        } catch (error) {
          console.error("WhatsApp history sync background task failed", error);
          await recordRawWhatsAppWebhook({
            rawBody,
            payload,
            status: WebhookEventStatus.FAILED,
            error: error instanceof Error ? error.message : "WhatsApp history sync could not be processed.",
          });
        }
      });

      return json(200, {
        ok: true,
        stored: "scheduled",
        sync: "history_scheduled",
        ai: "none",
      });
    }

    const storedMessages = await storeWhatsAppMessages(payload);
    const statusResult = await applyWhatsAppStatuses(payload);
    await recordRawWhatsAppWebhook({
      rawBody,
      payload,
      status: WebhookEventStatus.PROCESSED,
      parsedMessageCount: storedMessages.length,
      parsedStatusCount: statusResult.received,
      updatedStatusCount: statusResult.updated,
    });
    const aiMessageCount = scheduleAiForStoredMessages(storedMessages);
    const mediaMessageCount = scheduleMediaForStoredMessages(storedMessages);
    const flowMessageCount = await handleFlowAutomationForInboundMessages(storedMessages);

    return json(200, {
      ok: true,
      stored: storedMessages.length,
      statuses: statusResult.updated,
      ai: aiMessageCount ? "scheduled" : "none",
      media: mediaMessageCount ? "scheduled" : "none",
      flows: flowMessageCount ? "sent" : "none",
    });
  } catch (error) {
    try {
      await recordRawWhatsAppWebhook({
        rawBody,
        payload: JSON.parse(rawBody) as unknown,
        status: WebhookEventStatus.FAILED,
        error: error instanceof Error ? error.message : "WhatsApp webhook could not be processed.",
      });
    } catch {
      // If the payload itself is not valid JSON, keep the Meta response clean.
    }
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp webhook could not be processed.",
    });
  }
}
