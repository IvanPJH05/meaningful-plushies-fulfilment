"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

import styles from "./whatsapp-inbox.module.css";

type ConversationSummary = {
  id: string;
  status: string;
  aiMode: string;
  unreadCount: number;
  lastMessageAt: string | null;
  contact: {
    id: string;
    waId: string | null;
    phone: string | null;
    displayName: string;
  };
  lastMessage: {
    id: string;
    preview: string;
    direction: string;
    senderType: string;
    status: string;
    createdAt: string | null;
  } | null;
};

type ConversationRowsAnchor = {
  conversationId: string;
  offsetTop: number;
  fallbackScrollTop: number;
};

type InboxMessage = {
  id: string;
  clientKey?: string;
  direction: string;
  senderType: string;
  messageType: string;
  body: string;
  status: string;
  failedReason: string | null;
  createdAt: string | null;
  sentAt: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachments?: {
    id: string;
    originalName: string | null;
    contentType: string;
    sizeBytes: number | null;
    previewCacheKey?: string | null;
    processingStatus?: string | null;
    thumbnailUrl?: string | null;
    originalUrl?: string | null;
    previewWidth?: number | null;
    previewHeight?: number | null;
    originalWidth?: number | null;
    originalHeight?: number | null;
    processingError?: string | null;
    processedAt?: string | null;
    url?: string;
    downloadUrl?: string;
    mediaAsset?: {
      id: string;
      contentHash: string;
      mimeType: string;
      mediaType: string;
      thumbnailUrl?: string | null;
      originalUrl?: string | null;
      downloadUrl?: string | null;
      width?: number | null;
      height?: number | null;
      thumbnailWidth?: number | null;
      thumbnailHeight?: number | null;
      durationSeconds?: number | null;
      sizeBytes?: number | null;
    } | null;
  }[];
  reactions?: {
    id: string;
    emoji: string;
    direction: string;
    senderType: string;
    createdAt: string | null;
  }[];
  replyTo?: {
    id?: string;
    externalMessageId?: string | null;
    senderLabel: string;
    preview: string;
    createdAt: string | null;
  } | null;
};

type ConversationLead = {
  id: string;
  stage: string;
  temperature: string;
  customerName: string | null;
  phone: string | null;
  requestedCharacter: string | null;
  requestedVoice: string | null;
  estimatedValue: number | null;
  paymentStatus: string;
  paidAmount: number | null;
  manualOrderId: string | null;
  manualOrderLinkSentAt: string | null;
  updatedAt: string | null;
};

type ConversationCommand = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  executedAt: string | null;
  createdAt: string | null;
};

type SelectedConversation = {
  id: string;
  status: string;
  aiMode: string;
  unreadCount: number;
  lastMessageAt: string | null;
  detailsLoaded?: boolean;
  contact: ConversationSummary["contact"] & {
    email?: string | null;
    source?: string | null;
    tags?: string[];
  };
  leads?: ConversationLead[];
  commands?: ConversationCommand[];
} | null;

type InboxPayload = {
  conversations: ConversationSummary[];
  selectedConversation: SelectedConversation;
  messages: InboxMessage[];
};

type ActiveConversation = NonNullable<SelectedConversation>;
type MessageAttachment = NonNullable<InboxMessage["attachments"]>[number];
type MediaCarouselState = {
  attachments: MessageAttachment[];
  index: number;
  subtitle?: string;
  title?: string;
} | null;

type PreloadMediaAsset = {
  contentHash: string;
  mediaType: string;
  thumbnailUrl: string | null;
  originalUrl: string;
};

type FlowTriggerType = "keywords" | "click";
type FlowMediaType = "image" | "video";
type FlowActionType = "Send Message" | "Send Media" | "Send Image" | "Send Video" | "AI Reply" | "Update Status" | "Add Note";
type FlowDelayUnit = "seconds" | "minutes" | "hours" | "days";

type FlowMediaItem = {
  type: FlowMediaType;
  url: string;
  caption?: string;
};

type WhatsAppFlowStep = {
  type: FlowActionType;
  delayValue: string;
  delayUnit: FlowDelayUnit;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: FlowMediaItem[];
};

type WhatsAppFlow = {
  id: string;
  name: string;
  triggerType?: FlowTriggerType;
  triggerButtonLabel?: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  steps: WhatsAppFlowStep[];
  updatedAt: string;
};

type ConversationCache = Record<string, {
  selectedConversation: ActiveConversation;
  messages: InboxMessage[];
  loadedAt: number;
}>;

type CrmRealtimePayload = {
  table?: string;
  operation?: string;
  id?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

const REALTIME_REFRESH_DEBOUNCE_MS = 160;
const CRM_REALTIME_TOPIC = "crm-whatsapp-inbox";
const CHAT_LIST_LIMIT = 1000;
const MESSAGE_FETCH_LIMIT = 90;
const MEDIA_OBJECT_CACHE_LIMIT = 260;
const MEDIA_NEAR_VIEWPORT_MARGIN = "520px";
const MESSAGE_STICKY_BOTTOM_DISTANCE = 180;
const MEDIA_ALBUM_GROUP_WINDOW_MS = 15 * 1000;
const INBOX_TAB_CACHE_KEY = "meaningful-plushies.whatsapp-inbox.v3";
const INBOX_LEGACY_TAB_CACHE_KEY = "meaningful-plushies.whatsapp-inbox.v2";
const INBOX_CACHE_DB_NAME = "meaningful-plushies-whatsapp-cache";
const INBOX_CACHE_DB_VERSION = 1;
const INBOX_CACHE_STORE_NAME = "snapshots";
const INBOX_CACHE_RECORD_KEY = "warm-inbox";
const INBOX_QUICK_CACHE_CONVERSATION_LIMIT = 20;
const mediaObjectUrlByKey = new Map<string, string>();
const mediaWarmPromiseByKey = new Map<string, Promise<void>>();
const videoMetadataWarmedByKey = new Set<string>();
let inboxMemorySnapshot: InboxTabCache | null = null;

type InboxTabCache = {
  version: 3;
  savedAt: number;
  inbox: InboxPayload;
  conversationCache: ConversationCache;
  selectedId: string;
  search: string;
  filter: string;
};

function isInboxPayload(value: unknown): value is InboxPayload {
  const payload = value as InboxPayload | null;
  return Boolean(
    payload
    && Array.isArray(payload.conversations)
    && Array.isArray(payload.messages)
    && "selectedConversation" in payload,
  );
}

function normalizeInboxTabCache(value: unknown): InboxTabCache | null {
  const parsed = value as Partial<InboxTabCache> | null;
  if (
    !parsed
    || parsed.version !== 3
    || typeof parsed.savedAt !== "number"
    || !isInboxPayload(parsed.inbox)
  ) {
    return null;
  }

  return {
    version: 3,
    savedAt: parsed.savedAt,
    inbox: parsed.inbox,
    conversationCache: parsed.conversationCache && typeof parsed.conversationCache === "object"
      ? parsed.conversationCache
      : {},
    selectedId: parsed.selectedId || parsed.inbox.selectedConversation?.id || "",
    search: parsed.search || "",
    filter: parsed.filter || "ALL",
  };
}

function compactInboxTabCache(snapshot: InboxTabCache): InboxTabCache {
  const keepIds = new Set<string>();
  if (snapshot.selectedId) keepIds.add(snapshot.selectedId);
  snapshot.inbox.conversations.slice(0, INBOX_QUICK_CACHE_CONVERSATION_LIMIT).forEach((conversation) => {
    keepIds.add(conversation.id);
  });

  const conversationCache = Object.fromEntries(
    Object.entries(snapshot.conversationCache).filter(([conversationId]) => keepIds.has(conversationId)),
  ) as ConversationCache;

  return {
    ...snapshot,
    conversationCache,
  };
}

function openInboxCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(INBOX_CACHE_DB_NAME, INBOX_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INBOX_CACHE_STORE_NAME)) {
        database.createObjectStore(INBOX_CACHE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readPersistentInboxCache() {
  const database = await openInboxCacheDatabase();
  if (!database) return null;

  return new Promise<InboxTabCache | null>((resolve) => {
    const transaction = database.transaction(INBOX_CACHE_STORE_NAME, "readonly");
    const request = transaction.objectStore(INBOX_CACHE_STORE_NAME).get(INBOX_CACHE_RECORD_KEY);
    request.onsuccess = () => resolve(normalizeInboxTabCache(request.result));
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
    transaction.onabort = () => database.close();
  });
}

async function writePersistentInboxCache(snapshot: InboxTabCache) {
  const database = await openInboxCacheDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(INBOX_CACHE_STORE_NAME, "readwrite");
    transaction.objectStore(INBOX_CACHE_STORE_NAME).put(snapshot, INBOX_CACHE_RECORD_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      resolve();
    };
  });
}

function readInboxTabCache() {
  if (typeof window === "undefined") return inboxMemorySnapshot;
  const raw = window.localStorage.getItem(INBOX_TAB_CACHE_KEY);
  if (!raw) return inboxMemorySnapshot;
  try {
    const snapshot = normalizeInboxTabCache(JSON.parse(raw));
    if (!snapshot) {
      window.localStorage.removeItem(INBOX_TAB_CACHE_KEY);
      return inboxMemorySnapshot;
    }
    inboxMemorySnapshot = snapshot;
    return snapshot;
  } catch {
    window.localStorage.removeItem(INBOX_TAB_CACHE_KEY);
    return inboxMemorySnapshot;
  }
}

function writeInboxTabCache(snapshot: InboxTabCache) {
  inboxMemorySnapshot = snapshot;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(INBOX_LEGACY_TAB_CACHE_KEY);
    window.localStorage.setItem(INBOX_TAB_CACHE_KEY, JSON.stringify(compactInboxTabCache(snapshot)));
  } catch {
    // Keep the full warm cache in memory and IndexedDB even if this browser refuses localStorage.
  }
  void writePersistentInboxCache(snapshot);
}

function hasEveryConversationWarmed(snapshot: InboxTabCache | null | undefined) {
  if (!snapshot?.inbox.conversations.length) return false;
  return snapshot.inbox.conversations.every((conversation) => Boolean(snapshot.conversationCache[conversation.id]));
}

function optimisticOutboundMessage(
  id: string,
  body: string,
  messageType = "TEXT",
  attachments: InboxMessage["attachments"] = [],
  replyTo: InboxMessage["replyTo"] = null,
): InboxMessage {
  return {
    id,
    clientKey: id,
    direction: "OUTBOUND",
    senderType: "TEAM",
    messageType,
    body,
    status: "SENDING",
    failedReason: null,
    createdAt: new Date().toISOString(),
    sentAt: null,
    attachments,
    replyTo,
  };
}

