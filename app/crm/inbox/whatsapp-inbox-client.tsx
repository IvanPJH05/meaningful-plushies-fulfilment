"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type WhatsAppConnectionStatus = {
  ok: boolean;
  phoneCheck?: {
    ok?: boolean;
    error?: string;
    data?: {
      display_phone_number?: string;
      verified_name?: string;
      platform_type?: string;
      code_verification_status?: string;
    };
  };
  subscribedAppsCheck?: {
    ok?: boolean;
    error?: string;
  };
  webhookActivity?: {
    ok?: boolean;
    rawLast24h?: number;
    parsedLast24h?: number;
    latestRawReceivedAt?: string | null;
    latestParsedReceivedAt?: string | null;
    error?: string;
  };
};

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

export default function WhatsAppInboxClient() {
  const [inbox, setInbox] = useState<InboxPayload>({ conversations: [], selectedConversation: null, messages: [] });
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repairingSubscription, setRepairingSubscription] = useState(false);
  const [notice, setNotice] = useState("");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

  const loadConnectionStatus = useCallback(async () => {
    const response = await fetch("/api/crm/whatsapp/status", { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.ok) {
      setConnectionStatus(data);
    }
  }, []);

  const loadInbox = useCallback(async (conversationId?: string) => {
    setLoading(true);
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    const response = await fetch(`/api/crm/inbox${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "CRM inbox could not be loaded.");
    }
    setInbox(data.inbox);
    const nextSelected = data.inbox.selectedConversation?.id || "";
    setSelectedId(nextSelected);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInbox().catch((error) => {
      setNotice(error instanceof Error ? error.message : "CRM inbox could not be loaded.");
      setLoading(false);
    });
    loadConnectionStatus().catch(() => undefined);
  }, [loadConnectionStatus, loadInbox]);

  useEffect(() => {
    const element = messageStreamRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [inbox.messages, selectedId]);

  const selected = inbox.selectedConversation;
  const connectedNumber = connectionStatus?.phoneCheck?.data?.display_phone_number || "Not detected";
  const connectedName = connectionStatus?.phoneCheck?.data?.verified_name || "WhatsApp Cloud API";
  const phoneVerificationStatus = connectionStatus?.phoneCheck?.data?.code_verification_status || "";
  const webhookActivity = connectionStatus?.webhookActivity;
  const onlyMetaTestConversation = inbox.conversations.length === 1
    && inbox.conversations[0]?.contact.waId === "16315551181"
    && inbox.conversations[0]?.lastMessage?.preview === "this is a text message";
  const noLiveWebhooks = webhookActivity?.ok && (webhookActivity.rawLast24h ?? 0) === 0;

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
    setSelectedId(conversationId);
    setNotice("");
    await loadInbox(conversationId);
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
        await loadInbox(selectedId);
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

  async function repairWebhookSubscription() {
    setRepairingSubscription(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/whatsapp/repair-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Meta webhook subscription could not be repaired.");
      }
      setNotice(data.message || "WhatsApp webhook subscription repaired. Send a new WhatsApp message, then refresh this inbox.");
      await loadConnectionStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Meta webhook subscription could not be repaired.");
    } finally {
      setRepairingSubscription(false);
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
        await loadInbox(selectedId);
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "AI reply could not be generated.");
      }
      setNotice("AI reply generated. Review it, then send the suggestion if it looks right.");
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
          <h1>WhatsApp Inbox</h1>
          <span>Manage customer chats, AI suggestions, and sales follow-up in one place.</span>
        </div>
        <div className={styles.headerActions}>
          <a className={styles.secondaryButton} href="/crm">CRM setup</a>
          <button
            className={styles.secondaryButton}
            onClick={() => void repairWebhookSubscription()}
            disabled={repairingSubscription}
          >
            {repairingSubscription ? "Repairing..." : "Repair webhook"}
          </button>
          <button
            className={styles.primaryButton}
            onClick={() => {
              void loadConnectionStatus();
              void loadInbox(selectedId);
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

      <section className={styles.connectionPanel}>
        <div>
          <span>Connected WhatsApp number</span>
          <strong>{connectedNumber}</strong>
          <small>{connectedName}{phoneVerificationStatus ? ` | ${formatLabel(phoneVerificationStatus)}` : ""}</small>
        </div>
        <div>
          <span>Meta webhooks in the last 24h</span>
          <strong>{webhookActivity?.ok ? `${webhookActivity.rawLast24h ?? 0} received` : "Unknown"}</strong>
          <small>{webhookActivity?.ok ? `${webhookActivity.parsedLast24h ?? 0} messages parsed` : webhookActivity?.error || "Checking connection..."}</small>
        </div>
        <div>
          <span>Latest webhook</span>
          <strong>{webhookActivity?.latestRawReceivedAt ? formatTime(webhookActivity.latestRawReceivedAt) : "None yet"}</strong>
          <small>{connectionStatus?.subscribedAppsCheck?.ok ? "Webhook app subscription found" : connectionStatus?.subscribedAppsCheck?.error || "Checking subscription..."}</small>
        </div>
      </section>

      {phoneVerificationStatus === "NOT_VERIFIED" && (
        <section className={styles.syncWarning}>
          <strong>Meta says this WhatsApp phone number is not verified yet.</strong>
          <span>
            The app can receive Meta&apos;s test payload, but real customer chats may not arrive until the connected number is verified and approved for WhatsApp Business Platform / Coexistence.
          </span>
        </section>
      )}

      {(onlyMetaTestConversation || noLiveWebhooks) && (
        <section className={styles.syncWarning}>
          <strong>No real WhatsApp webhooks have reached this inbox recently.</strong>
          <span>
            Real chats will appear here only after Meta sends webhooks for the connected number {connectedNumber}.
            Click Repair webhook, send a brand-new WhatsApp message to that number, then refresh. Existing WhatsApp Web history may not backfill until Coexistence history sync is approved again.
          </span>
        </section>
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
                void loadConnectionStatus();
                void loadInbox(selectedId);
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
                      <p>{message.body}</p>
                      {!!message.attachments?.length && (
                        <div className={styles.attachmentList}>
                          {message.attachments.map((attachment) => (
                            <span key={attachment.id}>{attachment.originalName || attachment.contentType}</span>
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
                {!inbox.messages.length && <div className={styles.emptyChat}>No messages in this conversation yet.</div>}
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
