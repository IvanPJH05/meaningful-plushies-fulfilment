"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    url?: string;
    downloadUrl?: string;
  }[];
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

const CONVERSATION_CACHE_TTL_MS = 60_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 160;
const CRM_REALTIME_TOPIC = "crm-whatsapp-inbox";

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
    leads: [],
    commands: [],
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

function AttachmentPreview(props: {
  attachment: NonNullable<InboxMessage["attachments"]>[number];
}) {
  const { attachment } = props;
  const [previewFailed, setPreviewFailed] = useState(false);
  const label = attachment.originalName || attachment.contentType || "Attachment";
  const openUrl = attachment.downloadUrl || attachment.url || "#";

  if (attachment.url && isImageAttachment(attachment) && !previewFailed) {
    return (
      <a
        className={styles.imageAttachment}
        href={openUrl}
        rel="noreferrer"
        target="_blank"
        title="Open image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={label} loading="lazy" onError={() => setPreviewFailed(true)} src={attachment.url} />
        <span>{label}</span>
      </a>
    );
  }

  if (attachment.url && isVideoAttachment(attachment) && !previewFailed) {
    return (
      <div className={styles.mediaAttachment}>
        <video controls onError={() => setPreviewFailed(true)} preload="metadata" src={attachment.url} />
        <a href={openUrl} rel="noreferrer" target="_blank">{label}</a>
      </div>
    );
  }

  if (attachment.url && isAudioAttachment(attachment) && !previewFailed) {
    return (
      <div className={styles.audioAttachment}>
        <audio controls onError={() => setPreviewFailed(true)} preload="metadata" src={attachment.url} />
        <a href={openUrl} rel="noreferrer" target="_blank">{label}</a>
      </div>
    );
  }

  return (
    <a
      className={styles.fileAttachment}
      href={openUrl}
      rel="noreferrer"
      target="_blank"
    >
      {previewFailed ? `Open ${label}` : label}
    </a>
  );
}

