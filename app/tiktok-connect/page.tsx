"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function TikTokConnect() {
  const [status, setStatus] = useState<{ connected?: boolean; shopName?: string; lastSyncAt?: string }>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function api(path: string, method = "GET", body?: object) {
    const session = JSON.parse(localStorage.getItem("meaningful-plushies-dashboard-session") || "null");
    if (!session?.token) throw new Error("Sign in to the fulfilment app as an administrator first.");
    const response = await fetch(path, { method, headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "TikTok connection request failed.");
    return result;
  }
  const refresh = useCallback(async () => { try { setStatus(await api("/api/tiktok/connection")); } catch (error) { setMessage((error as Error).message); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function run(connect: boolean) {
    setBusy(true); setMessage("");
    try {
      const result = await api(connect ? "/api/tiktok/connect" : "/api/tiktok/orders/recover", "POST", {});
      if (connect) window.location.assign(result.url);
      else { setMessage(`TikTok sync checked ${result.checked ?? 0} orders. ${result.more ? "More orders remain; run sync again." : "Up to date."}`); await refresh(); }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24 }}>
    <Link href="/">← Back to fulfilment</Link><h1>TikTok Shop connection</h1>
    <p>{status.connected ? `Connected to ${status.shopName}` : "Connect your Malaysia shop to import orders directly into fulfilment."}</p>
    <p>Orders and delivery details sync from TikTok. Staff-entered plushie details and uploaded voice files are kept.</p>
    <button disabled={busy} onClick={() => void run(true)}>{status.connected ? "Reconnect TikTok Shop" : "Connect TikTok Shop"}</button>{" "}
    {status.connected && <button disabled={busy} onClick={() => void run(false)}>Sync recent orders</button>}
    {status.lastSyncAt && <p>Last successful sync: {new Date(status.lastSyncAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>}
    {message && <p role="status">{message}</p>}
  </main>;
}
