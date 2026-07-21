"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    url?: string;
    downloadUrl?: string;
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

type FlowActionType = "Send Message" | "Send Image" | "AI Reply" | "Update Status" | "Add Note";
type FlowDelayUnit = "seconds" | "minutes" | "hours" | "days";

type WhatsAppFlowStep = {
  type: FlowActionType;
  delayValue: string;
  delayUnit: FlowDelayUnit;
  message: string;
  imageUrl?: string;
};

type WhatsAppFlow = {
  id: string;
  name: string;
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
const INBOX_TAB_CACHE_KEY = "meaningful-plushies.whatsapp-inbox.v2";
const mediaObjectUrlByKey = new Map<string, string>();
const mediaWarmPromiseByKey = new Map<string, Promise<void>>();
const videoMetadataWarmedByKey = new Set<string>();
let inboxMemorySnapshot: InboxTabCache | null = null;

type InboxTabCache = {
  version: 2;
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

function readInboxTabCache() {
  if (typeof window === "undefined") return inboxMemorySnapshot;
  const raw = window.sessionStorage.getItem(INBOX_TAB_CACHE_KEY);
  if (!raw) return inboxMemorySnapshot;
  try {
    const parsed = JSON.parse(raw) as Partial<InboxTabCache>;
    if (
      parsed.version !== 2
      || typeof parsed.savedAt !== "number"
      || !isInboxPayload(parsed.inbox)
    ) {
      window.sessionStorage.removeItem(INBOX_TAB_CACHE_KEY);
      return inboxMemorySnapshot;
    }

    const snapshot: InboxTabCache = {
      version: 2,
      savedAt: parsed.savedAt,
      inbox: parsed.inbox,
      conversationCache: parsed.conversationCache && typeof parsed.conversationCache === "object"
        ? parsed.conversationCache
        : {},
      selectedId: parsed.selectedId || parsed.inbox.selectedConversation?.id || "",
      search: parsed.search || "",
      filter: parsed.filter || "ALL",
    };
    inboxMemorySnapshot = snapshot;
    return snapshot;
  } catch {
    window.sessionStorage.removeItem(INBOX_TAB_CACHE_KEY);
    return inboxMemorySnapshot;
  }
}

function writeInboxTabCache(snapshot: InboxTabCache) {
  inboxMemorySnapshot = snapshot;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(INBOX_TAB_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep the full warm cache in memory even if this browser refuses a large sessionStorage write.
    // Moving around inside the app still stays instant; a hard browser refresh will cold-load again.
  }
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

function isAutoMediaCaption(value: string) {
  return /^(sent\s+a\s+)?(photo|image|picture|video)$/i.test(value.trim())
    || /^(image|video)\//i.test(value.trim());
}

function hasVisualAttachment(message: InboxMessage) {
  return Boolean(message.attachments?.some((attachment) => (
    isImageAttachment(attachment) || isVideoAttachment(attachment)
  )));
}

function messageVisibleText(message: InboxMessage) {
  const displayText = messageDisplayText(message);
  if (hasVisualAttachment(message) && isAutoMediaCaption(displayText)) return "";
  return displayText;
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
  return hasVisualAttachment(message) && !messageVisibleText(message).trim();
}

function isGroupedMediaMessage(message: InboxMessage, previousMessage?: InboxMessage) {
  if (!previousMessage || !isMediaOnlyMessage(message) || !isMediaOnlyMessage(previousMessage)) return false;
  if (message.direction !== previousMessage.direction || message.senderType !== previousMessage.senderType) return false;
  return messagesAreCloseEnough(message, previousMessage);
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

function optimisticImageAttachment(id: string, imageUrl: string): NonNullable<InboxMessage["attachments"]>[number] {
  return {
    id: `local-image-${id}`,
    originalName: "Flow image",
    contentType: "image/jpeg",
    sizeBytes: null,
    previewCacheKey: `flow-image:${imageUrl}`,
    url: imageUrl,
    downloadUrl: imageUrl,
  };
}

function isImageAttachment(attachment: NonNullable<InboxMessage["attachments"]>[number]) {
  return attachment.contentType.toLowerCase().startsWith("image/");
}

function isVideoAttachment(attachment: NonNullable<InboxMessage["attachments"]>[number]) {
  return attachment.contentType.toLowerCase().startsWith("video/");
}

function isAudioAttachment(attachment: NonNullable<InboxMessage["attachments"]>[number]) {
  return attachment.contentType.toLowerCase().startsWith("audio/");
}

function attachmentCacheKey(attachment: NonNullable<InboxMessage["attachments"]>[number]) {
  return attachment.previewCacheKey
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

async function createThumbnailObjectUrl(blob: Blob) {
  if (!blob.type.toLowerCase().startsWith("image/") || typeof createImageBitmap === "undefined") {
    return URL.createObjectURL(blob);
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const maxWidth = 420;
    const maxHeight = 320;
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return URL.createObjectURL(blob);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const thumbnail = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.78);
    });
    return URL.createObjectURL(thumbnail || blob);
  } catch {
    return URL.createObjectURL(blob);
  }
}

async function warmMediaAttachment(attachment: NonNullable<InboxMessage["attachments"]>[number]) {
  if (!attachment.url || (!isImageAttachment(attachment) && !isVideoAttachment(attachment))) return;
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
          video.src = attachment.url || "";
          video.load();
        });
        rememberVideoMetadataWarm(cacheKey);
        return;
      }
      const response = await fetch(attachment.url || "", { cache: "force-cache" });
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = await createThumbnailObjectUrl(blob);
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
    .filter((attachment) => attachment.url && (isImageAttachment(attachment) || isVideoAttachment(attachment)));

  for (let index = 0; index < attachments.length; index += 4) {
    await Promise.all(attachments.slice(index, index + 4).map(warmMediaAttachment));
  }
}

