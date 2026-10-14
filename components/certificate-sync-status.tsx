"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "./dashboard-language";

const messages: Record<string, string> = {
  synced: "Birth certificate synced", pending: "Birth certificate update queued",
  retrying: "Birth certificate update needs attention; retrying automatically",
  unlinked: "No birth certificate linked", not_checked: "Certificate will sync after you edit its details",
};
export default function CertificateSyncStatus({ orderId, updatedAt, token }: { orderId: string; updatedAt: string; token: string }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(`/api/fulfilment/certificates/status?orderId=${encodeURIComponent(orderId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not check certificate sync.");
        const result = await response.json();
        if (controller.signal.aborted) return;
        setStatus(result.status); setError(result.error || "");
        if (["pending", "retrying"].includes(result.status)) timer = setTimeout(check, 10_000);
      } catch {
        if (!controller.signal.aborted) { setStatus(""); setError("Could not check certificate sync."); }
      }
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [orderId, updatedAt, token]);
  return <div aria-live="polite"><p>{t(messages[status] || "Checking certificate sync...")}</p>{error && <small>{t(error)}</small>}</div>;
}
