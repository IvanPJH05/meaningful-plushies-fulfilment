"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";

import styles from "./whatsapp-ai-test.module.css";

type WhatsAppAssistantTraining = {
  enabled: boolean;
  requiresHumanReview: boolean;
  brandVoice: string;
  businessFacts: string;
  productGuide: string;
  replyRules: string;
  faq: string;
  exampleReplies: string;
};

type AiSettingsResponse = {
  ok?: boolean;
  training?: WhatsAppAssistantTraining;
  openAiConfigured?: boolean;
  model?: string;
  error?: string;
};

type TestMedia = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  dataUrl?: string;
  note: string;
};

type TestMessage = {
  id: string;
  role: "customer" | "assistant";
  body: string;
  media: TestMedia[];
  createdAt: string;
};

type TestChatResponse = {
  ok?: boolean;
  reply?: string;
  model?: string;
  error?: string;
};

const emptyTraining: WhatsAppAssistantTraining = {
  enabled: true,
  requiresHumanReview: true,
  brandVoice: "",
  businessFacts: "",
  productGuide: "",
  replyRules: "",
  faq: "",
  exampleReplies: "",
};

const maxAiImageBytes = 4_000_000;
const maxTrainingCharacters = 18_000;

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value = new Date()) {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function isImage(media: TestMedia) {
  return media.contentType.toLowerCase().startsWith("image/") && Boolean(media.dataUrl);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

function mediaLine(media: TestMedia) {
  const parts = [media.name, media.contentType || "media", formatSize(media.sizeBytes)].filter(Boolean);
  return parts.join(" | ");
}

function messageTrainingLine(message: TestMessage) {
  const name = message.role === "customer" ? "Customer" : "AI assistant";
  const mediaText = message.media.length
    ? `\n${message.media.map((media) => `  Media: ${mediaLine(media)}`).join("\n")}`
    : "";
  return `${name}: ${message.body || "sent media"}${mediaText}`;
}

function trimTrainingText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= maxTrainingCharacters) return trimmed;
  return trimmed.slice(trimmed.length - maxTrainingCharacters).trim();
}

