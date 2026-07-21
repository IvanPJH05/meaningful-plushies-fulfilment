"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import styles from "./whatsapp-ai-setup.module.css";

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

const fieldHelp = {
  brandVoice: "How the AI should sound when replying to customers.",
  businessFacts: "Things the AI should know about your business, order process, and common policy.",
  productGuide: "Characters, voice lengths, pricing notes, delivery notes, or anything product-related.",
  replyRules: "Hard rules. These are the lines the AI should not cross.",
  faq: "Common questions and your preferred answers.",
  exampleReplies: "Paste real replies you like. The AI will copy the style, not the exact text.",
};

type AiSettingsResponse = {
  ok?: boolean;
  training?: WhatsAppAssistantTraining;
  openAiConfigured?: boolean;
  model?: string;
  error?: string;
};

function fieldLabel(key: keyof typeof fieldHelp) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export default function WhatsAppAiSetupClient() {
  const [training, setTraining] = useState<WhatsAppAssistantTraining>(emptyTraining);
  const [aiConnected, setAiConnected] = useState(false);
  const [aiModel, setAiModel] = useState("");
  const [teachingText, setTeachingText] = useState("");
  const [teachingHistory, setTeachingHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
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
          throw new Error(result.error || "WhatsApp AI setup could not be loaded.");
        }
        if (active) {
          setTraining(result.training);
          setAiConnected(Boolean(result.openAiConfigured));
          setAiModel(result.model || "");
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "WhatsApp AI setup could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  function updateText(key: keyof WhatsAppAssistantTraining, value: string) {
    setTraining((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(
    nextTraining = training,
    successNotice = "AI training saved. The inbox AI reply button will use this now.",
  ) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/ai/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextTraining),
      });
      const result = (await response.json()) as AiSettingsResponse;
      if (!response.ok || !result.ok || !result.training) {
        throw new Error(result.error || "WhatsApp AI setup could not be saved.");
      }
      setTraining(result.training);
      setAiConnected(Boolean(result.openAiConfigured));
      setAiModel(result.model || "");
      setNotice(successNotice);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp AI setup could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function teachAi() {
    const text = teachingText.trim();
    if (!text) {
      setNotice("Type the exact thing you want the AI to remember first.");
      return;
    }
    const stamp = new Intl.DateTimeFormat("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    const nextTraining = {
      ...training,
      businessFacts: [
        training.businessFacts.trim(),
        `Ivan taught me (${stamp}): ${text}`,
      ].filter(Boolean).join("\n\n"),
    };
    setTraining(nextTraining);
    const saved = await saveSettings(nextTraining, "Saved. The AI will use this in future WhatsApp drafts.");
    if (saved) {
      setTeachingText("");
      setTeachingHistory((current) => [text, ...current].slice(0, 5));
    }
  }

  const trainingFields = [
    "brandVoice",
    "businessFacts",
    "productGuide",
    "replyRules",
    "faq",
    "exampleReplies",
  ] as const;

  return (
    <main className={styles.page}>
      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <Link href="/crm/inbox">Inbox</Link>
          <Link href="/manual-orders">Manual orders</Link>
          <Link href="/crm/flows">Flows</Link>
          <Link href="/crm/test-ai">Test AI</Link>
          <Link className={styles.railActive} href="/crm/setup">Setup</Link>
        </aside>

        <section className={styles.setupPanel}>
          <div className={styles.setupHeader}>
            <div>
              <p className={styles.eyebrow}>Assistant behaviour</p>
              <h2>Training controls</h2>
            </div>
            <span>{loading ? "Loading..." : training.enabled ? "AI suggestions on" : "AI suggestions off"}</span>
          </div>

          {notice && <div className={styles.notice}>{notice}</div>}

          <div className={styles.connectionGrid}>
            <div className={aiConnected ? styles.goodCard : styles.warningCard}>
              <span>OpenAI connection</span>
              <strong>{aiConnected ? "Connected" : "Not connected"}</strong>
              <small>{aiConnected ? "The inbox can generate AI draft replies." : "Add OPENAI_API_KEY in Vercel to turn on reply generation."}</small>
            </div>
            <div className={styles.infoCard}>
              <span>Model</span>
              <strong>{aiModel || "Not set"}</strong>
              <small>This is the model used when you press AI reply in the inbox.</small>
            </div>
            <div className={styles.infoCard}>
              <span>Mode</span>
              <strong>{training.requiresHumanReview ? "Suggest only" : "Can auto-send"}</strong>
              <small>For now, keeping human review on is the safer sales workflow.</small>
            </div>
          </div>

          <section className={styles.trainerCard}>
            <div>
              <p className={styles.eyebrow}>Teach the AI</p>
              <h3>Tell it the exact rule, answer, or product info</h3>
              <p>
                Type naturally here. I will save it into Business facts, and the AI will use it the next time it drafts WhatsApp replies.
              </p>
            </div>
            <textarea
              disabled={loading || saving}
              onChange={(event) => setTeachingText(event.target.value)}
              placeholder="Example: If customer is in West Malaysia, tell them shipping is usually RM8 unless there is a free shipping promo."
              rows={5}
              value={teachingText}
            />
            <div className={styles.trainerActions}>
              <button className={styles.primaryButton} disabled={loading || saving} onClick={() => void teachAi()}>
                {saving ? "Saving..." : "Teach AI"}
              </button>
              {teachingHistory.length > 0 && (
                <span>Last taught: {teachingHistory[0]}</span>
              )}
            </div>
          </section>

          <div className={styles.toggleGrid}>
            <label className={styles.toggleCard}>
              <input
                checked={training.enabled}
                onChange={(event) => setTraining((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Enable AI suggestions</strong>
                <small>When this is on, the inbox AI reply button can draft replies.</small>
              </span>
            </label>

            <label className={styles.toggleCard}>
              <input
                checked={training.requiresHumanReview}
                onChange={(event) => setTraining((current) => ({ ...current, requiresHumanReview: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Require human review</strong>
                <small>Recommended. AI drafts stay as suggestions until you send them.</small>
              </span>
            </label>
          </div>

          <div className={styles.formGrid}>
            {trainingFields.map((key) => (
              <label className={styles.textCard} key={key}>
                <span>{fieldLabel(key)}</span>
                <small>{fieldHelp[key]}</small>
                <textarea
                  disabled={loading || saving}
                  onChange={(event) => updateText(key, event.target.value)}
                  rows={key === "exampleReplies" ? 9 : 7}
                  value={training[key]}
                />
              </label>
            ))}
          </div>

          <div className={styles.saveBar}>
            <div>
              <strong>How this works</strong>
              <p>The AI reads this training plus the current WhatsApp conversation, then creates a draft reply in the inbox.</p>
            </div>
            <button className={styles.primaryButton} disabled={loading || saving} onClick={() => void saveSettings()}>
              {saving ? "Saving..." : "Save AI training"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
