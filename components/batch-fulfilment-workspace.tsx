"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./dashboard-language";
import { batchStages, batchNeedsAudio, batchNeedsLabel, matchBatchLabel, type BatchDetail, type FulfilmentBatch } from "../lib/fulfilment-batches";
import { buildAudioZip } from "../lib/batch-zip-client";
import { voiceBackupFileName } from "../lib/voice-file-name";
import type { Order } from "../lib/types";

const labels = ["Upload shipping labels", "Packing slips + shipping labels", "Generate envelopes", "Download audio ZIP", "Write NFC cards", "Batch complete"];
async function batchRequest(token: string, id?: string, mutation?: object): Promise<BatchDetail & { batches: FulfilmentBatch[] }> {
  const response = await fetch(`/api/fulfilment/batches${id && !mutation ? `?id=${encodeURIComponent(id)}` : ""}`, { method: mutation ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(mutation ? { "Content-Type": "application/json" } : {}) }, body: mutation ? JSON.stringify(mutation) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error === "BATCH_CHANGED" ? "Another staff member changed this batch. Refresh and try again." : data.error || "Could not load batches.");
  return data;
}

export function BatchAssignment({ token, orderIds, onClose, onAssigned }: { token: string; orderIds: string[]; onClose: () => void; onAssigned: (id: string) => void }) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<FulfilmentBatch[]>([]), [choice, setChoice] = useState("new"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const newId = useRef(crypto.randomUUID());
  useEffect(() => { let active = true; batchRequest(token).then(result => { if (active) setBatches(result.batches.filter(batch => batch.stage === "labels")); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [token]);
  async function assign() {
    setBusy(true); setError("");
    try {
      const existing = batches.find(batch => batch.id === choice);
      const result = await batchRequest(token, undefined, { action: existing ? "add" : "create", batchId: existing?.id ?? newId.current, version: existing?.version ?? 1, payload: { orderIds } });
      onAssigned(result.batch.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the batch."); } finally { setBusy(false); }
  }
  return <div className="batch-dialog-overlay"><section className="card batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title"><h2 id="batch-dialog-title">{t("Move to Batch Fulfilment")}</h2><p>{orderIds.length} {t("orders selected")}. {t("New orders will move to Uploading Audio.")}</p><label>{t("Choose batch")}<select value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}><option value="new">{t("Create a new batch")}</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{t("Batch")} {batch.number} · {batch.orderCount} {t("orders")}</option>)}</select></label>{error && <p role="alert">{t(error)}</p>}<div className="batch-buttons"><button className="button secondary" disabled={busy} onClick={onClose}>{t("Cancel")}</button><button className="button primary" disabled={busy} onClick={() => void assign()}>{t(busy ? "Saving..." : "Move to batch")}</button></div></section></div>;
}

export function BatchFulfilmentWorkspace({ token, initialBatchId, onOrdersChanged, onPrint, onEnvelopes, onNfc, onStartNfc, certificateFor, onOpenOrder }: {
  token: string; initialBatchId: string; onOrdersChanged: () => Promise<void>;
  onPrint: (orders: Order[]) => Promise<boolean | void>; onEnvelopes: (names: string[]) => Promise<boolean | void>; onNfc: (order: Order) => Promise<boolean | void>;
  certificateFor: (order: Order) => string; onOpenOrder: (order: Order) => Promise<void>;
  onStartNfc: () => void;
}) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<FulfilmentBatch[]>([]), [id, setId] = useState(initialBatchId), [detail, setDetail] = useState<BatchDetail | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [generated, setGenerated] = useState(false), [names, setNames] = useState<Record<string, string>>({}), [notice, setNotice] = useState("");
  const loadingGeneration = useRef(0), operation = useRef(false);
  const refreshList = useCallback(async () => { const result = await batchRequest(token); setBatches(result.batches); return result.batches; }, [token]);
  useEffect(() => { let active = true; refreshList().then(list => { if (active && !initialBatchId) setId(list.find(batch => batch.stage !== "complete")?.id ?? list[0]?.id ?? ""); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [refreshList, initialBatchId]);
  const openBatch = useCallback(async (selected: string) => {
    const generation = ++loadingGeneration.current;
    setLoading(true); setError(""); setNotice(""); setGenerated(false); setDetail(null);
    try { const result = await batchRequest(token, selected); if (generation === loadingGeneration.current) { setDetail(result); setNames(Object.fromEntries(result.orders.map(order => [order.id, result.batch.envelope_names[order.id] ?? order.plushName ?? ""]))); } }
    catch (error) { if (generation === loadingGeneration.current) setError(error instanceof Error ? error.message : "Could not load batch."); }
    finally { if (generation === loadingGeneration.current) setLoading(false); }
  }, [token]);
  useEffect(() => { const requests = loadingGeneration; if (id) void openBatch(id); return () => { requests.current++; }; }, [id, openBatch]);
  async function mutate(action: string, payload: object = {}, current = detail) {
    if (!current) throw new Error("Choose a batch first.");
    const result = await batchRequest(token, undefined, { action, batchId: current.batch.id, version: current.batch.version, payload });
    setDetail(result); setGenerated(false);
    // The mutation already returns current progress. Avoid another batch-list
    // request after every card; staff can refresh to see changes to other batches.
    setBatches(current => current.map(batch => batch.id === result.batch.id ? { ...batch, ...result.batch, orderCount: result.orders.length, writtenCount: result.members.filter(member => member.nfc_written_at).length } : batch));
    return result;
  }
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setNotice(""); setError(error instanceof Error ? error.message : "Batch action failed."); } finally { operation.current = false; setBusy(false); }
  }
  async function upload(file: File) {
    if (!detail) return;
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/shipping-labels", { method: "POST", body: form });
    const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not import labels.");
    const paired: Array<{ orderId: string; url: string; fileName: string; source: string }> = [], unmatched: number[] = [];
    for (const label of result.labels) {
      const matches = matchBatchLabel(detail.orders, label);
      if (!matches.length) unmatched.push(label.page);
      for (const order of matches) paired.push({ orderId: order.id, url: label.url, fileName: label.fileName, source: label.source });
    }
    if (!paired.length) throw new Error("No labels matched orders in this batch.");
    if (new Set(paired.map(label => label.orderId)).size !== paired.length) throw new Error("Multiple labels matched the same order. Upload one label per order.");
    await mutate("labels", { labels: paired });
    setNotice(`${paired.length} ${t("labels paired")}${unmatched.length ? ` · ${t("Unmatched pages")}: ${unmatched.join(", ")}` : ""}`);
    await onOrdersChanged();
  }
  async function downloadAudio() {
    if (!detail) return;
    const expected = detail.orders.filter(batchNeedsAudio);
    if (!expected.length) { await mutate("advance", { stage: "audio" }); return; }
    const files: Array<{ name: string; bytes: Uint8Array }> = [];
    let total = 0;
    for (const [index, order] of expected.entries()) {
      setNotice(`${t("Preparing audio")}: ${index + 1}/${expected.length}`);
      const response = await fetch(`/api/fulfilment/batches/audio?id=${encodeURIComponent(detail.batch.id)}&orderId=${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(`${t("Could not download audio for order")} #${order.orderNumber}: ${result.error ?? response.status}`); }
      const type = (response.headers.get("content-type") ?? "").split(";")[0];
      if (!type.startsWith("audio/") && type !== "application/octet-stream") throw new Error(`${t("This order has no downloadable audio file")}: #${order.orderNumber}`);
      const bytes = new Uint8Array(await response.arrayBuffer()); total += bytes.length;
      if (!bytes.length || total > 200 * 1024 * 1024) throw new Error("Audio ZIP is empty or exceeds 200 MB. Use a smaller batch.");
      files.push({ name: `${String(index + 1).padStart(3, "0")}-${voiceBackupFileName({ ...order, character: order.character ?? "" }, "mp3")}`, bytes });
    }
    const url = URL.createObjectURL(await buildAudioZip(files)), link = document.createElement("a"); link.href = url; link.download = `batch-${detail.batch.number}-audio.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    await mutate("advance", { stage: "audio" });
    setNotice(t("Audio ZIP download started."));
  }
  const stage = detail?.batch.stage, step = stage ? batchStages.indexOf(stage) : -1, missingLabels = detail?.orders.filter(order => batchNeedsLabel(order) && !order.shippingLabelUrl) ?? [];
  const written = new Set(detail?.members.filter(member => member.nfc_written_at).map(member => member.order_id));
  return <section className="batch-workspace"><div className="batch-picker card"><label>{t("Choose batch")}<select value={id} disabled={busy || loading} onChange={event => setId(event.target.value)}><option value="">{t("Choose a batch")}</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{t("Batch")} {batch.number} · {batch.orderCount} {t("orders")} · {t(labels[batchStages.indexOf(batch.stage)])}</option>)}</select></label><button className="button secondary" disabled={busy || loading} onClick={() => void run(async () => { await refreshList(); if (id) await openBatch(id); })}>{t("Refresh")}</button></div>
    {error && <p className="batch-error" role="alert">{t(error)}</p>}{notice && <p role="status">{notice}</p>}
    <ol className="batch-progress">{labels.slice(0, 5).map((label, index) => <li key={label} className={step > index ? "done" : step === index ? "current" : ""} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{t(label)}</li>)}</ol>
    {!id && !loading && <div className="card batch-step"><h2>{t("No batch selected")}</h2><p>{t("Select orders in Fulfilment, then choose Move to Batch Fulfilment.")}</p></div>}
    {loading && <p role="status">{t("Loading batch...")}</p>}
    {detail && <><div className="card batch-step"><p>{t("Batch")} {detail.batch.number} · {detail.orders.length} {t("orders")}</p><h2>{t(labels[step])}</h2>
      {stage === "labels" && <><p>{t("Upload the courier PDFs. Only orders in this batch will be paired.")}</p><input type="file" accept="application/pdf,.pdf" disabled={busy} aria-label={t("Upload shipping labels")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => upload(file)); }} /><p>{missingLabels.length ? `${missingLabels.length} ${t("orders still need shipping labels")}` : t("All shipping labels are ready.")}</p><button className="button primary" disabled={busy || Boolean(missingLabels.length)} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Next step")}</button></>}
      {stage === "printing" && <><p>{t("Generate the combined PDF, then print it before continuing.")}</p><div className="batch-buttons"><button className="button primary" disabled={busy} onClick={() => void run(async () => { if (!await onPrint(detail.orders)) throw new Error("PDF generation failed. Try again."); setGenerated(true); })}>{t("Generate packing slips + labels")}</button><button className="button secondary" disabled={busy || !generated} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Printed — next step")}</button></div></>}
      {stage === "envelopes" && <><p>{t("Check every envelope name, then generate the PDF.")}</p><div className="batch-name-grid">{detail.orders.map(order => <label key={order.id}>#{order.orderNumber}<input maxLength={60} disabled={busy} value={names[order.id] ?? ""} onChange={event => { setNames(current => ({ ...current, [order.id]: event.target.value })); setGenerated(false); }} /></label>)}</div><div className="batch-buttons"><button className="button primary" disabled={busy || detail.orders.some(order => !names[order.id]?.trim())} onClick={() => void run(async () => { await mutate("envelope_names", { names }); if (!await onEnvelopes(detail.orders.map(order => names[order.id].trim()))) throw new Error("Envelope generation failed. Try again."); setGenerated(true); })}>{t("Generate all envelopes")}</button><button className="button secondary" disabled={busy || !generated} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Envelopes done — next step")}</button></div></>}
      {stage === "audio" && <><p>{t("Download one ZIP containing MP3 audio for this batch. Audio and video messages are converted on the first download; later downloads reuse the saved MP3 copies.")}</p><button className="button primary" disabled={busy} onClick={() => void run(downloadAudio)}>{t(detail.orders.some(batchNeedsAudio) ? "Download audio ZIP" : "No audio required — next step")}</button></>}
      {stage === "nfc" && <><p>{t("Hold each card on the reader, then press Write. The final confirmed card completes the batch.")}</p><p>{written.size}/{detail.orders.length} {t("cards written")}</p><button className="button secondary" disabled={busy} onClick={onStartNfc}>{t("Start NFC Helper")}</button></>}
      {stage === "complete" && <p role="status">{t("All NFC cards are complete. The batch orders have moved to Sent for Sewing.")}</p>}
    </div><div className="card batch-order-list"><h3>{t("Orders in this batch")}</h3>{detail.orders.map(order => <article key={order.id}><div><strong>#{order.orderNumber}{order.setIndicator ? ` (${order.setIndicator})` : ""}</strong><p>{order.plushName || order.customerName} · {order.character}</p>{stage === "labels" && <small>{t(order.shippingLabelUrl || !batchNeedsLabel(order) ? "Ready" : "Shipping label missing")}</small>}</div><div className="batch-buttons"><button className="button secondary" disabled={busy} onClick={() => void run(() => onOpenOrder(order))}>{t("View order")}</button>{stage === "nfc" && <button className="button primary" disabled={busy || written.has(order.id) || !certificateFor(order)} onClick={() => void run(async () => { if (!await onNfc(order)) throw new Error("NFC writer did not confirm this card. Try again."); const result = await mutate("nfc", { orderId: order.id }); if (result.batch.stage === "complete") await onOrdersChanged(); })}>{t(written.has(order.id) ? "Written" : certificateFor(order) ? "Write NFC card" : "Certificate link missing")}</button>}</div></article>)}</div></>}
  </section>;
}
