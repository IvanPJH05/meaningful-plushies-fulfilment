"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./page.module.css";

type WhatsAppConnectionStatus = {
  ok: boolean;
  phoneCheck?: {
    ok?: boolean;
    error?: string;
    data?: {
      display_phone_number?: string;
      verified_name?: string;
      code_verification_status?: string;
      quality_rating?: string;
      platform_type?: string;
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
  effectiveWabaId?: string | null;
};

function formatTime(value?: string | null) {
  if (!value) return "None yet";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLabel(value?: string | null) {
  if (!value) return "";
  return value.toLowerCase().replaceAll("_", " ");
}

export default function WhatsAppSetupStatus() {
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crm/whatsapp/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "WhatsApp setup status could not be loaded.");
      }
      setStatus(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp setup status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function repairWebhook() {
    setRepairing(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/whatsapp/repair-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "WhatsApp webhook subscription could not be repaired.");
      }
      setNotice(data.message || "WhatsApp webhook subscription repaired.");
      await loadStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WhatsApp webhook subscription could not be repaired.");
    } finally {
      setRepairing(false);
    }
  }

  const phone = status?.phoneCheck?.data;
  const webhookActivity = status?.webhookActivity;
  const parsedMessages = webhookActivity?.ok ? webhookActivity.parsedLast24h ?? 0 : 0;
  const liveTraffic = parsedMessages > 0;
  const verification = formatLabel(phone?.code_verification_status) || "checking";

  const health = useMemo(() => {
    if (!status) return { label: "Checking", className: styles.missingBadge };
    if (liveTraffic) return { label: "Receiving", className: styles.readyBadge };
    if (status.phoneCheck?.ok && status.subscribedAppsCheck?.ok) return { label: "Connected", className: styles.readyBadge };
    return { label: "Needs check", className: styles.missingBadge };
  }, [liveTraffic, status]);

  return (
    <div className={`${styles.panel} ${styles.fullWidthPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2>WhatsApp connection status</h2>
          <p>This is the setup and troubleshooting area that used to take space above the inbox.</p>
        </div>
        <div className={styles.setupActions}>
          <span className={health.className}>{loading ? "Checking" : health.label}</span>
          <button onClick={() => void loadStatus()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh status"}
          </button>
          <button onClick={() => void repairWebhook()} disabled={repairing}>
            {repairing ? "Repairing..." : "Repair webhook"}
          </button>
        </div>
      </div>

      {notice && <div className={styles.inlineNotice}>{notice}</div>}

      <div className={styles.liveStatusGrid}>
        <div className={styles.liveStatusCard}>
          <span>Connected number</span>
          <strong>{phone?.display_phone_number || "Not detected"}</strong>
          <small>{phone?.verified_name || "WhatsApp Cloud API"}{verification ? ` | ${verification}` : ""}</small>
        </div>
        <div className={styles.liveStatusCard}>
          <span>Webhooks in the last 24h</span>
          <strong>{webhookActivity?.ok ? `${webhookActivity.rawLast24h ?? 0} received` : "Unknown"}</strong>
          <small>{webhookActivity?.ok ? `${parsedMessages} messages parsed` : webhookActivity?.error || "Checking activity..."}</small>
        </div>
        <div className={styles.liveStatusCard}>
          <span>Latest webhook</span>
          <strong>{formatTime(webhookActivity?.latestRawReceivedAt)}</strong>
          <small>{status?.subscribedAppsCheck?.ok ? "Webhook app subscription found" : status?.subscribedAppsCheck?.error || "Checking subscription..."}</small>
        </div>
        <div className={styles.liveStatusCard}>
          <span>Business account</span>
          <strong>{status?.effectiveWabaId || "Not detected"}</strong>
          <small>{status?.phoneCheck?.ok ? "Phone lookup passed" : status?.phoneCheck?.error || "Checking Meta access..."}</small>
        </div>
      </div>
    </div>
  );
}
