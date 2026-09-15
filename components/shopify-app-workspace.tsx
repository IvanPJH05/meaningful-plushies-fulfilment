"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "./shopify-app-workspace.module.css";

const closerStorefrontUrl = "https://meaningfulplushies.com/apps/closer";
type Certificate = { certificateId: string; connectionId: string | null; createdAt: string };
type Connection = { id: string; firstCertificateId: string; secondCertificateId: string; firstName: string; secondName: string; hasPhoto: boolean; hasVoice: boolean; createdAt: string; updatedAt: string };

function closerLink(certificateId: string, accessKey: string) {
  return `${closerStorefrontUrl}?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}`;
}

export function ShopifyAppWorkspace({ sessionToken }: { sessionToken: string }) {
  const [accent, setAccent] = useState("#d76b83");
  const [background, setBackground] = useState("#e7eedf");
  const [heading, setHeading] = useState("Your shared space");
  const [certificateId, setCertificateId] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [counts, setCounts] = useState({ certificates: 0, connections: 0, activity: 0 });
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, string>>({});
  const [pairNames, setPairNames] = useState<Record<string, { firstName: string; secondName: string }>>({});
  const [activity, setActivity] = useState<Array<{ id: string; action: string; actorCertificateId: string; createdAt: string }>>([]);
  const [notice, setNotice] = useState("");

  async function request(method: "GET" | "POST", body?: Record<string, unknown>) {
    const response = await fetch("/api/closer/admin", { method, headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update Closer.");
    return data;
  }
  async function load() { const data = await request("GET"); setCounts({ certificates: data.certificates.length, connections: data.connections.length, activity: data.activity.length }); setCertificates(data.certificates); setConnections(data.connections); setPairNames(Object.fromEntries(data.connections.map((connection: Connection) => [connection.id, { firstName: connection.firstName, secondName: connection.secondName }]))); setActivity(data.activity); const theme = data.theme || {}; if (theme.heading) setHeading(theme.heading); if (theme.accent) setAccent(theme.accent); if (theme.background) setBackground(theme.background); }
  useEffect(() => { void load().catch((error: Error) => setNotice(error.message)); }, []);
  async function createCertificate(event: FormEvent) { event.preventDefault(); setNotice(""); try { const data = await request("POST", { action: "create_certificate", certificateId }); const link = closerLink(data.certificate.certificateId, data.certificate.accessKey); setCreatedLink(link); setCertificateId(""); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create certificate."); } }
  async function saveTheme() { try { await request("POST", { action: "save_theme", theme: { heading, accent, background } }); setNotice("Theme saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save theme."); } }
  async function unlink(certificateId: string) { if (!window.confirm("Unlink this pair and remove its shared media?")) return; try { await request("POST", { action: "unlink", certificateId }); await load(); setNotice("Pair unlinked."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not unlink pair."); } }
  async function rotateLink(id: string) { if (!window.confirm(`Replace the NFC link for certificate ${id}? The old link will stop working.`)) return; try { const data = await request("POST", { action: "rotate_certificate_link", certificateId: id }); const link = closerLink(data.certificate.certificateId, data.certificate.accessKey); setReplacementLinks((current) => ({ ...current, [id]: link })); setNotice(`New secure link created for ${id}. Copy it before leaving this page.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not replace the link."); } }
  async function copyLink(link: string) { try { await navigator.clipboard.writeText(link); setNotice("Secure NFC link copied."); } catch { setNotice("Copy was blocked by the browser. Open the link, then copy it from the address bar."); } }
  async function removeCertificate(id: string) { if (!window.confirm(`Delete unused certificate ${id}? This cannot be undone.`)) return; try { await request("POST", { action: "delete_certificate", certificateId: id }); setReplacementLinks((current) => { const next = { ...current }; delete next[id]; return next; }); await load(); setNotice("Unused certificate deleted."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete the certificate."); } }
  async function savePairNames(connection: Connection) { const names = pairNames[connection.id]; if (!names) return; try { await request("POST", { action: "rename_pair", connectionId: connection.id, ...names }); await load(); setNotice("Pair names saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the pair names."); } }
  async function clearMedia(connection: Connection, mediaType: "photo" | "voice") { if (!window.confirm(`Remove this pair's shared ${mediaType}?`)) return; try { await request("POST", { action: "clear_pair_media", connectionId: connection.id, mediaType }); await load(); setNotice(`Shared ${mediaType} removed.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove the shared media."); } }

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
      <article><p>CERTIFICATES · {counts.certificates}</p><form onSubmit={createCertificate}><input value={certificateId} onChange={(event) => setCertificateId(event.target.value)} placeholder="New certificate ID" required /><button>Create secure NFC link</button></form>{createdLink && <div className={styles.linkActions}><a href={createdLink} target="_blank" rel="noreferrer">Open newly created link</a><button type="button" onClick={() => void copyLink(createdLink)}>Copy link</button></div>}</article>
      <article><p>ACTIVE PAIRS · {counts.connections}</p><span>{counts.connections ? "Use the control panel below to manage each pair." : "No pairs yet."}</span></article>
      <article><p>ACTIVITY · {counts.activity}</p>{activity.length ? activity.slice(0, 4).map((item) => <div key={item.id}><strong>{item.action.replaceAll("_", " ")}</strong><span>#{item.actorCertificateId} · {new Date(item.createdAt).toLocaleString()}</span></div>) : <span>No activity yet.</span>}</article>
    </div>
    <section className={styles.controlPanel}><div className={styles.controlHeading}><div><p className={styles.kicker}>ACTIVE PAIR CONTROLS</p><h3>Manage every paired Closer space</h3><span>Rename each side, create replacement NFC links, clear media, or unlink the pair.</span></div></div>{connections.length ? <div className={styles.pairList}>{connections.map((connection) => { const names = pairNames[connection.id] || connection; return <article key={connection.id} className={styles.pairCard}><div className={styles.pairCardHeader}><strong>{connection.firstName} + {connection.secondName}</strong><span>{connection.firstCertificateId} ↔ {connection.secondCertificateId}</span></div><div className={styles.nameGrid}><label>First plushie name<input value={names.firstName} onChange={(event) => setPairNames((current) => ({ ...current, [connection.id]: { ...names, firstName: event.target.value } }))} /></label><label>Second plushie name<input value={names.secondName} onChange={(event) => setPairNames((current) => ({ ...current, [connection.id]: { ...names, secondName: event.target.value } }))} /></label><button type="button" onClick={() => void savePairNames(connection)}>Save names</button></div><div className={styles.pairControls}><span>Photo: {connection.hasPhoto ? "saved" : "none"} · Voice: {connection.hasVoice ? "saved" : "none"}</span>{connection.hasPhoto && <button type="button" onClick={() => void clearMedia(connection, "photo")}>Remove photo</button>}{connection.hasVoice && <button type="button" onClick={() => void clearMedia(connection, "voice")}>Remove voice</button>}<button type="button" className={styles.danger} onClick={() => void unlink(connection.firstCertificateId)}>Unlink pair</button></div></article>; })}</div> : <p className={styles.empty}>No active pairs yet.</p>}</section>
    <section className={styles.controlPanel}><div className={styles.controlHeading}><div><p className={styles.kicker}>CERTIFICATE & NFC LINK CONTROLS</p><h3>Manage every Closer certificate</h3><span>For security, existing secret keys cannot be shown again. Generate a replacement link whenever you need to resend one.</span></div></div><div className={styles.certificateList}>{certificates.map((certificate) => { const link = replacementLinks[certificate.certificateId]; return <article key={certificate.certificateId}><div><strong>{certificate.certificateId}</strong><span>{certificate.connectionId ? "Active pair" : "Unpaired"} · Created {new Date(certificate.createdAt).toLocaleDateString()}</span></div><div className={styles.certificateActions}><button type="button" onClick={() => void rotateLink(certificate.certificateId)}>Generate replacement link</button>{link && <><button type="button" onClick={() => void copyLink(link)}>Copy new link</button><a href={link} target="_blank" rel="noreferrer">Open</a></>}{!certificate.connectionId && <button type="button" className={styles.danger} onClick={() => void removeCertificate(certificate.certificateId)}>Delete</button>}</div></article>; })}</div></section>
    {notice && <p className={styles.notice}>{notice}</p>}
  </section>;
}