export default function WhatsAppInboxClient() {
  const [inbox, setInbox] = useState<InboxPayload>({ conversations: [], selectedConversation: null, messages: [] });
  const [conversationCache, setConversationCache] = useState<ConversationCache>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef("");
  const conversationCacheRef = useRef<ConversationCache>({});
  const listRefreshTimerRef = useRef<number | null>(null);
  const conversationRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    conversationCacheRef.current = conversationCache;
  }, [conversationCache]);

  const rememberConversation = useCallback((selectedConversation: SelectedConversation, messages: InboxMessage[]) => {
    if (!selectedConversation) return;
    setConversationCache((current) => ({
      ...current,
      [selectedConversation.id]: {
        selectedConversation,
        messages,
        loadedAt: Date.now(),
      },
    }));
  }, []);

  const fetchConversation = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/crm/inbox?scope=conversation&conversationId=${encodeURIComponent(conversationId)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM conversation could not be loaded.");
    }
    return data.inbox as InboxPayload;
  }, []);

  const loadInbox = useCallback(async (conversationId?: string) => {
    setLoading(true);
    try {
      const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "?scope=list";
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

  const loadConversationList = useCallback(async () => {
    const response = await fetch("/api/crm/inbox?scope=list", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM chat list could not be loaded.");
    }
    setInbox((current) => ({
      ...current,
      conversations: data.inbox.conversations,
    }));
  }, []);

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
        selectedConversation: nextInbox.selectedConversation,
        messages: nextInbox.messages,
      }));
    } finally {
      if (showSpinner) setConversationLoading(false);
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
    loadInbox().catch((error) => {
      setNotice(error instanceof Error ? error.message : "CRM inbox could not be loaded.");
      setLoading(false);
    });
  }, [loadInbox]);

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
    };
  }, []);

  useEffect(() => {
    const element = messageStreamRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
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

  const inboxStats = useMemo(() => {
    return {
      all: inbox.conversations.length,
      unread: inbox.conversations.filter((item) => item.unreadCount > 0).length,
      waitingTeam: inbox.conversations.filter((item) => item.status === "WAITING_TEAM").length,
      waitingCustomer: inbox.conversations.filter((item) => item.status === "WAITING_CUSTOMER").length,
    };
  }, [inbox.conversations]);

  const selectedStats = useMemo(() => {
    return {
      inbound: inbox.messages.filter((message) => message.direction === "INBOUND").length,
      outbound: inbox.messages.filter((message) => message.direction === "OUTBOUND").length,
      aiSuggestions: inbox.messages.filter((message) => message.senderType === "AI" && message.status === "QUEUED").length,
    };
  }, [inbox.messages]);

  const quickReplies = useMemo(() => {
    const name = selected?.contact.displayName || "there";
    return [
      {
        label: "Ask details",
        body: `Hi ${name}, boleh share details plushie ya?\n\nName:\nGender:\nBirth date:\nBirth place:\nFavourite person:\nBelongs to:\nMeaningful note:`,
      },
      {
        label: "Payment received",
        body: `Hi ${name}, payment received. I will send your Shopify link here so you can fill in the plushie details.`,
      },
      {
        label: "Checking order",
        body: `Hi ${name}, I am checking this for you now. I will update you here once it is ready.`,
      },
      {
        label: "Thank you",
        body: `Thank you ${name}. We have received the details and will start processing your Meaningful Plushie.`,
      },
    ];
  }, [selected]);

  async function selectConversation(conversationId: string) {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setNotice("");
    const cached = conversationCacheRef.current[conversationId];
    if (cached) {
      setInbox((current) => ({
        ...current,
        selectedConversation: cached.selectedConversation,
        messages: cached.messages,
      }));
      if (Date.now() - cached.loadedAt < CONVERSATION_CACHE_TTL_MS) {
        return;
      }
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

  async function sendMessage(messageId?: string, bodyOverride?: string) {
    const body = (bodyOverride || draft).trim();
    if (!selectedId || !body) return;

    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, messageId, body }),
      });
      const data = await response.json();
      if (data.message) {
        if (!messageId) setDraft("");
        const nextInbox = await fetchConversation(selectedId);
        rememberConversation(nextInbox.selectedConversation, nextInbox.messages);
        setInbox((current) => ({
          ...current,
          selectedConversation: nextInbox.selectedConversation,
          messages: nextInbox.messages,
        }));
        void loadConversationList();
      }
      if (!response.ok || !data.ok) {
        setNotice(data.error || "WhatsApp message could not be sent.");
        return;
      }
      setNotice(data.message?.status === "QUEUED"
        ? "Message saved, but WhatsApp sending is not fully configured yet."
        : "Message sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp message could not be sent.");
    } finally {
      setSending(false);
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
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WhatsApp CRM</p>
          <h1>Inbox</h1>
          <span>Read and reply to WhatsApp messages from one clean chat screen.</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryButton}
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
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {notice && (
        <div className={styles.notice}>
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>x</button>
        </div>
      )}

      <section className={styles.whatsappWorkspace}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a className={styles.railActive} href="/crm/inbox">Inbox</a>
          <a href="/manual-orders">Manual orders</a>
          <a href="/crm">Setup</a>
        </aside>

        <aside className={styles.conversationList}>
          <div className={styles.listHeader}>
            <div>
              <h2>Chats</h2>
              <p>{visibleConversations.length} shown from {inbox.conversations.length}</p>
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

          <div className={styles.inboxStats}>
            <span>{inboxStats.all}<small>All</small></span>
            <span>{inboxStats.unread}<small>Unread</small></span>
            <span>{inboxStats.waitingTeam}<small>Need reply</small></span>
            <span>{inboxStats.waitingCustomer}<small>Waiting</small></span>
          </div>

          <div className={styles.conversationRows}>
            {visibleConversations.map((conversation) => (
              <button
                className={`${styles.conversationRow} ${conversation.id === selectedId ? styles.activeConversation : ""}`}
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
              >
                <span className={styles.avatar}>{initials(conversation.contact.displayName)}</span>
                <span className={styles.conversationMain}>
                  <strong>{conversation.contact.displayName}</strong>
                  <small>{conversation.lastMessage?.preview || "No messages yet"}</small>
                </span>
                <span className={styles.conversationMeta}>
                  <small>{formatTime(conversation.lastMessageAt)}</small>
                  {conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}
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
                </div>
              </div>

              <div className={styles.messageStream} ref={messageStreamRef}>
                {conversationLoading && !inbox.messages.length && (
                  <div className={styles.emptyChat}>Loading chat...</div>
                )}
                {inbox.messages.map((message) => {
                  const inbound = message.direction === "INBOUND";
                  const queuedAi = message.senderType === "AI" && message.status === "QUEUED";
                  return (
                    <article
                      className={`${styles.messageBubble} ${inbound ? styles.inbound : styles.outbound} ${queuedAi ? styles.aiSuggestion : ""}`}
                      key={message.id}
                    >
                      <div className={styles.messageTopline}>
                        <span>{messageLabel(message)}</span>
                        <time>{formatTime(message.createdAt)}</time>
                      </div>
                      {message.body && <p>{message.body}</p>}
                      {!!message.attachments?.length && (
                        <div className={styles.attachmentList}>
                          {message.attachments.map((attachment) => (
                            <AttachmentPreview attachment={attachment} key={attachment.id} />
                          ))}
                        </div>
                      )}
                      <div className={styles.messageFooter}>
                        <span>{message.status.toLowerCase()}</span>
                        {message.failedReason && <span>{message.failedReason}</span>}
                        {queuedAi && (
                          <button
                            onClick={() => void sendMessage(message.id, message.body)}
                            disabled={sending}
                          >
                            Send suggestion
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!conversationLoading && !inbox.messages.length && <div className={styles.emptyChat}>No messages in this conversation yet.</div>}
              </div>

              <div className={styles.quickReplies}>
                <button onClick={() => void generateAiReply()} disabled={generatingAi || sending}>
                  {generatingAi ? "Thinking..." : "AI reply"}
                </button>
                {quickReplies.map((reply) => (
                  <button key={reply.label} onClick={() => setDraft(reply.body)}>
                    {reply.label}
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
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
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

        <aside className={styles.detailPanel}>
          {selected ? (
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
            <section className={styles.detailCard}>
              <p className={styles.eyebrow}>Customer</p>
              <p className={styles.muted}>Select a chat to see customer details, lead status, and AI command history.</p>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