function messageTimeValue(message: InboxMessage) {
  const value = message.createdAt || message.sentAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isLocalPendingMessage(message: InboxMessage) {
  return message.id.startsWith("local-") && ["SENDING", "FAILED"].includes(message.status);
}

function messagesAreCloseEnough(left: InboxMessage, right: InboxMessage) {
  const leftTime = messageTimeValue(left);
  const rightTime = messageTimeValue(right);
  return !leftTime || !rightTime || Math.abs(leftTime - rightTime) < 120000;
}

function hasSameVisibleMessage(left: InboxMessage, right: InboxMessage) {
  return left.direction === right.direction
    && left.senderType === right.senderType
    && (left.body || "").trim() === (right.body || "").trim()
    && messagesAreCloseEnough(left, right);
}

function findMatchingCurrentMessage(serverMessage: InboxMessage, currentMessages: InboxMessage[], usedIndexes: Set<number>) {
  let fallbackIndex = -1;
  for (let index = 0; index < currentMessages.length; index += 1) {
    const currentMessage = currentMessages[index];
    if (usedIndexes.has(index)) continue;
    if (currentMessage.id === serverMessage.id) return index;
    if (fallbackIndex === -1 && currentMessage.clientKey && hasSameVisibleMessage(currentMessage, serverMessage)) {
      fallbackIndex = index;
    }
  }
  return fallbackIndex;
}

function hasMatchingSavedMessage(localMessage: InboxMessage, serverMessages: InboxMessage[]) {
  for (const serverMessage of serverMessages) {
    if (serverMessage.id.startsWith("local-")) continue;
    if (hasSameVisibleMessage(localMessage, serverMessage)) return true;
  }
  return false;
}

function mergeLocalPendingMessages(serverMessages: InboxMessage[], currentMessages: InboxMessage[] = []) {
  if (!currentMessages.length) return serverMessages;

  const usedCurrentIndexes = new Set<number>();
  const merged = serverMessages.map((serverMessage) => {
    const matchIndex = findMatchingCurrentMessage(serverMessage, currentMessages, usedCurrentIndexes);
    if (matchIndex === -1) return serverMessage;

    usedCurrentIndexes.add(matchIndex);
    const currentMessage = currentMessages[matchIndex];
    return {
      ...serverMessage,
      clientKey: currentMessage.clientKey,
      createdAt: currentMessage.clientKey ? currentMessage.createdAt || serverMessage.createdAt : serverMessage.createdAt,
      replyTo: serverMessage.replyTo ?? currentMessage.replyTo ?? null,
    };
  });

  const pendingMessages = currentMessages.filter(isLocalPendingMessage);
  for (const localMessage of pendingMessages) {
    if (hasMatchingSavedMessage(localMessage, merged)) continue;
    merged.push(localMessage);
  }

  return merged.sort((left, right) => messageTimeValue(left) - messageTimeValue(right));
}

function normalizeReturnedMessage(message: InboxMessage, stableFrom?: InboxMessage): InboxMessage {
  return {
    ...message,
    clientKey: stableFrom?.clientKey,
    createdAt: stableFrom?.clientKey ? stableFrom.createdAt || message.createdAt : message.createdAt,
    attachments: message.attachments ?? [],
    replyTo: message.replyTo ?? stableFrom?.replyTo ?? null,
  };
}

function messageRenderKey(message: InboxMessage) {
  return message.clientKey || message.id;
}

const statusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "WAITING_TEAM", label: "Waiting team" },
  { value: "WAITING_CUSTOMER", label: "Waiting customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ARCHIVED", label: "Archived" },
];

const aiModeOptions = [
  { value: "OFF", label: "AI off" },
  { value: "SUGGEST_ONLY", label: "Suggest only" },
  { value: "AUTO_REPLY", label: "Auto reply" },
];

const filterOptions = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "WAITING_TEAM", label: "Needs reply" },
  { value: "WAITING_CUSTOMER", label: "Waiting customer" },
  { value: "RESOLVED", label: "Resolved" },
];

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDay(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (!parts.length) return "W";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function messageLabel(message: InboxMessage) {
  if (message.senderType === "AI" && message.status === "QUEUED") return "AI suggestion";
  if (message.senderType === "AI") return "AI";
  if (message.senderType === "TEAM") return "Team";
  if (message.senderType === "SYSTEM") return "System";
  return "Customer";
}

function fallbackMessageText(message: InboxMessage) {
  if (message.attachments?.length) return "";
  if (message.messageType === "SYSTEM") return "WhatsApp event";
  if (message.messageType === "IMAGE") return "Photo";
  if (message.messageType === "VIDEO") return "Video";
  if (message.messageType === "AUDIO") return "Voice message";
  if (message.messageType === "DOCUMENT") return "Document";
  if (message.messageType === "TEMPLATE") return "Template message";
  return "WhatsApp message";
}

function messageDisplayText(message: InboxMessage) {
  const body = message.body.trim();
  if (body) return message.body;
  return fallbackMessageText(message);
}

function normalizedMessageText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isNonContentWhatsAppPlaceholder(value: string | null | undefined) {
  const normalized = normalizedMessageText(value);
  return normalized === "unsupported whatsapp message"
    || normalized === "unsupported message"
    || normalized === "whatsapp event";
}

function isAutoMediaCaption(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return true;
  return isNonContentWhatsAppPlaceholder(normalized)
    || /^(sent\s+an?\s+)?(photo|image|picture|video)$/i.test(normalized)
    || /^(sent\s+an?\s+)?(photo|image|picture|video)\s+(image|video)\//i.test(normalized)
    || /^(image|video)\/[a-z0-9.+-]+$/i.test(normalized);
}

function visualMediaAttachments(attachments: MessageAttachment[] | null | undefined) {
  return (attachments || []).filter((attachment) => (
    isImageAttachment(attachment) || isVideoAttachment(attachment)
  ));
}

function hasVisualAttachment(message: InboxMessage) {
  return visualMediaAttachments(message.attachments).length > 0;
}

function messageVisibleText(message: InboxMessage) {
  const displayText = messageDisplayText(message);
  if (hasVisualAttachment(message) && isAutoMediaCaption(displayText)) return "";
  return displayText;
}

function isEmptyOrAutoMediaText(value: string | null | undefined) {
  const text = value || "";
  return !text.trim() || isAutoMediaCaption(text);
}

function shouldHideChatMessage(message: InboxMessage) {
  if (message.attachments?.length) return false;
  if (isNonContentWhatsAppPlaceholder(message.body)) return true;
  if (isNonContentWhatsAppPlaceholder(messageVisibleText(message))) return true;
  const visibleText = normalizedMessageText(messageVisibleText(message));
  return message.senderType === "SYSTEM"
    && (!visibleText || visibleText === "system message" || visibleText.startsWith("system message:"));
}

const QUICK_REACTION_EMOJIS = ["\u2764\ufe0f", "\ud83d\udc4d", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude4f", "\u2705"];

function messageReplyPreview(message: InboxMessage): NonNullable<InboxMessage["replyTo"]> {
  return {
    id: message.id,
    senderLabel: messageLabel(message),
    preview: messageVisibleText(message).trim() || fallbackMessageText(message),
    createdAt: message.createdAt,
  };
}

function isMediaOnlyMessage(message: InboxMessage) {
  return hasVisualAttachment(message) && isEmptyOrAutoMediaText(messageDisplayText(message));
}

function isGroupedMediaMessage(message: InboxMessage, previousMessage?: InboxMessage) {
  if (!previousMessage || !isMediaOnlyMessage(message) || !isMediaOnlyMessage(previousMessage)) return false;
  if (message.direction !== previousMessage.direction || message.senderType !== previousMessage.senderType) return false;
  return mediaMessagesAreCloseEnough(message, previousMessage);
}

function isGroupableVisualMediaMessage(message: InboxMessage) {
  const attachments = message.attachments || [];
  const visualAttachments = visualMediaAttachments(attachments);
  return Boolean(
    visualAttachments.length
    && visualAttachments.length === attachments.length
    && isEmptyOrAutoMediaText(messageDisplayText(message))
  );
}

function mediaMessagesAreCloseEnough(left: InboxMessage, right: InboxMessage) {
  const leftTime = messageTimeValue(left);
  const rightTime = messageTimeValue(right);
  return !leftTime || !rightTime || Math.abs(leftTime - rightTime) <= MEDIA_ALBUM_GROUP_WINDOW_MS;
}

function canGroupAdjacentMediaMessages(previousMessage: InboxMessage, message: InboxMessage) {
  if (!isGroupableVisualMediaMessage(previousMessage) || !isGroupableVisualMediaMessage(message)) return false;
  if (message.direction !== previousMessage.direction || message.senderType !== previousMessage.senderType) return false;
  if (message.replyTo || previousMessage.replyTo) return false;
  return mediaMessagesAreCloseEnough(message, previousMessage);
}

function previousRenderableMessage(messages: InboxMessage[], index: number) {
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    const candidate = messages[currentIndex];
    if (!candidate || shouldHideChatMessage(candidate)) continue;
    return candidate;
  }
  return undefined;
}

function isMediaGroupContinuation(messages: InboxMessage[], index: number) {
  const message = messages[index];
  const previousMessage = previousRenderableMessage(messages, index);
  return Boolean(message && previousMessage && canGroupAdjacentMediaMessages(previousMessage, message));
}

function collectMediaMessageGroup(messages: InboxMessage[], startIndex: number) {
  const firstMessage = messages[startIndex];
  if (!firstMessage || shouldHideChatMessage(firstMessage) || isMediaGroupContinuation(messages, startIndex) || !isGroupableVisualMediaMessage(firstMessage)) {
    return [];
  }

  const group = [firstMessage];
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const nextMessage = messages[index];
    if (nextMessage && shouldHideChatMessage(nextMessage)) continue;
    const previousMessage = group[group.length - 1];
    if (!nextMessage || !canGroupAdjacentMediaMessages(previousMessage, nextMessage)) break;
    group.push(nextMessage);
  }

  return group.length > 1 ? group : [];
}

function mediaGroupAttachments(messages: InboxMessage[]) {
  return messages.flatMap((message) => visualMediaAttachments(message.attachments));
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function selectedFromSummary(conversation: ConversationSummary): NonNullable<SelectedConversation> {
  return {
    id: conversation.id,
    status: conversation.status,
    aiMode: conversation.aiMode,
    unreadCount: conversation.unreadCount,
    lastMessageAt: conversation.lastMessageAt,
    contact: {
      ...conversation.contact,
      source: "whatsapp",
      tags: [],
    },
    detailsLoaded: false,
    leads: [],
    commands: [],
  };
}

function flowDelayMs(step: WhatsAppFlowStep) {
  const amount = Math.max(0, Number(step.delayValue) || 0);
  const multipliers: Record<FlowDelayUnit, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[step.delayUnit];
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function personalizeFlowText(text: string, conversation: ActiveConversation | null) {
  const name = conversation?.contact.displayName || "";
  const phone = conversation?.contact.phone || conversation?.contact.waId || "";
  return text
    .replaceAll("{{name}}", name)
    .replaceAll("{{phone}}", phone)
    .trim();
}

function optimisticMediaAttachment(id: string, media: FlowMediaItem): MessageAttachment {
  const contentType = media.type === "video" ? "video/mp4" : "image/jpeg";
  const originalName = media.type === "video" ? "Flow video" : "Flow image";
  return {
    id: `local-${media.type}-${id}`,
    originalName,
    contentType,
    sizeBytes: null,
    previewCacheKey: `flow-${media.type}:${media.url}`,
    processingStatus: "ready",
    thumbnailUrl: media.url,
    originalUrl: media.url,
    url: media.url,
    downloadUrl: media.url,
  };
}

function attachmentContentType(attachment: MessageAttachment) {
  return (attachment.mediaAsset?.mimeType || attachment.contentType || "").toLowerCase();
}

function attachmentSourceUrl(attachment: MessageAttachment) {
  const cacheKey = attachmentCacheKey(attachment);
  const cachedUrl = cacheKey ? mediaObjectUrlByKey.get(cacheKey) || "" : "";
  return cachedUrl
    || attachment.mediaAsset?.thumbnailUrl
    || attachment.thumbnailUrl
    || attachment.url
    || attachment.mediaAsset?.originalUrl
    || attachment.originalUrl
    || "";
}

function attachmentOpenUrl(attachment: MessageAttachment) {
  return attachment.mediaAsset?.originalUrl
    || attachment.originalUrl
    || attachment.mediaAsset?.downloadUrl
    || attachment.downloadUrl
    || attachment.url
    || attachment.thumbnailUrl
    || "#";
}

function attachmentDisplayStatus(attachment: MessageAttachment) {
  return attachment.processingStatus || "ready";
}

function isAttachmentReady(attachment: MessageAttachment) {
  return attachmentDisplayStatus(attachment) === "ready";
}

function isImageAttachment(attachment: MessageAttachment) {
  return attachmentContentType(attachment).startsWith("image/");
}

function isVideoAttachment(attachment: MessageAttachment) {
  return attachmentContentType(attachment).startsWith("video/");
}

function isAudioAttachment(attachment: MessageAttachment) {
  return attachmentContentType(attachment).startsWith("audio/");
}

function attachmentCacheKey(attachment: MessageAttachment) {
  return attachment.mediaAsset?.contentHash
    || attachment.previewCacheKey
    || attachment.thumbnailUrl
    || attachment.originalUrl
    || (attachment.sizeBytes
      ? `${attachment.contentType}:${attachment.sizeBytes}:${attachment.originalName || ""}`
      : "")
    || attachment.url
    || attachment.id
    || "";
}

function cacheMediaObjectUrl(key: string, objectUrl: string) {
  if (!key) return;
  const previousUrl = mediaObjectUrlByKey.get(key);
  if (previousUrl) {
    if (previousUrl !== objectUrl) URL.revokeObjectURL(previousUrl);
    mediaObjectUrlByKey.delete(key);
  }
  mediaObjectUrlByKey.set(key, objectUrl);
  while (mediaObjectUrlByKey.size > MEDIA_OBJECT_CACHE_LIMIT) {
    const oldestKey = mediaObjectUrlByKey.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldestUrl = mediaObjectUrlByKey.get(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    mediaObjectUrlByKey.delete(oldestKey);
  }
}

function rememberVideoMetadataWarm(key: string) {
  if (!key) return;
  videoMetadataWarmedByKey.delete(key);
  videoMetadataWarmedByKey.add(key);
  while (videoMetadataWarmedByKey.size > MEDIA_OBJECT_CACHE_LIMIT) {
    const oldestKey = videoMetadataWarmedByKey.values().next().value as string | undefined;
    if (!oldestKey) break;
    videoMetadataWarmedByKey.delete(oldestKey);
  }
}

function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || nearViewport) return undefined;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: MEDIA_NEAR_VIEWPORT_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);

  return [ref, nearViewport] as const;
}

