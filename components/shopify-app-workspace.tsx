"use client";
import { useLanguage } from "./dashboard-language";

import { FormEvent, useEffect, useState } from "react";

import styles from "./shopify-app-workspace.module.css";

// Keep the existing customer endpoint so every already-issued NFC link remains valid.
const customerSpaceUrl = "https://meaningfulplushies.com/apps/closer";
type Certificate = { certificateId: string; connectionId: string | null; createdAt: string };
type Connection = { id: string; firstCertificateId: string; secondCertificateId: string; firstName: string; secondName: string; hasPhoto: boolean; hasVoice: boolean; createdAt: string; updatedAt: string };

function secureLink(certificateId: string, accessKey: string) {
  return `${customerSpaceUrl}?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}`;
}

export function ShopifyAppWorkspace({ sessionToken }: { sessionToken: string }) {
  const { t } = useLanguage();
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
  const [loading, setLoading] = useState(true);

  async function request(method: "GET" | "POST", body?: Record<string, unknown>) {
    const response = await fetch("/api/closer/admin", { method, headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update Our Link.");
    return data;
  }

  async function load() {
    setLoading(true);
    try {
      const data = await request("GET");
      setCounts({ certificates: data.certificates.length, connections: data.connections.length, activity: data.activity.length });
      setCertificates(data.certificates);
      setConnections(data.connections);
      setPairNames(Object.fromEntries(data.connections.map((connection: Connection) => [connection.id, { firstName: connection.firstName, secondName: connection.secondName }])));
      setActivity(data.activity || []);
      const theme = data.theme || {};
      if (theme.heading) setHeading(theme.heading);
      if (theme.accent) setAccent(theme.accent);
      if (theme.background) setBackground(theme.background);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load().catch((error: Error) => setNotice(error.message)); }, []);
  async function createCertificate(event: FormEvent) { event.preventDefault(); setNotice(""); try { const data = await request("POST", { action: "create_certificate", certificateId }); const link = secureLink(data.certificate.certificateId, data.certificate.accessKey); setCreatedLink(link); setCertificateId(""); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create a link."); } }
  async function saveTheme() { try { await request("POST", { action: "save_theme", theme: { heading, accent, background } }); setNotice("Customer page styling saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save customer page styling."); } }
  async function unlink(certificateId: string) { if (!window.confirm("Unlink this pair and remove its shared media?")) return; try { await request("POST", { action: "unlink", certificateId }); await load(); setNotice("Pair unlinked."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not unlink pair."); } }
  async function rotateLink(id: string) { if (!window.confirm(`Replace the NFC link for certificate ${id}? The old link will stop working.`)) return; try { const data = await request("POST", { action: "rotate_certificate_link", certificateId: id }); const link = secureLink(data.certificate.certificateId, data.certificate.accessKey); setReplacementLinks((current) => ({ ...current, [id]: link })); setNotice("Replacement link created. Copy it before leaving this page."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not replace link."); } }
  async function openAdminPreview(id: string) { try { const data = await request("POST", { action: "create_admin_preview", certificateId: id }); const link = `${customerSpaceUrl}?certificate=${encodeURIComponent(data.certificateId)}&adminPreview=${encodeURIComponent(data.previewToken)}`; window.open(link, "_blank", "noopener,noreferrer"); setNotice("Customer-page preview opened. It expires in 15 minutes and does not affect the live link."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open preview."); } }
  async function copyLink(link: string) { try { await navigator.clipboard.writeText(link); setNotice("Secure link copied."); } catch { setNotice("Copy was blocked by the browser. Open the link, then copy it from the address bar."); } }
  async function removeCertificate(id: string) { if (!window.confirm(`Delete unused certificate ${id}? This cannot be undone.`)) return; try { await request("POST", { action: "delete_certificate", certificateId: id }); setReplacementLinks((current) => { const next = { ...current }; delete next[id]; return next; }); await load(); setNotice("Unused certificate deleted."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete certificate."); } }
  async function savePairNames(connection: Connection) { const names = pairNames[connection.id]; if (!names) return; try { await request("POST", { action: "rename_pair", connectionId: connection.id, ...names }); await load(); setNotice("Pair names saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save pair names."); } }
  async function clearMedia(connection: Connection, mediaType: "photo" | "voice") { if (!window.confirm(`Remove this pair's shared ${mediaType}?`)) return; try { await request("POST", { action: "clear_pair_media", connectionId: connection.id, mediaType }); await load(); setNotice(`Shared ${mediaType} removed.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove shared media."); } }

  return <section className={styles.workspace}>
    <header className={styles.hero}><div><p>{t("MEANINGFUL PLUSHIES")}</p><h2>{t("Our Link")}</h2><span>{t("Set up secure NFC links and manage each shared plushie space.")}</span></div><button type="button" className={styles.refresh} onClick={() => void load().catch((error: Error) => setNotice(error.message))} disabled={loading}>{loading ? t("Loading…") : t("Refresh")}</button></header>
    {notice && <div className={styles.notice} role="status">{t(notice)}<button type="button" onClick={() => setNotice("")} aria-label={t("Dismiss")}>×</button></div>}
    <section className={styles.createPanel}><div><p className={styles.eyebrow}>{t("START HERE")}</p><h3>{t("Create an NFC link")}</h3><span>{t("Create a certificate ID, then copy the secure link to write onto its NFC card.")}</span></div><form onSubmit={createCertificate}><label>{t("Certificate ID")}<input value={certificateId} onChange={(event) => setCertificateId(event.target.value)} placeholder={t("Example: 124")} required /></label><button>{t("Create secure link")}</button></form>{createdLink && <div className={styles.newLink}><strong>{t("New secure link ready")}</strong><a href={createdLink} target="_blank" rel="noreferrer">{t("Open customer page")}</a><button type="button" onClick={() => void copyLink(createdLink)}>{t("Copy link")}</button></div>}</section>
    <section className={styles.summaryGrid}><article><span>{t("Certificates")}</span><strong>{counts.certificates}</strong><small>{t("Issued NFC identities")}</small></article><article><span>{t("Active links")}</span><strong>{counts.connections}</strong><small>{t("Plushie pairs connected")}</small></article><article><span>{t("Recent activity")}</span><strong>{counts.activity}</strong><small>{t("Recorded events")}</small></article></section>
    <section className={styles.activitySection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t("ACTIVITY")}</p><h3>{t("Recent changes")}</h3><span>{t("See the latest updates to your secure customer links.")}</span></div></div>{activity.length ? <div className={styles.activityList}>{activity.slice(0, 5).map((item) => <article key={item.id}><strong>{item.action.replace(/_/g, " ")}</strong><span>{item.actorCertificateId} · {new Date(item.createdAt).toLocaleString()}</span></article>)}</div> : <p className={styles.empty}>{t("No recent activity yet.")}</p>}</section>
    <section className={styles.customerPage}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t("CUSTOMER PAGE")}</p><h3>{t("Appearance")}</h3><span>{t("Change the heading and colours shown in every linked customer space.")}</span></div></div><div className={styles.themeGrid}><div className={styles.themeForm}><label>{t("Heading")}<input value={heading} onChange={(event) => setHeading(event.target.value)} /></label><div className={styles.colours}><label>{t("Background")}<input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label><label>{t("Accent")}<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></label></div><button type="button" onClick={() => void saveTheme()}>{t("Save appearance")}</button></div><div className={styles.preview} style={{ background }}><div><p style={{ color: accent }}>{t("OUR LINK")}</p><h4>{heading}</h4><span>{t("Connect your plushies to share photos and voice notes across the distance.")}</span><button type="button" style={{ background: accent }}>{t("Open your space")}</button></div></div></div></section>
    <section className={styles.managementSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t("ACTIVE LINKS")}</p><h3>{t("Paired plushies")}</h3><span>{t("Rename a pair, clear shared media, or unlink it when needed.")}</span></div></div>{connections.length ? <div className={styles.pairList}>{connections.map((connection) => { const names = pairNames[connection.id] || connection; return <article key={connection.id} className={styles.pairCard}><div className={styles.pairHeader}><div><strong>{connection.firstName || t("Unnamed")} + {connection.secondName || t("Unnamed")}</strong><span>{connection.firstCertificateId} ↔ {connection.secondCertificateId}</span></div><span className={styles.mediaState}>{t("Photo") + " "}{connection.hasPhoto ? t("saved") : t("none")} {" " + t("· Voice") + " "}{connection.hasVoice ? t("saved") : t("none")}</span></div><div className={styles.nameGrid}><label>{t("First plushie")}<input value={names.firstName} onChange={(event) => setPairNames((current) => ({ ...current, [connection.id]: { ...names, firstName: event.target.value } }))} /></label><label>{t("Second plushie")}<input value={names.secondName} onChange={(event) => setPairNames((current) => ({ ...current, [connection.id]: { ...names, secondName: event.target.value } }))} /></label><button type="button" onClick={() => void savePairNames(connection)}>{t("Save names")}</button></div><div className={styles.actions}>{connection.hasPhoto && <button type="button" onClick={() => void clearMedia(connection, "photo")}>{t("Remove photo")}</button>}{connection.hasVoice && <button type="button" onClick={() => void clearMedia(connection, "voice")}>{t("Remove voice")}</button>}<button type="button" className={styles.danger} onClick={() => void unlink(connection.firstCertificateId)}>{t("Unlink pair")}</button></div></article>; })}</div> : <p className={styles.empty}>{t("No plushies are paired yet.")}</p>}</section>
    <section className={styles.managementSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t("NFC LINKS")}</p><h3>{t("Certificates")}</h3><span>{t("Open a safe preview, create a replacement link, or remove unused certificates.")}</span></div></div><div className={styles.certificateList}>{certificates.map((certificate) => { const link = replacementLinks[certificate.certificateId]; return <article key={certificate.certificateId}><div><strong>{certificate.certificateId}</strong><span>{certificate.connectionId ? t("Paired") : t("Unpaired")} {" " + t("· Created") + " "}{new Date(certificate.createdAt).toLocaleDateString()}</span></div><div className={styles.actions}><button type="button" onClick={() => void openAdminPreview(certificate.certificateId)}>{t("Preview")}</button><button type="button" onClick={() => void rotateLink(certificate.certificateId)}>{t("New link")}</button>{link && <><button type="button" onClick={() => void copyLink(link)}>{t("Copy link")}</button><a href={link} target="_blank" rel="noreferrer">{t("Open")}</a></>}{!certificate.connectionId && <button type="button" className={styles.danger} onClick={() => void removeCertificate(certificate.certificateId)}>{t("Delete")}</button>}</div></article>; })}</div></section>
  </section>;
}
