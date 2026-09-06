"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "./shopify-app-workspace.module.css";

const closerStorefrontUrl = "https://meaningfulplushies.com/apps/closer";

export function ShopifyAppWorkspace({ sessionToken }: { sessionToken: string }) {
  const [accent, setAccent] = useState("#d76b83");
  const [background, setBackground] = useState("#e7eedf");
  const [heading, setHeading] = useState("Your shared space");
  const [certificateId, setCertificateId] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [counts, setCounts] = useState({ certificates: 0, connections: 0, activity: 0 });
  const [connections, setConnections] = useState<Array<{ id: string; firstCertificateId: string; secondCertificateId: string; firstName: string; secondName: string }>>([]);
  const [activity, setActivity] = useState<Array<{ id: string; action: string; actorCertificateId: string; createdAt: string }>>([]);
  const [notice, setNotice] = useState("");

  async function request(method: "GET" | "POST", body?: Record<string, unknown>) {
    const response = await fetch("/api/closer/admin", { method, headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update Closer.");
    return data;
  }
  async function load() { const data = await request("GET"); setCounts({ certificates: data.certificates.length, connections: data.connections.length, activity: data.activity.length }); setConnections(data.connections); setActivity(data.activity); const theme = data.theme || {}; if (theme.heading) setHeading(theme.heading); if (theme.accent) setAccent(theme.accent); if (theme.background) setBackground(theme.background); }
  useEffect(() => { void load().catch((error: Error) => setNotice(error.message)); }, []);
  async function createCertificate(event: FormEvent) { event.preventDefault(); setNotice(""); try { const data = await request("POST", { action: "create_certificate", certificateId }); const link = `${closerStorefrontUrl}?certificate=${encodeURIComponent(data.certificate.certificateId)}&key=${encodeURIComponent(data.certificate.accessKey)}`; setCreatedLink(link); setCertificateId(""); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create certificate."); } }
  async function saveTheme() { try { await request("POST", { action: "save_theme", theme: { heading, accent, background } }); setNotice("Theme saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save theme."); } }
  async function unlink(certificateId: string) { if (!window.confirm("Unlink this pair and remove its shared media?")) return; try { await request("POST", { action: "unlink", certificateId }); await load(); setNotice("Pair unlinked."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not unlink pair."); } }

  return <section className={styles.workspace}>
    <div className={styles.intro}><div><p>SHOPIFY APP</p><h2>Closer certificates</h2><span>Manage the paired NFC-plushie experience without touching fulfilment.</span></div><span className={styles.status}>In development</span></div>
    <div className={styles.grid}>
      <form className={styles.panel} onSubmit={(event) => event.preventDefault()}>
        <p className={styles.kicker}>THEME</p><h3>Customer-page preview</h3>
        <label>Heading<input value={heading} onChange={(event) => setHeading(event.target.value)} /></label>
        <div className={styles.colours}><label>Background<input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label><label>Accent<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></label></div>
        <button type="button" className={styles.save} onClick={() => void saveTheme()}>Save theme</button>
      </form>
      <div className={styles.preview} style={{ background }}><div className={styles.previewCard}><p style={{ color: accent }}>A LITTLE CLOSER, WHEREVER YOU ARE</p><h3>{heading}</h3><span>Connect your plushies to share photos and voice notes across the distance.</span><button style={{ background: accent }}>Open your space</button></div></div>
    </div>
    <div className={styles.cards}>
      <article><p>CERTIFICATES · {counts.certificates}</p><form onSubmit={createCertificate}><input value={certificateId} onChange={(event) => setCertificateId(event.target.value)} placeholder="New certificate ID" required /><button>Create secure NFC link</button></form>{createdLink && <a href={createdLink} target="_blank" rel="noreferrer">Open newly created test link</a>}</article>
      <article><p>ACTIVE PAIRS · {counts.connections}</p>{connections.length ? connections.map((connection) => <div key={connection.id}><strong>{connection.firstName} + {connection.secondName}</strong><span>{connection.firstCertificateId} ↔ {connection.secondCertificateId}</span><button onClick={() => void unlink(connection.firstCertificateId)}>Unlink pair</button></div>) : <span>No pairs yet.</span>}</article>
      <article><p>ACTIVITY · {counts.activity}</p>{activity.length ? activity.slice(0, 4).map((item) => <div key={item.id}><strong>{item.action.replaceAll("_", " ")}</strong><span>#{item.actorCertificateId} · {new Date(item.createdAt).toLocaleString()}</span></div>) : <span>No activity yet.</span>}</article>
    </div>
    {notice && <p className={styles.notice}>{notice}</p>}
  </section>;
}
