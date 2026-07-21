"use client";

import { useEffect, useState } from "react";

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

function fieldLabel(key: keyof typeof fieldHelp) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export default function WhatsAppAiSetupClient() {
  const [training, setTraining] = useState<WhatsAppAssistantTraining>(emptyTraining);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      try {
        const response = await fetch("/api/crm/ai/settings", { cache: "no-store" });
        const result = (await response.json()) as {
          ok?: boolean;
          training?: WhatsAppAssistantTraining;
          error?: string;
        };
        if (!response.ok || !result.ok || !result.training) {
          throw new Error(result.error || "WhatsApp AI setup could not be loaded.");
        }
        if (active) setTraining(result.training);
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

  async function saveSettings() {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/ai/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(training),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        training?: WhatsAppAssistantTraining;
        error?: string;
      };
      if (!response.ok || !result.ok || !result.training) {
        throw new Error(result.error || "WhatsApp AI setup could not be saved.");
      }
      setTraining(result.training);
      setNotice("AI training saved. The inbox AI reply button will use this now.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp AI setup could not be saved.");
    } finally {
      setSaving(false);
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
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WhatsApp CRM</p>
          <h1>AI Assistant Setup</h1>
          <span>Train the assistant with your tone, product facts, rules, FAQs, and example replies.</span>
        </div>
        <div className={styles.headerActions}>
          <a href="/crm/inbox">Back to inbox</a>
        </div>
      </section>

      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a href="/crm/inbox">Inbox</a>
          <a href="/manual-orders">Manual orders</a>
          <a href="/crm/flows">Flows</a>
          <a className={styles.railActive} href="/crm/setup">Setup</a>
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