function LazyImageAttachment(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
  label: string;
  openUrl: string;
}) {
  const { attachment, label, openUrl } = props;
  const cacheKey = attachmentCacheKey(attachment);
  const sourceUrl = attachment.url || "";
  const cachedUrl = cacheKey ? mediaObjectUrlByKey.get(cacheKey) || "" : "";
  const [elementRef, nearViewport] = useNearViewport<HTMLAnchorElement>();
  const [previewUrl, setPreviewUrl] = useState(cachedUrl);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!sourceUrl || previewUrl || previewFailed || !nearViewport) return undefined;
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
        const objectUrl = await createThumbnailObjectUrl(blob);
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
  }, [cacheKey, nearViewport, previewFailed, previewUrl, sourceUrl]);

  return (
    <a
      className={styles.imageAttachment}
      href={openUrl}
      ref={elementRef}
      rel="noreferrer"
      target="_blank"
      title="Open image"
    >
      {previewUrl && !previewFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={label} decoding="async" loading="lazy" onError={() => setPreviewFailed(true)} src={previewUrl} />
      ) : (
        <span className={styles.imageSkeleton}>
          {previewFailed ? "Open photo" : "Loading photo..."}
        </span>
      )}
    </a>
  );
}

function DeferredMediaAttachment(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
  label: string;
  openUrl: string;
  type: "audio" | "video";
}) {
  const { attachment, label, openUrl, type } = props;
  const [elementRef, nearViewport] = useNearViewport<HTMLDivElement>();
  const [expanded, setExpanded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const shouldShowPreview = expanded || (type === "video" && nearViewport);

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
        <video controls onError={() => setPreviewFailed(true)} preload="metadata" src={attachment.url} />
        <a href={openUrl} rel="noreferrer" target="_blank">Open video</a>
      </div>
    );
  }

  return (
    <div className={styles.audioAttachment}>
      <audio controls onError={() => setPreviewFailed(true)} preload="none" src={attachment.url} />
      <a href={openUrl} rel="noreferrer" target="_blank">{label}</a>
    </div>
  );
}