export default function WhatsAppAiTestClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [training, setTraining] = useState<WhatsAppAssistantTraining>(emptyTraining);
  const [aiConnected, setAiConnected] = useState(false);
  const [aiModel, setAiModel] = useState("");
  const [customerName, setCustomerName] = useState("Test customer");
  const [customerPhone, setCustomerPhone] = useState("60123456789");
  const [draft, setDraft] = useState("");
  const [attachedMedia, setAttachedMedia] = useState<TestMedia[]>([]);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      try {
        const response = await fetch("/api/crm/ai/settings", { cache: "no-store" });
        const result = (await response.json()) as AiSettingsResponse;
        if (!response.ok || !result.ok || !result.training) {
          throw new Error(result.error || "AI settings could not be loaded.");
        }
        if (active) {
          setTraining(result.training);
          setAiConnected(Boolean(result.openAiConfigured));
          setAiModel(result.model || "");
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "AI settings could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function addFiles(files: FileList | File[]) {
    const nextMedia: TestMedia[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      const isReadableImage = file.type.startsWith("image/") && file.size <= maxAiImageBytes;
      const dataUrl = isReadableImage ? await fileToDataUrl(file) : undefined;
      nextMedia.push({
        id: makeId("media"),
        name: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        dataUrl,
        note: isReadableImage
          ? "Image included for the AI to inspect."
          : "The AI can see this file name and type, but not the full file contents yet.",
      });
    }

    setAttachedMedia((current) => [...current, ...nextMedia].slice(0, 4));
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  }

  function removeMedia(mediaId: string) {
    setAttachedMedia((current) => current.filter((media) => media.id !== mediaId));
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body && !attachedMedia.length) {
      setNotice("Type a customer message or attach an image first.");
      return;
    }

    const now = new Date().toISOString();
    const customerMessage: TestMessage = {
      id: makeId("customer"),
      role: "customer",
      body,
      media: attachedMedia,
      createdAt: now,
    };
    const nextMessages = [...messages, customerMessage];
    setMessages(nextMessages);
    setDraft("");
    setAttachedMedia([]);
    setSending(true);
    setNotice("");

    try {
      const response = await fetch("/api/crm/ai/test-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          latestMessage: body,
          media: customerMessage.media.map(({ name, contentType, sizeBytes, dataUrl, note }) => ({
            name,
            contentType,
            sizeBytes,
            dataUrl,
            note,
          })),
          messages: nextMessages.map((message) => ({
            role: message.role,
            body: message.body,
            media: message.media.map(({ name, contentType, sizeBytes, dataUrl, note }) => ({
              name,
              contentType,
              sizeBytes,
              dataUrl,
              note,
            })),
          })),
        }),
      });
      const result = (await response.json()) as TestChatResponse;
      if (!response.ok || !result.ok || !result.reply) {
        throw new Error(result.error || "AI could not reply.");
      }

      setAiModel(result.model || aiModel);
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          body: result.reply || "",
          media: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI could not reply.");
    } finally {
      setSending(false);
    }
  }

  async function saveTestToTraining() {
    if (!messages.length) {
      setNotice("Run a test chat first, then save it to training.");
      return;
    }

    setSaving(true);
    setNotice("");
    const trainingBlock = [
      `AI test chat saved ${formatDateTime()}`,
      `Customer name: ${customerName || "Test customer"}`,
      ...messages.map(messageTrainingLine),
    ].join("\n");

    const nextTraining = {
      ...training,
      exampleReplies: trimTrainingText([training.exampleReplies.trim(), trainingBlock].filter(Boolean).join("\n\n")),
    };

    try {
      const response = await fetch("/api/crm/ai/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextTraining),
      });
      const result = (await response.json()) as AiSettingsResponse;
      if (!response.ok || !result.ok || !result.training) {
        throw new Error(result.error || "Test chat could not be saved to training.");
      }
      setTraining(result.training);
      setAiConnected(Boolean(result.openAiConfigured));
      setAiModel(result.model || aiModel);
      setNotice("Saved. The inbox AI will use this test chat as an example.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Test chat could not be saved to training.");
    } finally {
      setSaving(false);
    }
  }

  function clearTest() {
    setMessages([]);
    setDraft("");
    setAttachedMedia([]);
    setNotice("");
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WhatsApp CRM</p>
          <h1>AI Test Chat</h1>
          <span>Talk to the assistant like a customer, attach media, then save useful tests into training.</span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/crm/setup">AI setup</Link>
          <Link href="/crm/inbox">Back to inbox</Link>
        </div>
      </section>

      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <Link href="/crm/inbox">Inbox</Link>
          <Link href="/manual-orders">Manual orders</Link>
          <Link href="/crm/flows">Flows</Link>
          <Link className={styles.railActive} href="/crm/test-ai">Test AI</Link>
          <Link href="/crm/setup">Setup</Link>
        </aside>

        <section className={styles.testWorkspace}>
          <section className={styles.chatPanel}>
            <div className={styles.chatHeader}>
              <div className={styles.avatar}>TC</div>
              <div>
                <h2>{customerName || "Test customer"}</h2>
                <span>{customerPhone || "No phone set"}</span>
              </div>
              <div className={styles.headerStatus}>
                <strong>{loading ? "Loading" : aiConnected ? "AI connected" : "OpenAI missing"}</strong>
                <span>{aiModel || "No model loaded"}</span>
              </div>
            </div>

            {notice && <div className={styles.notice}>{notice}</div>}

            <div className={styles.chatBody}>
              {!messages.length && (
                <div className={styles.emptyState}>
                  <h3>Start a test conversation</h3>
                  <p>Ask about price, payment, delivery, or upload a screenshot/image for the AI to respond to.</p>
                </div>
              )}

              {messages.map((message) => (
                <article
                  className={message.role === "customer" ? styles.customerBubble : styles.assistantBubble}
                  key={message.id}
                >
                  <div className={styles.bubbleMeta}>
                    <strong>{message.role === "customer" ? "Customer" : "AI assistant"}</strong>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                  {message.body && <p>{message.body}</p>}
                  {message.media.length > 0 && (
                    <div className={styles.messageMediaGrid}>
                      {message.media.map((media) => (
                        <div className={styles.messageMedia} key={media.id}>
                          {isImage(media) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={media.name} src={media.dataUrl} />
                          ) : (
                            <span>{media.contentType || "media"}</span>
                          )}
                          <small>{mediaLine(media)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}

              {sending && (
                <article className={styles.assistantBubble}>
                  <div className={styles.bubbleMeta}>
                    <strong>AI assistant</strong>
                    <span>thinking...</span>
                  </div>
                  <p>Drafting a reply...</p>
                </article>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className={styles.composer}>
              {attachedMedia.length > 0 && (
                <div className={styles.attachedMediaList}>
                  {attachedMedia.map((media) => (
                    <div className={styles.attachedMedia} key={media.id}>
                      {isImage(media) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={media.name} src={media.dataUrl} />
                      ) : (
                        <span>{media.contentType || "media"}</span>
                      )}
                      <div>
                        <strong>{media.name}</strong>
                        <small>{formatSize(media.sizeBytes)}</small>
                      </div>
                      <button onClick={() => removeMedia(media.id)} type="button">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={styles.dropZone}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  accept="image/*,audio/*,video/*,.pdf"
                  hidden
                  onChange={handleFileInput}
                  ref={fileInputRef}
                  type="file"
                  multiple
                />
                <button onClick={() => fileInputRef.current?.click()} type="button">
                  Add media
                </button>
                <span>Images are visible to the AI. Other files are saved as context by filename/type for now.</span>
              </div>

              <div className={styles.inputRow}>
                <textarea
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Type as the customer..."
                  rows={2}
                  value={draft}
                />
                <button className={styles.primaryButton} disabled={loading || sending} onClick={() => void sendMessage()}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </section>

          <aside className={styles.trainingPanel}>
            <div className={styles.card}>
              <p className={styles.eyebrow}>Test customer</p>
              <label>
                Name
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </label>
              <label>
                Phone
                <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              </label>
            </div>

            <div className={styles.card}>
              <p className={styles.eyebrow}>Learning</p>
              <h3>Save useful tests</h3>
              <p>
                When the AI gives a reply you like, save this chat. It gets added to the same training examples used by the inbox AI reply button.
              </p>
              <button className={styles.primaryButton} disabled={saving || !messages.length} onClick={() => void saveTestToTraining()}>
                {saving ? "Saving..." : "Save chat to training"}
              </button>
              <button className={styles.secondaryButton} onClick={clearTest} type="button">
                Clear test
              </button>
            </div>

            <div className={styles.card}>
              <p className={styles.eyebrow}>Media support</p>
              <h3>What the AI can see</h3>
              <p>
                Uploaded images are sent to the AI together with the customer message. Audio, video, and PDF files are listed by file name and type for now.
              </p>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