async function warmMediaAttachment(attachment: MessageAttachment) {
  const previewUrl = attachmentSourceUrl(attachment);
  if (!isAttachmentReady(attachment) || !previewUrl || (!isImageAttachment(attachment) && !isVideoAttachment(attachment))) return;
  const cacheKey = attachmentCacheKey(attachment);
  if (
    !cacheKey
    || mediaObjectUrlByKey.has(cacheKey)
    || videoMetadataWarmedByKey.has(cacheKey)
    || mediaWarmPromiseByKey.has(cacheKey)
  ) return;

  const promise = (async () => {
    try {
      if (isVideoAttachment(attachment)) {
        await new Promise<void>((resolve) => {
          const video = document.createElement("video");
          const cleanup = () => {
            video.removeAttribute("src");
            video.load();
          };
          const finish = () => {
            window.clearTimeout(timer);
            cleanup();
            resolve();
          };
          const timer = window.setTimeout(finish, 3500);
          video.muted = true;
          video.preload = "metadata";
          video.addEventListener("loadedmetadata", finish, { once: true });
          video.addEventListener("error", finish, { once: true });
          video.src = previewUrl;
          video.load();
        });
        rememberVideoMetadataWarm(cacheKey);
        return;
      }
      const response = await fetch(previewUrl, { cache: "force-cache" });
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      cacheMediaObjectUrl(cacheKey, objectUrl);
    } catch {
      // Media warm-up should never block opening the chat.
    } finally {
      mediaWarmPromiseByKey.delete(cacheKey);
    }
  })();

  mediaWarmPromiseByKey.set(cacheKey, promise);
  await promise;
}

async function warmConversationMedia(messages: InboxMessage[]) {
  const attachments = messages
    .flatMap((message) => message.attachments || [])
    .filter((attachment) => isAttachmentReady(attachment) && attachmentSourceUrl(attachment) && (isImageAttachment(attachment) || isVideoAttachment(attachment)));

  for (let index = 0; index < attachments.length; index += 4) {
    await Promise.all(attachments.slice(index, index + 4).map(warmMediaAttachment));
  }
}

async function warmSharedMediaAssets() {
  try {
    const response = await fetch("/api/crm/media-assets/preload", { cache: "force-cache" });
    if (!response.ok) return;
    const result = (await response.json()) as { assets?: PreloadMediaAsset[] };
    const assets = (result.assets || [])
      .filter((asset) => asset.thumbnailUrl && asset.contentHash && !mediaObjectUrlByKey.has(asset.contentHash))
      .slice(0, 50);

    for (let index = 0; index < assets.length; index += 5) {
      await Promise.all(assets.slice(index, index + 5).map(async (asset) => {
        if (!asset.thumbnailUrl || mediaObjectUrlByKey.has(asset.contentHash)) return;
        try {
          const mediaResponse = await fetch(asset.thumbnailUrl, { cache: "force-cache" });
          if (!mediaResponse.ok) return;
          const blob = await mediaResponse.blob();
          cacheMediaObjectUrl(asset.contentHash, URL.createObjectURL(blob));
        } catch {
          // Shared media warm-up is only a speed boost; the chat can still render normally.
        }
      }));
    }
  } catch {
    // Ignore preload errors so the inbox never waits on shared media.
  }
}