function AttachmentPreview(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
}) {
  const { attachment } = props;
  const label = attachment.originalName || attachment.contentType || "Attachment";
  const openUrl = attachment.downloadUrl || attachment.url || "#";

  if (attachment.url && isImageAttachment(attachment)) {
    return <LazyImageAttachment attachment={attachment} label={label} openUrl={openUrl} />;
  }

  if (attachment.url && isVideoAttachment(attachment)) {
    return <DeferredMediaAttachment attachment={attachment} label={label} openUrl={openUrl} type="video" />;
  }

  if (attachment.url && isAudioAttachment(attachment)) {
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
  const [bootStatus, setBootStatus] = useState(() => initialCacheFullyWarmed ? "Restored every warmed chat saved in this tab." : "Connecting to WhatsApp CRM...");
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [detailPanelLoading, setDetailPanelLoading] = useState(false);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<InboxMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState("");
  const [reactingMessageId, setReactingMessageId] = useState("");
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
  const sendingRef = useRef(false);
  const listRefreshTimerRef = useRef<number | null>(null);
  const conversationRefreshTimerRef = useRef<number | null>(null);
  const detailLoadTimerRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const restoredFromCacheRef = useRef(initialCacheFullyWarmed);

  const restoreConversationRowsScroll = useCallback((scrollTop = conversationRowsScrollTopRef.current) => {
    window.requestAnimationFrame(() => {
      const element = conversationRowsRef.current;
      if (!element) return;
      element.scrollTop = Math.min(scrollTop, Math.max(0, element.scrollHeight - element.clientHeight));
    });
  }, []);

  useEffect(() => {
    conversationCacheRef.current = conversationCache;
  }, [conversationCache]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!inbox.conversations.length && !inbox.selectedConversation) return undefined;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      writeInboxTabCache({
        version: 2,
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
          version: 2,
          savedAt: Date.now(),
          inbox,
          conversationCache,
          selectedId,
          search,
          filter,
        });
      }
    };
  }, [conversationCache, filter, inbox, search, selectedId]);

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
    const scrollTop = conversationRowsRef.current?.scrollTop ?? conversationRowsScrollTopRef.current;
    const response = await fetch(`/api/crm/inbox?scope=list&limit=${listLimit}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM chat list could not be loaded.");
    }
    setInbox((current) => ({
      ...current,
      conversations: data.inbox.conversations,
    }));
    conversationRowsScrollTopRef.current = scrollTop;
    restoreConversationRowsScroll(scrollTop);
    return data.inbox as InboxPayload;
  }, [restoreConversationRowsScroll]);

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

  const scheduleListRefresh = useCallback((delay = REALTIME_REFRESH_DEBOUNCE_MS) => {
    if (listRefreshTimerRef.current !== null) {
      window.clearTimeout(listRefreshTimerRef.current);
    }
    listRefreshTimerRef.current = window.setTimeout(() => {
      listRefreshTimerRef.current = null;
      loadConversationList().catch(() => undefined);
    }, delay);
  }, [loadConversationList]);

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
        setBootStep(100, "Saved warmed chats restored from this browser tab.");
        setBackgroundLoading(true);
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
          const missingConversationIds = listInbox.conversations
            .map((conversation) => conversation.id)
            .filter((conversationId) => conversationId !== nextSelectedId && !conversationCacheRef.current[conversationId]);
          await preloadConversations(
            missingConversationIds,
          );
        } catch {
          if (active) setNotice("Saved chats are shown. Latest WhatsApp refresh could not finish yet.");
        } finally {
          if (active) setBackgroundLoading(false);
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
        setBackgroundLoading(true);
        await preloadConversations(
          listInbox.conversations
            .map((conversation) => conversation.id)
            .filter((conversationId) => conversationId !== firstConversation?.id),
          (completed, total) => {
            if (!total) {
              setBootStep(94, "Every chat is warmed.");
              return;
            }
            const progress = 60 + Math.round((completed / total) * 34);
            setBootStep(progress, `Warming chats ${completed} of ${total}...`);
          },
        );
        setBootStep(100, "WhatsApp inbox ready.");
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : "CRM inbox could not be loaded.");
        }
      } finally {
        if (active) {
          setBackgroundLoading(false);
          setBooting(false);
          setLoading(false);
        }
      }
    }

    void bootInbox();

    return () => {
      active = false;
    };
  }, [loadConversation, loadConversationList, preloadConversations]);

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
        scheduleListRefresh();
        if (payload.table !== "crm_contacts") {
          const changedConversationId = payload.conversationId
            || (payload.table === "crm_conversations" ? payload.id : null);
          scheduleConversationRefresh(changedConversationId);
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
  }, [scheduleConversationRefresh, scheduleListRefresh]);

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

  const selectedStats = useMemo(() => {
    return {
      inbound: inbox.messages.filter((message) => message.direction === "INBOUND").length,
      outbound: inbox.messages.filter((message) => message.direction === "OUTBOUND").length,
      aiSuggestions: inbox.messages.filter((message) => message.senderType === "AI" && message.status === "QUEUED").length,
    };
  }, [inbox.messages]);

  const activeFlows = useMemo(() => (
    flows.filter((flow) => flow.status === "Active" && flow.steps.length > 0)
  ), [flows]);

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

  async function sendMessage(messageId?: string, bodyOverride?: string, media?: { type: "image"; url: string }) {
    const body = (bodyOverride !== undefined ? bodyOverride : draft).trim();
    const mediaUrl = media?.url.trim() || "";
    const sendingImage = media?.type === "image" && Boolean(mediaUrl);
    if (!selectedId || (!body && !sendingImage)) return;
    if (sendingRef.current) return;

    const conversationId = selectedId;
    const activeReplyTarget = bodyOverride === undefined && !messageId ? replyTarget : null;
    const optimisticReplyTo = activeReplyTarget ? messageReplyPreview(activeReplyTarget) : null;
    const optimisticId = messageId ? "" : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    messageShouldStickToBottomRef.current = true;
    if (optimisticId) {
      const optimisticAttachments = sendingImage ? [optimisticImageAttachment(optimisticId, mediaUrl)] : [];
      patchConversationMessages(conversationId, (messages) => [
        ...messages,
        optimisticOutboundMessage(optimisticId, body || "Photo", sendingImage ? "IMAGE" : "TEXT", optimisticAttachments, optimisticReplyTo),
      ]);
      if (bodyOverride === undefined && !sendingImage) {
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
          ...(sendingImage ? { mediaType: "image", mediaUrl } : {}),
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

        if (step.type === "Send Image") {
          const caption = personalizeFlowText(step.message, selected);
          if (step.imageUrl) {
            await sendMessage(undefined, caption, { type: "image", url: step.imageUrl });
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
      setInbox(data.inbox);
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
              The full chat list loads first. Then every chat is warmed so clicking around feels instant.
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
                  <div className={styles.emptyChat}>Loading chat...</div>
                )}
                {inbox.messages.map((message, index) => {
                  const inbound = message.direction === "INBOUND";
                  const queuedAi = message.senderType === "AI" && message.status === "QUEUED";
                  const displayText = messageVisibleText(message);
                  const isFallbackText = !message.body.trim() && !!displayText;
                  const reactions = (message.reactions || []).filter((reaction) => reaction.emoji.trim());
                  const mediaOnly = isMediaOnlyMessage(message);
                  const groupedMedia = isGroupedMediaMessage(message, inbox.messages[index - 1]);
                  return (
                    <article
                      className={`${styles.messageBubble} ${inbound ? styles.inbound : styles.outbound} ${queuedAi ? styles.aiSuggestion : ""} ${reactions.length ? styles.messageBubbleWithReaction : ""} ${mediaOnly ? styles.mediaOnlyBubble : ""} ${groupedMedia ? styles.groupedMediaBubble : ""}`}
                      data-message-id={message.id}
                      key={messageRenderKey(message)}
                      onMouseLeave={() => setReactionPickerMessageId((current) => (current === message.id ? "" : current))}
                      tabIndex={0}
                    >
                      <div className={styles.messageActions}>
                        <button type="button" onClick={() => setReplyTarget(message)}>Reply</button>
                        <button
                          disabled={message.id.startsWith("local-") || reactingMessageId === message.id}
                          onClick={() => setReactionPickerMessageId((current) => (current === message.id ? "" : message.id))}
                          type="button"
                        >
                          React
                        </button>
                        {reactionPickerMessageId === message.id && (
                          <div className={styles.reactionPicker}>
                            {QUICK_REACTION_EMOJIS.map((emoji) => (
                              <button
                                className={styles.reactionButton}
                                disabled={reactingMessageId === message.id}
                                key={emoji}
                                onClick={() => void reactToMessage(message, emoji)}
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
                          <span>{messageLabel(message)}</span>
                        </div>
                      )}
                      {message.replyTo && (
                        <div className={styles.quotedMessage}>
                          <span>{message.replyTo.senderLabel}</span>
                          <strong>{message.replyTo.preview}</strong>
                        </div>
                      )}
                      {displayText && <p className={isFallbackText ? styles.messageFallback : undefined}>{displayText}</p>}
                      {!!message.attachments?.length && (
                        <div className={`${styles.attachmentList} ${mediaOnly ? styles.mediaOnlyAttachments : ""}`}>
                          {message.attachments.map((attachment) => (
                            <AttachmentPreview attachment={attachment} key={attachment.id} />
                          ))}
                        </div>
                      )}
                      <div className={styles.messageFooter}>
                        {queuedAi && (
                          <button
                            onClick={() => void sendMessage(message.id, message.body)}
                            disabled={sending}
                          >
                            Send suggestion
                          </button>
                        )}
                        <time className={styles.messageTime}>{formatTime(message.createdAt)}</time>
                        <span className={styles.deliveryStatus}>{message.status.toLowerCase()}</span>
                        {message.failedReason && <span>{message.failedReason}</span>}
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
                {flowsLoading && <span className={styles.flowHint}>Loading flows...</span>}
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
                    {runningFlowId === flow.id ? "Sending..." : flow.name}
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
                      <span>Replying to {messageLabel(replyTarget)}</span>
                      <strong>{messageVisibleText(replyTarget).trim() || fallbackMessageText(replyTarget)}</strong>
                    </div>
                    <button
                      aria-label="Cancel reply"
                      className={styles.replyCancelButton}
                      onClick={() => setReplyTarget(null)}
                      type="button"
                    >
                      x
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
                        {detailPanelLoading ? "Loading customer context..." : "Customer context will load after the chat opens."}
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
    </main>
  );
}
