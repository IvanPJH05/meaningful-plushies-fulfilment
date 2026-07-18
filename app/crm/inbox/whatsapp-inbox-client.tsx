"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

type SelectedConversation = {
  id: string;
  status: string;
  aiMode: string;
  unreadCount: number;
  lastMessageAt: string | null;
  contact: ConversationSummary["contact"];
} | null;

type InboxPayload = {
  conversations: ConversationSummary[];
  selectedConversation: SelectedConversation;
  messages: InboxMessage[];
};

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function messageLabel(message: InboxMessage) {
  if (message.senderType === "AI" && message.status === "QUEUED") return "AI suggestion";
  if (message.senderType === "AI") return "AI";
  if (message.senderType === "TEAM") return "Team";
  if (message.senderType === "SYSTEM") return "System";
  return "Customer";
}

export default function WhatsAppInboxClient() {
  const [inbox, setInbox] = useState<InboxPayload>({ conversations: [], selectedConversation: null, messages: [] });
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

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
  }, [loadInbox]);

  const visibleConversations = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return inbox.conversations;
    return inbox.conversations.filter((conversation) => {
      const haystack = normalizeSearch([
        conversation.contact.displayName,
        conversation.contact.phone,
        conversation.contact.waId,
        conversation.lastMessage?.preview,
      ].filter(Boolean).join(" "));
      return haystack.includes(query);
    });
  }, [inbox.conversations, search]);

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
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "WhatsApp message could not be sent.");
      }
      if (!messageId) setDraft("");
      await loadInbox(selectedId);
      setNotice(data.message?.status === "QUEUED"
        ? "Message saved, but WhatsApp sending is not fully configured yet."
        : "Message sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const selected = inbox.selectedConversation;

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WhatsApp CRM</p>
          <h1>Inbox</h1>
          <span>Read and reply to WhatsApp messages from the fulfilment CRM.</span>
        </div>
        <div className={styles.headerActions}>
          <a className={styles.secondaryButton} href="/crm">CRM setup</a>
          <button className={styles.primaryButton} onClick={() => loadInbox(selectedId)} disabled={loading}>
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

      <section className={styles.inboxShell}>
        <aside className={styles.conversationList}>
          <div className={styles.searchBox}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, or message..."
            />
          </div>
          <div className={styles.conversationCount}>
            {visibleConversations.length} conversations
          </div>
          <div className={styles.conversationRows}>
            {visibleConversations.map((conversation) => (
              <button
                className={`${styles.conversationRow} ${conversation.id === selectedId ? styles.activeConversation : ""}`}
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
              >
                <span className={styles.avatar}>{conversation.contact.displayName.slice(0, 1).toUpperCase()}</span>
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
                  <span className={styles.avatarLarge}>{selected.contact.displayName.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h2>{selected.contact.displayName}</h2>
                    <p>{selected.contact.phone || selected.contact.waId}</p>
                  </div>
                </div>
                <div className={styles.chatBadges}>
                  <span>{selected.status.replaceAll("_", " ")}</span>
                  <span>AI {selected.aiMode.replaceAll("_", " ")}</span>
                </div>
              </div>

              <div className={styles.messageStream}>
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
      </section>
    </main>
  );
}