function LazyImageAttachment(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
  label: string;
  onOpen?: () => void;
  openUrl: string;
}) {
  const { attachment, label, onOpen, openUrl } = props;
  const cacheKey = attachmentCacheKey(attachment);
  const sourceUrl = attachmentSourceUrl(attachment);
  const cachedUrl = cacheKey ? mediaObjectUrlByKey.get(cacheKey) || "" : "";
  const [elementRef, nearViewport] = useNearViewport<HTMLAnchorElement>();
  const [previewUrl, setPreviewUrl] = useState(cachedUrl || sourceUrl);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(Boolean(cachedUrl));
  const previewWidth = attachment.previewWidth || attachment.originalWidth || undefined;
  const previewHeight = attachment.previewHeight || attachment.originalHeight || undefined;

  useEffect(() => {
    setPreviewUrl(cachedUrl || sourceUrl);
    setPreviewFailed(false);
    setImageLoaded(Boolean(cachedUrl));
  }, [attachment.id, cachedUrl, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || cachedUrl || previewFailed || !nearViewport) return undefined;
    const controller = new AbortController();
    let active = true;

    async function loadPreview() {
      try {
        const response = await fetch(sourceUrl, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Image preview could not be loaded.");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (cacheKey) cacheMediaObjectUrl(cacheKey, objectUrl);
        setPreviewUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) {
          setPreviewFailed(true);
        }
      }
    }

    void loadPreview();

    return () => {
      active = false;
      controller.abort();
    };
  }, [cachedUrl, cacheKey, nearViewport, previewFailed, sourceUrl]);

  return (
    <a
      className={styles.imageAttachment}
      href={openUrl}
      ref={elementRef}
      rel="noreferrer"
      target="_blank"
      title="Open image"
      onClick={(event) => {
        if (!onOpen) return;
        event.preventDefault();
        onOpen();
      }}
    >
      {previewUrl && !previewFailed ? (
        <>
          {!imageLoaded && (
            <span className={styles.mediaLoadingOverlay}>
              <span className={styles.mediaSpinner} />
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            decoding="async"
            height={previewHeight}
            loading="lazy"
            onError={() => setPreviewFailed(true)}
            onLoad={() => setImageLoaded(true)}
            src={previewUrl}
            width={previewWidth}
          />
        </>
      ) : (
        <span className={styles.imageSkeleton}>
          {previewFailed ? "Open photo" : (
            <>
              <span className={styles.mediaSpinner} />
              Loading photo...
            </>
          )}
        </span>
      )}
    </a>
  );
}

function DeferredMediaAttachment(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
  label: string;
  onOpen?: () => void;
  openUrl: string;
  type: "audio" | "video";
}) {
  const { attachment, label, onOpen, openUrl, type } = props;
  const [elementRef, nearViewport] = useNearViewport<HTMLDivElement>();
  const [expanded, setExpanded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const shouldShowPreview = expanded || (type === "video" && nearViewport);
  const sourceUrl = attachmentOpenUrl(attachment);

  useEffect(() => {
    setPreviewFailed(false);
    setMediaLoaded(false);
  }, [attachment.id, sourceUrl, type]);

  if (!shouldShowPreview || previewFailed) {
    return (
      <div ref={elementRef}>
        <a
          className={styles.mediaLoadButton}
          href={expanded && previewFailed ? openUrl : undefined}
          onClick={(event) => {
            if (expanded && previewFailed) return;
            event.preventDefault();
            setExpanded(true);
          }}
          rel="noreferrer"
          target="_blank"
        >
          {previewFailed ? `Open ${label}` : `Load ${type === "video" ? "video" : "voice message"}`}
        </a>
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className={styles.mediaAttachment} ref={elementRef}>
        {!mediaLoaded && (
          <span className={styles.mediaLoadingOverlay}>
            <span className={styles.mediaSpinner} />
          </span>
        )}
        <video
          controls
          onCanPlay={() => setMediaLoaded(true)}
          onClick={(event) => {
            if (!onOpen) return;
            event.preventDefault();
            onOpen();
          }}
          onError={() => setPreviewFailed(true)}
          onLoadedMetadata={() => setMediaLoaded(true)}
          preload="metadata"
          src={sourceUrl}
        />
      </div>
    );
  }

  return (
    <div className={styles.audioAttachment}>
      <audio controls onError={() => setPreviewFailed(true)} preload="none" src={sourceUrl} />
      <a href={openUrl} rel="noreferrer" target="_blank">{label}</a>
    </div>
  );
}

function AttachmentPreview(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
  onOpen?: () => void;
}) {
  const { attachment, onOpen } = props;
  const label = attachment.originalName || attachment.contentType || "Attachment";
  const status = attachmentDisplayStatus(attachment);
  const openUrl = attachmentOpenUrl(attachment);

  if (status === "failed") {
    return (
      <span className={styles.mediaFailed}>
        Unable to load media
      </span>
    );
  }

  if (status !== "ready") {
    return (
      <span className={styles.mediaPending}>
        <LoadingState label="Preparing media..." />
      </span>
    );
  }

  if (attachmentSourceUrl(attachment) && isImageAttachment(attachment)) {
    return <LazyImageAttachment attachment={attachment} label={label} onOpen={onOpen} openUrl={openUrl} />;
  }

  if (attachmentOpenUrl(attachment) && isVideoAttachment(attachment)) {
    return <DeferredMediaAttachment attachment={attachment} label={label} onOpen={onOpen} openUrl={openUrl} type="video" />;
  }

  if (attachmentOpenUrl(attachment) && isAudioAttachment(attachment)) {
    return <DeferredMediaAttachment attachment={attachment} label={label} openUrl={openUrl} type="audio" />;
  }

  return (
    <a
      className={styles.fileAttachment}
      href={openUrl}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

function formatMediaCount(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function LoadingState({ label }: { label: string }) {
  return (
    <span className={styles.loadingState}>
      <span className={styles.mediaSpinner} aria-hidden="true" />
      {label}
    </span>
  );
}

function MediaAlbumTile(props: {
  attachment: MessageAttachment;
  hiddenCount: number;
  index: number;
  onOpen: (index: number) => void;
  total: number;
}) {
  const { attachment, hiddenCount, index, onOpen, total } = props;
  const label = attachment.originalName || attachment.contentType || "Attachment";
  const status = attachmentDisplayStatus(attachment);
  const previewUrl = attachmentSourceUrl(attachment);
  const isImage = isImageAttachment(attachment);
  const isVideo = isVideoAttachment(attachment);
  const showMore = hiddenCount > 0;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [attachment.id, previewUrl]);

  return (
    <button
      aria-label={`Open media ${index + 1} of ${total}`}
      className={styles.mediaAlbumTile}
      onClick={() => onOpen(index)}
      type="button"
    >
      {status !== "ready" ? (
        <span className={styles.mediaAlbumPlaceholder}>
          <span className={styles.mediaSpinner} />
          Preparing media...
        </span>
      ) : previewUrl && isImage ? (
        <>
          {!loaded && (
            <span className={styles.mediaLoadingOverlay}>
              <span className={styles.mediaSpinner} />
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            decoding="async"
            loading="lazy"
            onError={() => setLoaded(true)}
            onLoad={() => setLoaded(true)}
            src={previewUrl}
          />
        </>
      ) : previewUrl && isVideo ? (
        <>
          {!loaded && (
            <span className={styles.mediaLoadingOverlay}>
              <span className={styles.mediaSpinner} />
            </span>
          )}
          <video
            muted
            onCanPlay={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            onLoadedMetadata={() => setLoaded(true)}
            playsInline
            preload="metadata"
            src={previewUrl}
          />
        </>
      ) : (
        <span className={styles.mediaAlbumPlaceholder}>
          {isVideo ? "Video" : "Media"}
        </span>
      )}
      {(isImage || isVideo) && (
        <span className={styles.mediaTypeBadge}>
          {isVideo ? "Video" : "Image"}
        </span>
      )}
      {showMore && <span className={styles.mediaAlbumMore}>+{hiddenCount}</span>}
    </button>
  );
}

function MediaAlbumGrid(props: {
  attachments: MessageAttachment[];
  onOpen: (index: number) => void;
}) {
  const { attachments, onOpen } = props;
  const visibleAttachments = attachments.slice(0, 2);
  const hiddenCount = Math.max(0, attachments.length - visibleAttachments.length);
  const imageCount = attachments.filter(isImageAttachment).length;
  const videoCount = attachments.filter(isVideoAttachment).length;

  return (
    <div className={styles.mediaAlbum}>
      <div className={styles.mediaAlbumHeader} aria-label="Grouped media summary">
        {imageCount > 0 && <span className={styles.mediaAlbumChip}>{formatMediaCount(imageCount, "image")}</span>}
        {videoCount > 0 && (
          <span className={`${styles.mediaAlbumChip} ${styles.mediaAlbumChipVideo}`}>
            {formatMediaCount(videoCount, "video")}
          </span>
        )}
      </div>
      <div className={styles.mediaAlbumGrid} data-count={visibleAttachments.length}>
        {visibleAttachments.map((attachment, index) => (
          <MediaAlbumTile
            attachment={attachment}
            hiddenCount={index === visibleAttachments.length - 1 ? hiddenCount : 0}
            index={index}
            key={attachment.id}
            onOpen={onOpen}
            total={attachments.length}
          />
        ))}
      </div>
    </div>
  );
}

function MediaCarouselThumb(props: {
  attachment: MessageAttachment;
  active: boolean;
  index: number;
  onSelect: (index: number) => void;
}) {
  const { active, attachment, index, onSelect } = props;
  const label = attachment.originalName || attachment.contentType || "Media";
  const previewUrl = attachmentSourceUrl(attachment);
  const isImage = isImageAttachment(attachment);
  const isVideo = isVideoAttachment(attachment);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [attachment.id, previewUrl]);

  return (
    <button
      aria-label={`Show media ${index + 1}`}
      className={`${styles.mediaCarouselThumb} ${active ? styles.mediaCarouselThumbActive : ""}`}
      onClick={() => onSelect(index)}
      type="button"
    >
      {!loaded && (
        <span className={styles.mediaThumbLoading}>
          <span className={styles.mediaSpinner} />
        </span>
      )}
      {previewUrl && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={label}
          decoding="async"
          loading="lazy"
          onError={() => setLoaded(true)}
          onLoad={() => setLoaded(true)}
          src={previewUrl}
        />
      ) : previewUrl && isVideo ? (
        <video
          muted
          onCanPlay={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          onLoadedMetadata={() => setLoaded(true)}
          playsInline
          preload="metadata"
          src={previewUrl}
        />
      ) : (
        <span className={styles.mediaCarouselThumbFallback}>{isVideo ? "Video" : "Media"}</span>
      )}
      {(isImage || isVideo) && (
        <span className={styles.mediaCarouselThumbType}>{isVideo ? "Video" : "Image"}</span>
      )}
    </button>
  );
}

function MediaCarousel(props: {
  attachments: MessageAttachment[];
  index: number;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  subtitle?: string;
  title?: string;
}) {
  const { attachments, index, onClose, onSelectIndex, subtitle, title } = props;
  const attachment = attachments[index];
  const label = attachment?.originalName || attachment?.contentType || "Media";
  const sourceUrl = attachment ? attachmentOpenUrl(attachment) : "";
  const previewUrl = attachment ? attachmentSourceUrl(attachment) : "";
  const displayUrl = sourceUrl !== "#" ? sourceUrl : previewUrl;
  const previousDisabled = index <= 0;
  const nextDisabled = index >= attachments.length - 1;
  const imageCount = attachments.filter(isImageAttachment).length;
  const videoCount = attachments.filter(isVideoAttachment).length;
  const [mediaLoaded, setMediaLoaded] = useState(false);

  useEffect(() => {
    setMediaLoaded(false);
  }, [attachment?.id, displayUrl]);

  if (!attachment) return null;

  return (
    <div className={styles.mediaCarouselBackdrop} onClick={onClose} role="presentation">
      <div
        aria-label="Media viewer"
        aria-modal="true"
        className={styles.mediaCarouselDialog}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className={styles.mediaCarouselHeader}>
          <div className={styles.mediaCarouselIdentity}>
            <span className={styles.mediaCarouselAvatar}>MP</span>
            <div>
              <strong>{title || "Media preview"}</strong>
              <span>
                {subtitle ? `${subtitle} - ` : ""}
                {index + 1} of {attachments.length}
                {imageCount > 0 ? ` | ${formatMediaCount(imageCount, "image")}` : ""}
                {videoCount > 0 ? ` | ${formatMediaCount(videoCount, "video")}` : ""}
              </span>
            </div>
          </div>
          <div className={styles.mediaCarouselTools}>
            {displayUrl && displayUrl !== "#" && (
              <a href={displayUrl} rel="noreferrer" target="_blank">Open original</a>
            )}
            <button aria-label="Close media viewer" onClick={onClose} type="button">Close</button>
          </div>
        </div>
        <div className={styles.mediaCarouselStage}>
          <button
            aria-label="Previous media"
            className={styles.mediaCarouselNav}
            disabled={previousDisabled}
            onClick={() => onSelectIndex(index - 1)}
            type="button"
          >
            Prev
          </button>
          <div className={styles.mediaCarouselMedia}>
            {!mediaLoaded && (
              <span className={styles.mediaPreviewLoading}>
                <LoadingState label="Loading media..." />
              </span>
            )}
            {isImageAttachment(attachment) && displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={label} onLoad={() => setMediaLoaded(true)} src={displayUrl} />
            ) : isVideoAttachment(attachment) && displayUrl ? (
              <video
                autoPlay
                controls
                onCanPlay={() => setMediaLoaded(true)}
                onLoadedData={() => setMediaLoaded(true)}
                src={displayUrl}
              />
            ) : (
              <a href={displayUrl} rel="noreferrer" target="_blank" onClick={() => setMediaLoaded(true)}>Open media</a>
            )}
          </div>
          <button
            aria-label="Next media"
            className={styles.mediaCarouselNav}
            disabled={nextDisabled}
            onClick={() => onSelectIndex(index + 1)}
            type="button"
          >
            Next
          </button>
        </div>
        <div className={styles.mediaCarouselFooter}>
          <div className={styles.mediaCarouselFooterCount}>
            {index + 1} of {attachments.length}
          </div>
          <div className={styles.mediaCarouselThumbStrip}>
            {attachments.map((carouselAttachment, carouselIndex) => (
              <MediaCarouselThumb
                active={carouselIndex === index}
                attachment={carouselAttachment}
                index={carouselIndex}
                key={carouselAttachment.id}
                onSelect={onSelectIndex}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppInboxClient() {
  const initialCacheRef = useRef<InboxTabCache | null | undefined>(undefined);
  if (initialCacheRef.current === undefined) {
    initialCacheRef.current = readInboxTabCache();
  }
  const initialCache = initialCacheRef.current;
  const initialCacheFullyWarmed = hasEveryConversationWarmed(initialCache);
  const [inbox, setInbox] = useState<InboxPayload>(() => initialCache?.inbox || { conversations: [], selectedConversation: null, messages: [] });
  const [conversationCache, setConversationCache] = useState<ConversationCache>(() => initialCache?.conversationCache || {});
  const [selectedId, setSelectedId] = useState<string>(() => initialCache?.selectedId || initialCache?.inbox.selectedConversation?.id || "");
  const [search, setSearch] = useState(() => initialCache?.search || "");
  const [filter, setFilter] = useState(() => initialCache?.filter || "ALL");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => !initialCacheFullyWarmed);
  const [booting, setBooting] = useState(() => !initialCacheFullyWarmed);
  const [bootProgress, setBootProgress] = useState(() => initialCacheFullyWarmed ? 100 : 0);
  const [bootStatus, setBootStatus] = useState(() => initialCacheFullyWarmed ? "Restored every warmed chat saved in this browser." : "Checking warmed chats saved in this browser...");
  const [persistentCacheHydrated, setPersistentCacheHydrated] = useState(() => initialCacheFullyWarmed);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [detailPanelLoading, setDetailPanelLoading] = useState(false);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<InboxMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState("");
  const [reactingMessageId, setReactingMessageId] = useState("");
  const [mediaCarousel, setMediaCarousel] = useState<MediaCarouselState>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [runningFlowId, setRunningFlowId] = useState("");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const conversationRowsRef = useRef<HTMLDivElement | null>(null);
  const conversationRowsScrollTopRef = useRef(0);
  const messageShouldStickToBottomRef = useRef(true);
  const selectedIdRef = useRef(initialCache?.selectedId || initialCache?.inbox.selectedConversation?.id || "");
  const conversationCacheRef = useRef<ConversationCache>(initialCache?.conversationCache || {});
  const previousConversationListScopeRef = useRef({ filter, search });
  const sendingRef = useRef(false);
  const listRefreshTimerRef = useRef<number | null>(null);
  const conversationRefreshTimerRef = useRef<number | null>(null);
  const detailLoadTimerRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const backgroundWarmIdsRef = useRef(new Set<string>());
  const backgroundWarmQueueRef = useRef<string[]>([]);
  const backgroundWarmQueueRunningRef = useRef(false);
  const restoredFromCacheRef = useRef(initialCacheFullyWarmed);

  const clampConversationRowsScrollTop = useCallback((element: HTMLDivElement, scrollTop: number) => (
    Math.min(scrollTop, Math.max(0, element.scrollHeight - element.clientHeight))
  ), []);

  const captureConversationRowsAnchor = useCallback((): ConversationRowsAnchor | null => {
    const element = conversationRowsRef.current;
    if (!element) return null;

    const rows = Array.from(element.querySelectorAll<HTMLElement>("[data-conversation-id]"));
    const containerTop = element.getBoundingClientRect().top;
    const firstVisibleRow = rows.find((row) => row.getBoundingClientRect().bottom > containerTop + 1);

    if (!firstVisibleRow) {
      return {
        conversationId: "",
        offsetTop: 0,
        fallbackScrollTop: element.scrollTop,
      };
    }

    return {
      conversationId: firstVisibleRow.dataset.conversationId || "",
      offsetTop: firstVisibleRow.getBoundingClientRect().top - containerTop,
      fallbackScrollTop: element.scrollTop,
    };
  }, []);

  const restoreConversationRowsAnchor = useCallback((anchor: ConversationRowsAnchor | null) => {
    if (!anchor) return;
    window.requestAnimationFrame(() => {
      const element = conversationRowsRef.current;
      if (!element) return;

      if (!anchor.conversationId) {
        element.scrollTop = clampConversationRowsScrollTop(element, anchor.fallbackScrollTop);
        conversationRowsScrollTopRef.current = element.scrollTop;
        return;
      }

      const anchoredRow = Array.from(element.querySelectorAll<HTMLElement>("[data-conversation-id]"))
        .find((row) => row.dataset.conversationId === anchor.conversationId);

      if (!anchoredRow) {
        element.scrollTop = clampConversationRowsScrollTop(element, anchor.fallbackScrollTop);
        conversationRowsScrollTopRef.current = element.scrollTop;
        return;
      }

      const containerTop = element.getBoundingClientRect().top;
      const nextOffset = anchoredRow.getBoundingClientRect().top - containerTop;
      const scrollDelta = nextOffset - anchor.offsetTop;
      if (Math.abs(scrollDelta) > 1) {
        element.scrollTop = clampConversationRowsScrollTop(element, element.scrollTop + scrollDelta);
      }
      conversationRowsScrollTopRef.current = element.scrollTop;
    });
  }, [clampConversationRowsScrollTop]);

  useEffect(() => {
    conversationCacheRef.current = conversationCache;
  }, [conversationCache]);

  useEffect(() => {
    void warmSharedMediaAssets();
  }, []);

  useEffect(() => {
    if (!mediaCarousel) return undefined;
    function handleCarouselKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMediaCarousel(null);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      setMediaCarousel((current) => {
        if (!current) return current;
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const nextIndex = Math.min(Math.max(current.index + direction, 0), current.attachments.length - 1);
        return { ...current, index: nextIndex };
      });
    }
    window.addEventListener("keydown", handleCarouselKeydown);
    return () => window.removeEventListener("keydown", handleCarouselKeydown);
  }, [mediaCarousel]);

  useEffect(() => {
    let cancelled = false;

    async function hydratePersistentCache() {
      if (initialCacheFullyWarmed) {
        setPersistentCacheHydrated(true);
        return;
      }

      try {
        const snapshot = await readPersistentInboxCache();
        if (cancelled) return;

        if (snapshot) {
          const nextSelectedId = snapshot.selectedId || snapshot.inbox.selectedConversation?.id || "";
          const fullyWarmed = hasEveryConversationWarmed(snapshot);
          inboxMemorySnapshot = snapshot;
          conversationCacheRef.current = snapshot.conversationCache;
          selectedIdRef.current = nextSelectedId;
          restoredFromCacheRef.current = fullyWarmed;
          setInbox(snapshot.inbox);
          setConversationCache(snapshot.conversationCache);
          setSelectedId(nextSelectedId);
          setSearch(snapshot.search || "");
          setFilter(snapshot.filter || "ALL");
          if (fullyWarmed) {
            setBootProgress(100);
            setBootStatus("Restored every warmed chat saved in this browser.");
            setBooting(false);
            setLoading(false);
          } else {
            setBootStatus("Saved chats restored. Warming anything missing...");
          }
        }
      } finally {
        if (!cancelled) setPersistentCacheHydrated(true);
      }
    }

    void hydratePersistentCache();

    return () => {
      cancelled = true;
    };
  }, [initialCacheFullyWarmed]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!persistentCacheHydrated) return undefined;
    if (!inbox.conversations.length && !inbox.selectedConversation) return undefined;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      writeInboxTabCache({
        version: 3,
        savedAt: Date.now(),
        inbox,
        conversationCache,
        selectedId,
        search,
        filter,
      });
    }, 220);

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        writeInboxTabCache({
          version: 3,
          savedAt: Date.now(),
          inbox,
          conversationCache,
          selectedId,
          search,
          filter,
        });
      }
    };
  }, [conversationCache, filter, inbox, persistentCacheHydrated, search, selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function loadFlows() {
      setFlowsLoading(true);
      try {
        const response = await fetch("/api/crm/flows", { cache: "no-store" });
        const result = (await response.json()) as { ok?: boolean; flows?: WhatsAppFlow[]; error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || "WhatsApp flows could not be loaded.");
        if (!cancelled) setFlows(result.flows || []);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "WhatsApp flows could not be loaded.");
      } finally {
        if (!cancelled) setFlowsLoading(false);
      }
    }

    void loadFlows();

    return () => {
      cancelled = true;
    };
  }, []);

  const rememberConversation = useCallback((selectedConversation: SelectedConversation, messages: InboxMessage[]) => {
    if (!selectedConversation) return;
    void warmConversationMedia(messages);
    setConversationCache((current) => ({
      ...current,
      [selectedConversation.id]: {
        selectedConversation: selectedConversation.detailsLoaded
          ? selectedConversation
          : {
            ...selectedConversation,
            detailsLoaded: current[selectedConversation.id]?.selectedConversation.detailsLoaded || false,
            leads: current[selectedConversation.id]?.selectedConversation.leads || selectedConversation.leads || [],
            commands: current[selectedConversation.id]?.selectedConversation.commands || selectedConversation.commands || [],
          },
        messages: mergeLocalPendingMessages(messages, current[selectedConversation.id]?.messages),
        loadedAt: Date.now(),
      },
    }));
  }, []);

  const patchConversationMessages = useCallback((
    conversationId: string,
    updater: (messages: InboxMessage[]) => InboxMessage[],
  ) => {
    setInbox((current) => (
      current.selectedConversation?.id === conversationId
        ? { ...current, messages: updater(current.messages) }
        : current
    ));
    setConversationCache((current) => {
      const cached = current[conversationId];
      if (!cached) return current;
      return {
        ...current,
        [conversationId]: {
          ...cached,
          messages: updater(cached.messages),
          loadedAt: Date.now(),
        },
      };
    });
  }, []);

  const fetchConversation = useCallback(async (conversationId: string, includeDetails = false) => {
    const response = await fetch(`/api/crm/inbox?scope=conversation&conversationId=${encodeURIComponent(conversationId)}&messageLimit=${MESSAGE_FETCH_LIMIT}&details=${includeDetails ? "1" : "0"}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM conversation could not be loaded.");
    }
    return data.inbox as InboxPayload;
  }, []);

  const fetchConversationDetails = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/crm/inbox?scope=details&conversationId=${encodeURIComponent(conversationId)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM customer details could not be loaded.");
    }
    return data.inbox.selectedConversation as SelectedConversation;
  }, []);

  const mergeConversationDetails = useCallback((conversationId: string, details: SelectedConversation) => {
    if (!details) return;
    setInbox((current) => {
      if (current.selectedConversation?.id !== conversationId) return current;
      return {
        ...current,
        selectedConversation: {
          ...current.selectedConversation,
          ...details,
          detailsLoaded: true,
          leads: details.leads || [],
          commands: details.commands || [],
        },
      };
    });
    setConversationCache((current) => {
      const cached = current[conversationId];
      if (!cached) return current;
      return {
        ...current,
        [conversationId]: {
          ...cached,
          selectedConversation: {
            ...cached.selectedConversation,
            ...details,
            detailsLoaded: true,
            leads: details.leads || [],
            commands: details.commands || [],
          },
        },
      };
    });
  }, []);

  const loadConversationDetails = useCallback(async (conversationId: string) => {
    setDetailPanelLoading(true);
    try {
      const details = await fetchConversationDetails(conversationId);
      mergeConversationDetails(conversationId, details);
    } finally {
      if (selectedIdRef.current === conversationId) {
        setDetailPanelLoading(false);
      }
    }
  }, [fetchConversationDetails, mergeConversationDetails]);

  const loadInbox = useCallback(async (conversationId?: string, listLimit = CHAT_LIST_LIMIT) => {
    setLoading(true);
    try {
      const query = conversationId
        ? `?conversationId=${encodeURIComponent(conversationId)}&limit=${listLimit}&messageLimit=${MESSAGE_FETCH_LIMIT}&details=0`
        : `?scope=list&limit=${listLimit}`;
      const response = await fetch(`/api/crm/inbox${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "CRM inbox could not be loaded.");
      }
      setInbox(data.inbox);
      const nextSelected = data.inbox.selectedConversation?.id || "";
      selectedIdRef.current = nextSelected;
      setSelectedId(nextSelected);
      rememberConversation(data.inbox.selectedConversation, data.inbox.messages);
    } finally {
      setLoading(false);
    }
  }, [rememberConversation]);

  const loadConversationList = useCallback(async (listLimit = CHAT_LIST_LIMIT) => {
    const response = await fetch(`/api/crm/inbox?scope=list&limit=${listLimit}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM chat list could not be loaded.");
    }
    const anchor = captureConversationRowsAnchor();
    setInbox((current) => ({
      ...current,
      conversations: data.inbox.conversations,
    }));
    restoreConversationRowsAnchor(anchor);
    return data.inbox as InboxPayload;
  }, [captureConversationRowsAnchor, restoreConversationRowsAnchor]);

  const loadConversation = useCallback(async (conversationId: string, showSpinner = true) => {
    if (showSpinner) setConversationLoading(true);
    try {
      const nextInbox = await fetchConversation(conversationId);
      rememberConversation(nextInbox.selectedConversation, nextInbox.messages);
      if (selectedIdRef.current !== conversationId) {
        return;
      }
      setInbox((current) => ({
        ...current,
        selectedConversation: nextInbox.selectedConversation
          ? {
            ...nextInbox.selectedConversation,
            detailsLoaded: current.selectedConversation?.id === conversationId
              ? current.selectedConversation.detailsLoaded || nextInbox.selectedConversation.detailsLoaded || false
              : nextInbox.selectedConversation.detailsLoaded || false,
            leads: current.selectedConversation?.id === conversationId && current.selectedConversation.detailsLoaded
              ? current.selectedConversation.leads || []
              : nextInbox.selectedConversation.leads || [],
            commands: current.selectedConversation?.id === conversationId && current.selectedConversation.detailsLoaded
              ? current.selectedConversation.commands || []
              : nextInbox.selectedConversation.commands || [],
          }
          : nextInbox.selectedConversation,
        messages: mergeLocalPendingMessages(
          nextInbox.messages,
          current.selectedConversation?.id === conversationId ? current.messages : conversationCacheRef.current[conversationId]?.messages,
        ),
      }));
    } finally {
      if (showSpinner) setConversationLoading(false);
    }
  }, [fetchConversation, rememberConversation]);

  const warmConversationInBackground = useCallback(async (conversationId?: string | null) => {
    if (!conversationId) return;
    if (backgroundWarmIdsRef.current.has(conversationId)) return;

    backgroundWarmIdsRef.current.add(conversationId);
    try {
      await loadConversation(conversationId, false);
    } catch {
      // Background warming should never interrupt the inbox; clicking can still fetch if needed.
    } finally {
      backgroundWarmIdsRef.current.delete(conversationId);
    }
  }, [loadConversation]);

  const preloadConversations = useCallback(async (
    conversationIds: string[],
    onProgress?: (completed: number, total: number) => void,
  ) => {
    const uniqueIds = Array.from(new Set(conversationIds)).filter(Boolean);
    if (!uniqueIds.length) {
      onProgress?.(0, 0);
      return;
    }
    let completed = 0;
    for (let index = 0; index < uniqueIds.length; index += 4) {
      const batch = uniqueIds.slice(index, index + 4);
      await Promise.all(batch.map(async (conversationId) => {
        const cached = conversationCacheRef.current[conversationId];
        if (cached) return;
        try {
          const nextInbox = await fetchConversation(conversationId, false);
          rememberConversation(nextInbox.selectedConversation, nextInbox.messages);
          await warmConversationMedia(nextInbox.messages);
        } catch {
          // A single slow or failed chat should not block the rest of the inbox from opening.
        }
      }));
      completed += batch.length;
      onProgress?.(Math.min(completed, uniqueIds.length), uniqueIds.length);
    }
  }, [fetchConversation, rememberConversation]);

  const getMissingOrStaleConversationIds = useCallback((conversations: ConversationSummary[], excludeIds: string[] = []) => {
    const exclude = new Set(excludeIds.filter(Boolean));
    return conversations
      .filter((conversation) => {
        if (!conversation.id || exclude.has(conversation.id)) return false;
        const cached = conversationCacheRef.current[conversation.id];
        const cachedLastMessageAt = cached?.selectedConversation.lastMessageAt || null;
        return !cached || cachedLastMessageAt !== conversation.lastMessageAt;
      })
      .map((conversation) => conversation.id);
  }, []);

  const warmQueuedConversations = useCallback((conversationIds: string[], priority = false) => {
    const nextIds = Array.from(new Set(conversationIds.filter(Boolean)));
    if (!nextIds.length) return;

    const existingQueue = backgroundWarmQueueRef.current.filter((conversationId) => !nextIds.includes(conversationId));
    backgroundWarmQueueRef.current = priority
      ? [...nextIds, ...existingQueue]
      : [...existingQueue, ...nextIds];

    if (backgroundWarmQueueRunningRef.current) return;

    backgroundWarmQueueRunningRef.current = true;
    setBackgroundLoading(true);
    void (async () => {
      try {
        while (backgroundWarmQueueRef.current.length) {
          const batch = backgroundWarmQueueRef.current.splice(0, 4);
          await preloadConversations(batch);
        }
      } finally {
        backgroundWarmQueueRunningRef.current = false;
        setBackgroundLoading(false);
      }
    })();
  }, [preloadConversations]);

  const scheduleListRefresh = useCallback((delay = REALTIME_REFRESH_DEBOUNCE_MS, priorityConversationId?: string | null) => {
    if (listRefreshTimerRef.current !== null) {
      window.clearTimeout(listRefreshTimerRef.current);
    }
    listRefreshTimerRef.current = window.setTimeout(() => {
      listRefreshTimerRef.current = null;
      loadConversationList()
        .then((nextInbox) => {
          const selectedConversationId = selectedIdRef.current;
          const staleIds = getMissingOrStaleConversationIds(nextInbox.conversations, [selectedConversationId]);
          const priorityIds = priorityConversationId && priorityConversationId !== selectedConversationId
            ? [priorityConversationId]
            : [];
          warmQueuedConversations([...priorityIds, ...staleIds], Boolean(priorityIds.length));
        })
        .catch(() => undefined);
    }, delay);
  }, [getMissingOrStaleConversationIds, loadConversationList, warmQueuedConversations]);

  const scheduleConversationRefresh = useCallback((conversationId?: string | null, delay = REALTIME_REFRESH_DEBOUNCE_MS) => {
    const currentSelected = selectedIdRef.current;
    if (!currentSelected) return;
    if (conversationId && conversationId !== currentSelected) return;
    if (conversationRefreshTimerRef.current !== null) {
      window.clearTimeout(conversationRefreshTimerRef.current);
    }
    conversationRefreshTimerRef.current = window.setTimeout(() => {
      conversationRefreshTimerRef.current = null;
      loadConversation(currentSelected, false).catch(() => undefined);
    }, delay);
  }, [loadConversation]);

  useEffect(() => {
    if (!persistentCacheHydrated) return undefined;

    let active = true;

    function setBootStep(progress: number, status: string) {
      if (!active) return;
      setBootProgress(Math.max(0, Math.min(100, progress)));
      setBootStatus(status);
    }

    async function bootInbox() {
      if (restoredFromCacheRef.current) {
        setBooting(false);
        setLoading(false);
        setBootStep(100, "Saved warmed chats restored from this browser.");
        try {
          const listInbox = await loadConversationList(CHAT_LIST_LIMIT);
          if (!active) return;
          const nextSelectedId = selectedIdRef.current || listInbox.conversations[0]?.id || "";
          if (nextSelectedId && !selectedIdRef.current) {
            selectedIdRef.current = nextSelectedId;
            setSelectedId(nextSelectedId);
          }
          if (nextSelectedId) {
            await loadConversation(nextSelectedId, false);
          }
          if (!active) return;
          warmQueuedConversations(
            getMissingOrStaleConversationIds(listInbox.conversations, [nextSelectedId]),
          );
        } catch {
          if (active) setNotice("Saved chats are shown. Latest WhatsApp refresh could not finish yet.");
        }
        return;
      }

      setBooting(true);
      setLoading(true);
      setBootStep(8, "Connecting to WhatsApp CRM...");
      try {
        setBootStep(18, "Loading every chat in the inbox...");
        const listInbox = await loadConversationList(CHAT_LIST_LIMIT);
        if (!active) return;
        const firstConversation = listInbox.conversations[0];
        setBootStep(38, `Loaded ${listInbox.conversations.length} chats. Opening the latest chat...`);
        if (firstConversation) {
          selectedIdRef.current = firstConversation.id;
          setSelectedId(firstConversation.id);
          setInbox((current) => ({
            ...current,
            selectedConversation: selectedFromSummary(firstConversation),
            messages: [],
          }));
          await loadConversation(firstConversation.id, false);
          setBootStep(58, "Latest chat is ready. Warming every chat...");
        } else {
          setBootStep(82, "No WhatsApp chats found yet.");
        }
        if (!active) return;
        const firstTwentyIds = listInbox.conversations
          .slice(0, INBOX_QUICK_CACHE_CONVERSATION_LIMIT)
          .map((conversation) => conversation.id)
          .filter((conversationId) => conversationId !== firstConversation?.id);
        await preloadConversations(
          firstTwentyIds,
          (completed, total) => {
            if (!total) {
              setBootStep(94, "Your latest chats are ready.");
              return;
            }
            const progress = 60 + Math.round((completed / total) * 34);
            setBootStep(progress, `Warming latest chats ${completed} of ${total}...`);
          },
        );
        setBootStep(100, "WhatsApp inbox ready. Warming the rest in the background.");
        if (active) {
          const warmedIds = new Set([firstConversation?.id, ...firstTwentyIds].filter(Boolean));
          warmQueuedConversations(
            listInbox.conversations
              .map((conversation) => conversation.id)
              .filter((conversationId) => !warmedIds.has(conversationId)),
          );
        }
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : "CRM inbox could not be loaded.");
        }
      } finally {
        if (active) {
          setBooting(false);
          setLoading(false);
        }
      }
    }

    void bootInbox();

    return () => {
      active = false;
    };
  }, [getMissingOrStaleConversationIds, loadConversation, loadConversationList, persistentCacheHydrated, preloadConversations, warmQueuedConversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const realtimeClient = supabase;
    if (!realtimeClient) return undefined;
    const channel = realtimeClient
      .channel(CRM_REALTIME_TOPIC, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "crm_change" }, (event) => {
        const payload = (event.payload ?? {}) as CrmRealtimePayload;
        if (payload.table !== "crm_contacts") {
          const changedConversationId = payload.conversationId
            || (payload.table === "crm_conversations" ? payload.id : null);
          if (changedConversationId && changedConversationId !== selectedIdRef.current) {
            void warmConversationInBackground(changedConversationId);
          }
          scheduleListRefresh(0, changedConversationId);
          scheduleConversationRefresh(changedConversationId);
        } else {
          scheduleListRefresh();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          scheduleListRefresh(0);
        }
      });

    return () => {
      void realtimeClient.removeChannel(channel);
    };
  }, [scheduleConversationRefresh, scheduleListRefresh, warmConversationInBackground]);

  useEffect(() => {
    const refreshVisibleInbox = () => {
      if (document.visibilityState !== "visible") return;
      scheduleListRefresh(0);
      scheduleConversationRefresh(selectedIdRef.current, 0);
    };
    document.addEventListener("visibilitychange", refreshVisibleInbox);
    window.addEventListener("focus", refreshVisibleInbox);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisibleInbox);
      window.removeEventListener("focus", refreshVisibleInbox);
    };
  }, [scheduleConversationRefresh, scheduleListRefresh]);

  useEffect(() => {
    const backgroundWarmIds = backgroundWarmIdsRef.current;
    return () => {
      if (listRefreshTimerRef.current !== null) {
        window.clearTimeout(listRefreshTimerRef.current);
      }
      if (conversationRefreshTimerRef.current !== null) {
        window.clearTimeout(conversationRefreshTimerRef.current);
      }
      if (detailLoadTimerRef.current !== null) {
        window.clearTimeout(detailLoadTimerRef.current);
      }
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
      backgroundWarmIds.clear();
    };
  }, []);

  useEffect(() => {
    if (!selectedId || inbox.selectedConversation?.id !== selectedId) return undefined;
    if (inbox.selectedConversation.detailsLoaded) {
      setDetailPanelLoading(false);
      return undefined;
    }
    if (detailLoadTimerRef.current !== null) {
      window.clearTimeout(detailLoadTimerRef.current);
    }
    detailLoadTimerRef.current = window.setTimeout(() => {
      detailLoadTimerRef.current = null;
      void loadConversationDetails(selectedId).catch(() => undefined);
    }, 180);

    return () => {
      if (detailLoadTimerRef.current !== null) {
        window.clearTimeout(detailLoadTimerRef.current);
        detailLoadTimerRef.current = null;
      }
    };
  }, [inbox.selectedConversation?.detailsLoaded, inbox.selectedConversation?.id, loadConversationDetails, selectedId]);

  useEffect(() => {
    const element = messageStreamRef.current;
    if (!element) return;
    if (!messageShouldStickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      const nextElement = messageStreamRef.current;
      if (!nextElement || !messageShouldStickToBottomRef.current) return;
      nextElement.scrollTop = nextElement.scrollHeight;
    });
  }, [inbox.messages, selectedId]);

  const selected = inbox.selectedConversation;

  const visibleConversations = useMemo(() => {
    const query = normalizeSearch(search);
    return inbox.conversations.filter((conversation) => {
      if (filter === "UNREAD" && conversation.unreadCount <= 0) return false;
      if (!["ALL", "UNREAD"].includes(filter) && conversation.status !== filter) return false;
      if (!query) return true;
      const haystack = normalizeSearch([
        conversation.contact.displayName,
        conversation.contact.phone,
        conversation.contact.waId,
        conversation.lastMessage?.preview,
      ].filter(Boolean).join(" "));
      return haystack.includes(query);
    });
  }, [filter, inbox.conversations, search]);

  const visibleConversationOrderKey = useMemo(() => (
    visibleConversations.map((conversation) => conversation.id).join("|")
  ), [visibleConversations]);

  useLayoutEffect(() => {
    const element = conversationRowsRef.current;
    if (!element) return;

    const previousScope = previousConversationListScopeRef.current;
    const scopeChanged = previousScope.filter !== filter || previousScope.search !== search;
    previousConversationListScopeRef.current = { filter, search };

    if (scopeChanged) {
      conversationRowsScrollTopRef.current = 0;
      element.scrollTop = 0;
      return;
    }

    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const nextTop = Math.min(conversationRowsScrollTopRef.current, maxTop);
    if (Math.abs(element.scrollTop - nextTop) > 1) {
      element.scrollTop = nextTop;
    }
    conversationRowsScrollTopRef.current = nextTop;
  }, [filter, search, visibleConversationOrderKey]);

  const selectedStats = useMemo(() => {
    return {
      inbound: inbox.messages.filter((message) => message.direction === "INBOUND").length,
      outbound: inbox.messages.filter((message) => message.direction === "OUTBOUND").length,
      aiSuggestions: inbox.messages.filter((message) => message.senderType === "AI" && message.status === "QUEUED").length,
    };
  }, [inbox.messages]);

  const activeFlows = useMemo(() => (
    flows.filter((flow) => flow.status === "Active" && flow.steps.length > 0 && (flow.triggerType || "click") === "click")
  ), [flows]);

  function mediaItemsFromStep(step: WhatsAppFlowStep): FlowMediaItem[] {
    const mediaItems = Array.isArray(step.mediaItems) ? step.mediaItems : [];
    const normalised = mediaItems
      .map((item) => ({
        type: item.type === "video" ? "video" as const : "image" as const,
        url: (item.url || "").trim(),
        caption: (item.caption || "").trim(),
      }))
      .filter((item) => item.url);

    if (normalised.length) return normalised;
    if (step.imageUrl?.trim()) return [{ type: "image", url: step.imageUrl.trim(), caption: step.message || "" }];
    if (step.videoUrl?.trim()) return [{ type: "video", url: step.videoUrl.trim(), caption: step.message || "" }];
    return [];
  }

  async function selectConversation(conversationId: string) {
    messageShouldStickToBottomRef.current = true;
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setNotice("");
    setReplyTarget(null);
    setReactionPickerMessageId("");
    setReactingMessageId("");
    const cached = conversationCacheRef.current[conversationId];
    if (cached) {
      setInbox((current) => ({
        ...current,
        selectedConversation: cached.selectedConversation,
        messages: cached.messages,
      }));
      void loadConversation(conversationId, false);
      return;
    }
    const summary = inbox.conversations.find((conversation) => conversation.id === conversationId);
    if (!cached && summary) {
      setInbox((current) => ({
        ...current,
        selectedConversation: selectedFromSummary(summary),
        messages: [],
      }));
    }
    await loadConversation(conversationId);
  }

  async function sendMessage(messageId?: string, bodyOverride?: string, media?: { type: FlowMediaType; url: string }) {
    const body = (bodyOverride !== undefined ? bodyOverride : draft).trim();
    const mediaUrl = media?.url.trim() || "";
    const sendingMedia = (media?.type === "image" || media?.type === "video") && Boolean(mediaUrl);
    if (!selectedId || (!body && !sendingMedia)) return;
    if (sendingRef.current) return;

    const conversationId = selectedId;
    const activeReplyTarget = bodyOverride === undefined && !messageId ? replyTarget : null;
    const optimisticReplyTo = activeReplyTarget ? messageReplyPreview(activeReplyTarget) : null;
    const optimisticId = messageId ? "" : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    messageShouldStickToBottomRef.current = true;
    if (optimisticId) {
      const optimisticAttachments = sendingMedia && media ? [optimisticMediaAttachment(optimisticId, { type: media.type, url: mediaUrl })] : [];
      const fallbackBody = media?.type === "video" ? "Video" : "Photo";
      patchConversationMessages(conversationId, (messages) => [
        ...messages,
        optimisticOutboundMessage(
          optimisticId,
          body || fallbackBody,
          media?.type === "video" ? "VIDEO" : media?.type === "image" ? "IMAGE" : "TEXT",
          optimisticAttachments,
          optimisticReplyTo,
        ),
      ]);
      if (bodyOverride === undefined && !sendingMedia) {
        setDraft("");
        setReplyTarget(null);
      }
    }

    sendingRef.current = true;
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messageId,
          body,
          replyToMessageId: activeReplyTarget?.id,
          ...(sendingMedia && media ? { mediaType: media.type, mediaUrl } : {}),
        }),
      });
      const data = await response.json();
      if (data.message) {
        if (optimisticId) {
          patchConversationMessages(conversationId, (messages) => {
            const stableMessage = messages.find((message) => message.id === optimisticId);
            const returnedMessage = normalizeReturnedMessage(data.message, stableMessage);
            return messages.map((message) => (message.id === optimisticId ? returnedMessage : message));
          });
        } else {
          await loadConversation(conversationId, false);
        }
        void loadConversationList();
      }
      if (!response.ok || !data.ok) {
        if (optimisticId && !data.message) {
          patchConversationMessages(conversationId, (messages) => (
            messages.map((message) => (
              message.id === optimisticId
                ? { ...message, status: "FAILED", failedReason: data.error || "WhatsApp message could not be sent." }
                : message
            ))
          ));
        }
        setNotice(data.error || "WhatsApp message could not be sent.");
        return;
      }
      if (data.message?.status === "QUEUED") {
        setNotice("Message saved, but WhatsApp sending is not fully configured yet.");
      }
    } catch (error) {
      if (optimisticId) {
        patchConversationMessages(conversationId, (messages) => (
          messages.map((message) => (
            message.id === optimisticId
              ? { ...message, status: "FAILED", failedReason: error instanceof Error ? error.message : "WhatsApp message could not be sent." }
              : message
          ))
        ));
      }
      setNotice(error instanceof Error ? error.message : "WhatsApp message could not be sent.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function reactToMessage(message: InboxMessage, emoji: string) {
    if (!selectedId || reactingMessageId) return;
    if (message.id.startsWith("local-")) {
      setNotice("Wait until WhatsApp confirms this message before reacting to it.");
      return;
    }

    const conversationId = selectedId;
    const localReactionId = `local-reaction-${message.id}-${Date.now()}`;
    setReactionPickerMessageId("");
    setReactingMessageId(message.id);
    patchConversationMessages(conversationId, (messages) => (
      messages.map((item) => (
        item.id === message.id
          ? {
            ...item,
            reactions: [
              ...(item.reactions || []).filter((reaction) => !(reaction.direction === "OUTBOUND" && reaction.senderType === "TEAM")),
              {
                id: localReactionId,
                emoji,
                direction: "OUTBOUND",
                senderType: "TEAM",
                createdAt: new Date().toISOString(),
              },
            ],
          }
          : item
      ))
    ));

    try {
      const response = await fetch("/api/crm/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: "react",
          targetMessageId: message.id,
          reactionEmoji: emoji,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.reaction) {
        throw new Error(data.error || "WhatsApp reaction could not be sent.");
      }
      patchConversationMessages(conversationId, (messages) => (
        messages.map((item) => (
          item.id === message.id
            ? {
              ...item,
              reactions: (item.reactions || []).map((reaction) => (
                reaction.id === localReactionId ? data.reaction : reaction
              )),
            }
            : item
        ))
      ));
      void loadConversationList();
    } catch (error) {
      patchConversationMessages(conversationId, (messages) => (
        messages.map((item) => (
          item.id === message.id
            ? { ...item, reactions: (item.reactions || []).filter((reaction) => reaction.id !== localReactionId) }
            : item
        ))
      ));
      setNotice(error instanceof Error ? error.message : "WhatsApp reaction could not be sent.");
    } finally {
      setReactingMessageId("");
    }
  }

  async function generateAiReply() {
    if (!selectedId) return;

    setGeneratingAi(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, action: "suggest" }),
      });
      const data = await response.json();
      if (data.message) {
        await loadConversation(selectedId, false);
        void loadConversationList();
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "AI reply could not be generated.");
      }
      setNotice("AI reply generated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI reply could not be generated.");
    } finally {
      setGeneratingAi(false);
    }
  }

  async function runFlow(flow: WhatsAppFlow) {
    if (!selectedId || runningFlowId) return;

    setRunningFlowId(flow.id);
    setNotice("");
    try {
      for (const step of flow.steps) {
        const delay = flowDelayMs(step);
        if (delay > 0) {
          await wait(delay);
        }

        if (step.type === "Send Message") {
          const text = personalizeFlowText(step.message, selected);
          if (text) await sendMessage(undefined, text);
          continue;
        }

        if (step.type === "Send Media" || step.type === "Send Image" || step.type === "Send Video") {
          const mediaItems = mediaItemsFromStep(step);
          if (mediaItems.length) {
            for (const [index, item] of mediaItems.entries()) {
              const caption = personalizeFlowText(item.caption || (index === 0 ? step.message : ""), selected);
              await sendMessage(undefined, caption, { type: item.type, url: item.url });
            }
          } else {
            const text = personalizeFlowText(step.message, selected);
            if (text) await sendMessage(undefined, text);
          }
          continue;
        }

        if (step.type === "AI Reply") {
          await generateAiReply();
        }
      }
    } finally {
      setRunningFlowId("");
    }
  }

  async function updateConversation(patch: { status?: string; aiMode?: string; displayName?: string }) {
    if (!selectedId) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, ...patch }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Conversation could not be updated.");
      }
      const anchor = captureConversationRowsAnchor();
      setInbox(data.inbox);
      restoreConversationRowsAnchor(anchor);
      rememberConversation(data.inbox.selectedConversation, data.inbox.messages);
      void loadConversationList();
      setNotice("Conversation updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Conversation could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      {notice && (
        <div className={styles.notice}>
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>x</button>
        </div>
      )}

      {booting ? (
        <section className={styles.bootScreen}>
          <div className={styles.bootCard}>
            <span className={styles.bootLogo}>MP</span>
            <p className={styles.eyebrow}>WhatsApp CRM</p>
            <h2>Loading your latest chats</h2>
            <p>{bootStatus}</p>
            <div className={styles.bootProgressShell} aria-label={`WhatsApp inbox ${bootProgress}% loaded`}>
              <span style={{ width: `${bootProgress}%` }} />
            </div>
            <strong className={styles.bootPercent}>{bootProgress}%</strong>
            <small className={styles.bootHint}>
              The newest 20 chats open first. The rest keep warming quietly in the background.
            </small>
          </div>
        </section>
      ) : (
      <section className={`${styles.whatsappWorkspace} ${detailPanelCollapsed ? styles.detailCollapsed : ""}`}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <Link className={styles.railActive} href="/crm/inbox">Inbox</Link>
          <Link href="/crm/flows">Flows</Link>
          <Link href="/crm/test-ai">Test AI</Link>
          <Link href="/crm/setup">Setup</Link>
        </aside>

        <aside className={styles.conversationList}>
          <div className={styles.listHeader}>
            <div>
              <h2>Chats</h2>
              <p>
                {visibleConversations.length} shown from {inbox.conversations.length}
                {backgroundLoading ? " | warming latest chats..." : ""}
              </p>
            </div>
            <button
              onClick={() => {
                void loadConversationList();
                if (selectedId) {
                  void loadConversation(selectedId, false);
                } else {
                  void loadInbox();
                }
              }}
              disabled={loading}
            >
              Sync
            </button>
          </div>

          <div className={styles.searchBox}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, or message..."
            />
          </div>

          <div className={styles.filterPills}>
            {filterOptions.map((option) => (
              <button
                className={filter === option.value ? styles.activeFilter : ""}
                key={option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            className={styles.conversationRows}
            onScroll={(event) => {
              conversationRowsScrollTopRef.current = event.currentTarget.scrollTop;
            }}
            ref={conversationRowsRef}
          >
            {visibleConversations.map((conversation) => (
              <button
                className={`${styles.conversationRow} ${conversation.id === selectedId ? styles.activeConversation : ""}`}
                data-conversation-id={conversation.id}
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
              >
                <span className={styles.avatar}>{initials(conversation.contact.displayName)}</span>
                <span className={styles.conversationMain}>
                  <span className={styles.conversationTopLine}>
                    <strong className={styles.conversationName}>{conversation.contact.displayName}</strong>
                    <time className={styles.conversationTime}>{formatTime(conversation.lastMessageAt)}</time>
                  </span>
                  <span className={styles.conversationBottomLine}>
                    <small className={styles.conversationPreview}>
                      {conversation.lastMessage?.direction === "OUTBOUND" && (
                        <span className={styles.previewPrefix}>You: </span>
                      )}
                      {conversation.lastMessage?.preview || "No messages yet"}
                    </small>
                    {conversation.unreadCount > 0 && <b className={styles.unreadBadge}>{conversation.unreadCount}</b>}
                  </span>
                </span>
              </button>
            ))}
            {!visibleConversations.length && (
              <div className={styles.emptyList}>No WhatsApp conversations found yet.</div>
            )}
          </div>
        </aside>

        <section className={styles.chatPanel}>
          {selected ? (
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatIdentity}>
                  <span className={styles.avatarLarge}>{initials(selected.contact.displayName)}</span>
                  <div>
                    <h2>{selected.contact.displayName}</h2>
                    <p>{selected.contact.phone || selected.contact.waId}</p>
                  </div>
                </div>
                <div className={styles.chatControls}>
                  <select
                    value={selected.status}
                    onChange={(event) => void updateConversation({ status: event.target.value })}
                    disabled={saving}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    value={selected.aiMode}
                    onChange={(event) => void updateConversation({ aiMode: event.target.value })}
                    disabled={saving}
                  >
                    {aiModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    className={styles.detailToggle}
                    type="button"
                    aria-expanded={!detailPanelCollapsed}
                    onClick={() => setDetailPanelCollapsed((value) => !value)}
                  >
                    {detailPanelCollapsed ? "Show details" : "Hide details"}
                  </button>
                </div>
              </div>

              <div
                className={styles.messageStream}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                  messageShouldStickToBottomRef.current = distanceFromBottom < MESSAGE_STICKY_BOTTOM_DISTANCE;
                }}
                ref={messageStreamRef}
              >
                {conversationLoading && !inbox.messages.length && (
                  <div className={styles.emptyChat}>
                    <LoadingState label="Loading chat..." />
                  </div>
                )}
                {conversationLoading && inbox.messages.length > 0 && (
                  <div className={styles.chatLoadingPill}>
                    <LoadingState label="Updating chat..." />
                  </div>
                )}
                {inbox.messages.map((message, index) => {
                  if (shouldHideChatMessage(message)) return null;
                  const mediaGroupMessages = collectMediaMessageGroup(inbox.messages, index);
                  if (!mediaGroupMessages.length && isMediaGroupContinuation(inbox.messages, index)) return null;

                  const articleMessage = mediaGroupMessages.length
                    ? mediaGroupMessages[mediaGroupMessages.length - 1]
                    : message;
                  const attachments = mediaGroupMessages.length ? mediaGroupAttachments(mediaGroupMessages) : message.attachments || [];
                  const visualAttachments = visualMediaAttachments(attachments);
                  const nonVisualAttachments = attachments.filter((attachment) => (
                    !isImageAttachment(attachment) && !isVideoAttachment(attachment)
                  ));
                  const inbound = articleMessage.direction === "INBOUND";
                  const queuedAi = articleMessage.senderType === "AI" && articleMessage.status === "QUEUED";
                  const rawDisplayText = mediaGroupMessages.length ? "" : messageVisibleText(message);
                  const displayText = visualAttachments.length && isEmptyOrAutoMediaText(rawDisplayText) ? "" : rawDisplayText;
                  const isFallbackText = !message.body.trim() && !!displayText;
                  const reactions = (mediaGroupMessages.length
                    ? mediaGroupMessages.flatMap((groupMessage) => groupMessage.reactions || [])
                    : message.reactions || []
                  ).filter((reaction) => reaction.emoji.trim());
                  const mediaOnly = mediaGroupMessages.length ? true : isMediaOnlyMessage(message);
                  const groupedMedia = mediaGroupMessages.length > 1 || isGroupedMediaMessage(message, previousRenderableMessage(inbox.messages, index));
                  const messageKey = mediaGroupMessages.length
                    ? `media-group-${mediaGroupMessages.map(messageRenderKey).join("-")}`
                    : messageRenderKey(message);
                  const mediaPreviewTitle = inbound ? selected?.contact.displayName || "Customer" : "You";
                  const mediaPreviewSubtitle = formatTime(articleMessage.createdAt);
                  const openMediaCarousel = (carouselAttachments: MessageAttachment[], attachmentIndex: number) => {
                    setMediaCarousel({
                      attachments: carouselAttachments,
                      index: attachmentIndex,
                      subtitle: mediaPreviewSubtitle,
                      title: mediaPreviewTitle,
                    });
                  };
                  const shouldRenderMediaAlbum = visualAttachments.length > 1;
                  return (
                    <article
                      className={`${styles.messageBubble} ${inbound ? styles.inbound : styles.outbound} ${queuedAi ? styles.aiSuggestion : ""} ${reactions.length ? styles.messageBubbleWithReaction : ""} ${mediaOnly ? styles.mediaOnlyBubble : ""} ${groupedMedia ? styles.groupedMediaBubble : ""}`}
                      data-message-id={articleMessage.id}
                      key={messageKey}
                      onDoubleClick={() => {
                        if (articleMessage.id.startsWith("local-") || reactingMessageId === articleMessage.id) return;
                        void reactToMessage(articleMessage, "❤️");
                      }}
                      onMouseLeave={() => setReactionPickerMessageId((current) => (current === articleMessage.id ? "" : current))}
                      tabIndex={0}
                    >
                      <div className={styles.messageActions} onDoubleClick={(event) => event.stopPropagation()}>
                        <button
                          aria-label="Reply to message"
                          className={styles.messageActionButton}
                          title="Reply"
                          type="button"
                          onClick={() => setReplyTarget(articleMessage)}
                        >
                          ↩
                        </button>
                        <button
                          aria-label="React to message"
                          className={styles.messageActionButton}
                          disabled={articleMessage.id.startsWith("local-") || reactingMessageId === articleMessage.id}
                          onClick={() => setReactionPickerMessageId((current) => (current === articleMessage.id ? "" : articleMessage.id))}
                          title="React"
                          type="button"
                        >
                          😊
                        </button>
                        {reactionPickerMessageId === articleMessage.id && (
                          <div className={styles.reactionPicker} onDoubleClick={(event) => event.stopPropagation()}>
                            {QUICK_REACTION_EMOJIS.map((emoji) => (
                              <button
                                className={styles.reactionButton}
                                disabled={reactingMessageId === articleMessage.id}
                                key={emoji}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void reactToMessage(articleMessage, emoji);
                                }}
                                type="button"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {queuedAi && (
                        <div className={styles.messageTopline}>
                          <span>{messageLabel(articleMessage)}</span>
                        </div>
                      )}
                      {articleMessage.replyTo && (
                        <div className={styles.quotedMessage}>
                          <span>{articleMessage.replyTo.senderLabel}</span>
                          <strong>{articleMessage.replyTo.preview}</strong>
                        </div>
                      )}
                      {displayText && <p className={isFallbackText ? styles.messageFallback : undefined}>{displayText}</p>}
                      {!!attachments.length && (
                        <div
                          className={`${styles.attachmentList} ${mediaOnly ? styles.mediaOnlyAttachments : ""}`}
                          data-count={Math.min(attachments.length, 4)}
                        >
                          {shouldRenderMediaAlbum ? (
                            <MediaAlbumGrid
                              attachments={visualAttachments}
                              onOpen={(attachmentIndex) => openMediaCarousel(visualAttachments, attachmentIndex)}
                            />
                          ) : (
                            attachments.map((attachment) => {
                              const visualIndex = visualAttachments.findIndex((candidate) => candidate.id === attachment.id);
                              const isVisualAttachment = visualIndex >= 0;
                              return (
                                <div key={attachment.id}>
                                  <AttachmentPreview
                                    attachment={attachment}
                                    onOpen={isVisualAttachment
                                      ? () => openMediaCarousel(visualAttachments, visualIndex)
                                      : undefined}
                                  />
                                </div>
                              );
                            })
                          )}
                          {shouldRenderMediaAlbum && nonVisualAttachments.map((attachment) => (
                            <div key={attachment.id}>
                              <AttachmentPreview attachment={attachment} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={styles.messageFooter}>
                        {queuedAi && (
                          <button
                            onClick={() => void sendMessage(articleMessage.id, articleMessage.body)}
                            disabled={sending}
                          >
                            Send suggestion
                          </button>
                        )}
                        <time className={styles.messageTime}>{formatTime(articleMessage.createdAt)}</time>
                        <span className={styles.deliveryStatus}>{articleMessage.status.toLowerCase()}</span>
                        {articleMessage.failedReason && <span>{articleMessage.failedReason}</span>}
                      </div>
                      {!!reactions.length && (
                        <div className={styles.messageReactions} aria-label="Message reactions">
                          {reactions.slice(0, 3).map((reaction) => (
                            <span className={styles.messageReaction} key={reaction.id}>{reaction.emoji}</span>
                          ))}
                          {reactions.length > 3 && (
                            <span className={styles.messageReactionCount}>+{reactions.length - 3}</span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {!conversationLoading && !inbox.messages.length && <div className={styles.emptyChat}>No messages in this conversation yet.</div>}
              </div>

              <div className={styles.quickReplies}>
                {flowsLoading && <LoadingState label="Loading flow buttons..." />}
                {!flowsLoading && !activeFlows.length && (
                  <Link className={styles.flowSetupLink} href="/crm/flows">
                    Create flow buttons
                  </Link>
                )}
                {activeFlows.map((flow) => (
                  <button
                    disabled={sending || generatingAi || Boolean(runningFlowId)}
                    key={flow.id}
                    onClick={() => void runFlow(flow)}
                    type="button"
                  >
                    {runningFlowId === flow.id ? "Sending..." : flow.triggerButtonLabel || flow.name}
                  </button>
                ))}
              </div>

              <form
                className={styles.composer}
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                {replyTarget && (
                  <div className={styles.replyComposer}>
                    <div className={styles.replyComposerText}>
                      <span>{messageLabel(replyTarget)}</span>
                      <strong>{messageVisibleText(replyTarget).trim() || fallbackMessageText(replyTarget)}</strong>
                    </div>
                    <button
                      aria-label="Cancel reply"
                      className={styles.replyCancelButton}
                      onClick={() => setReplyTarget(null)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                )}
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (!sending && draft.trim()) {
                      void sendMessage();
                    }
                  }}
                  placeholder="Type a WhatsApp message..."
                  rows={2}
                />
                <button className={styles.primaryButton} disabled={sending || !draft.trim()}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          ) : (
            <div className={styles.noConversation}>
              <h2>No conversation selected</h2>
              <p>Incoming WhatsApp messages will appear here after Meta sends them to the webhook.</p>
            </div>
          )}
        </section>

        {!detailPanelCollapsed && (
          <aside className={styles.detailPanel}>
            {selected ? (
              selected.detailsLoaded ? (
                <>
                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Customer</p>
                    <div className={styles.profileHeader}>
                      <span className={styles.avatarLarge}>{initials(selected.contact.displayName)}</span>
                      <div>
                        <h3>{selected.contact.displayName}</h3>
                        <p>{selected.contact.phone || selected.contact.waId}</p>
                      </div>
                    </div>
                    <div className={styles.detailGrid}>
                      <span>Source</span>
                      <strong>{selected.contact.source || "WhatsApp"}</strong>
                      <span>Status</span>
                      <strong>{formatLabel(selected.status)}</strong>
                      <span>AI mode</span>
                      <strong>{formatLabel(selected.aiMode)}</strong>
                      <span>Last message</span>
                      <strong>{formatTime(selected.lastMessageAt)}</strong>
                    </div>
                  </section>

                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Conversation</p>
                    <div className={styles.summaryGrid}>
                      <span><strong>{selectedStats.inbound}</strong><small>Customer</small></span>
                      <span><strong>{selectedStats.outbound}</strong><small>Sent</small></span>
                      <span><strong>{selectedStats.aiSuggestions}</strong><small>AI drafts</small></span>
                    </div>
                    <div className={styles.actionStack}>
                      <button onClick={() => void updateConversation({ status: "WAITING_TEAM" })}>Needs reply</button>
                      <button onClick={() => void updateConversation({ status: "WAITING_CUSTOMER" })}>Waiting customer</button>
                      <button onClick={() => void updateConversation({ status: "RESOLVED" })}>Mark resolved</button>
                    </div>
                  </section>

                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Lead / order context</p>
                    {selected.leads?.length ? (
                      <div className={styles.contextRows}>
                        {selected.leads.map((lead) => (
                          <div key={lead.id} className={styles.contextRow}>
                            <strong>{lead.customerName || selected.contact.displayName}</strong>
                            <span>{formatLabel(lead.stage)} | {lead.requestedCharacter || "No character"} {lead.requestedVoice || ""}</span>
                            <small>{lead.paymentStatus.toLowerCase()} | {money(lead.paidAmount || lead.estimatedValue)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.muted}>No linked CRM lead yet.</p>
                    )}
                    <a className={styles.fullWidthButton} href="/manual-orders">Open manual orders</a>
                  </section>

                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>AI command log</p>
                    {selected.commands?.length ? (
                      <div className={styles.contextRows}>
                        {selected.commands.map((command) => (
                          <div key={command.id} className={styles.contextRow}>
                            <strong>{formatLabel(command.type)}</strong>
                            <span>{formatLabel(command.status)}</span>
                            <small>{command.error || formatDay(command.executedAt || command.createdAt)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.muted}>No AI commands logged for this chat.</p>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Customer</p>
                    <div className={styles.panelSkeleton}>
                      <span className={styles.skeletonAvatar} />
                      <span className={styles.skeletonLine} />
                      <span className={styles.skeletonLineShort} />
                      <p className={styles.muted}>
                        {detailPanelLoading ? (
                          <LoadingState label="Loading customer context..." />
                        ) : (
                          "Customer context will load after the chat opens."
                        )}
                      </p>
                    </div>
                  </section>
                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Conversation</p>
                    <div className={styles.summaryGrid}>
                      <span><strong>{selectedStats.inbound}</strong><small>Customer</small></span>
                      <span><strong>{selectedStats.outbound}</strong><small>Sent</small></span>
                      <span><strong>{selectedStats.aiSuggestions}</strong><small>AI drafts</small></span>
                    </div>
                  </section>
                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>Lead / order context</p>
                    <div className={styles.panelSkeleton}>
                      <span className={styles.skeletonLine} />
                      <span className={styles.skeletonLineShort} />
                    </div>
                  </section>
                  <section className={styles.detailCard}>
                    <p className={styles.eyebrow}>AI command log</p>
                    <div className={styles.panelSkeleton}>
                      <span className={styles.skeletonLine} />
                      <span className={styles.skeletonLineShort} />
                    </div>
                  </section>
                </>
              )
            ) : (
              <section className={styles.detailCard}>
                <p className={styles.eyebrow}>Customer</p>
                <p className={styles.muted}>Select a chat to see customer details, lead status, and AI command history.</p>
              </section>
            )}
          </aside>
        )}
      </section>
      )}

      {mediaCarousel && (
        <MediaCarousel
          attachments={mediaCarousel.attachments}
          index={mediaCarousel.index}
          onClose={() => setMediaCarousel(null)}
          onSelectIndex={(index) => setMediaCarousel((current) => {
            if (!current) return current;
            const nextIndex = Math.min(Math.max(index, 0), current.attachments.length - 1);
            return { ...current, index: nextIndex };
          })}
          subtitle={mediaCarousel.subtitle}
          title={mediaCarousel.title}
        />
      )}
    </main>
  );
}
