"use client";
import { NotificationMessage } from "./notification-bar";
import { LoadingIndicator } from "./loading-indicator";
import dynamic from "next/dynamic";
const BatchHistory = dynamic(() => import("./batch-history").then(module => module.BatchHistory), { loading: () => <LoadingIndicator>Loading history...</LoadingIndicator> });
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./dashboard-language";
import { batchStages, batchNeedsEnvelope, batchEnvelopeName, batchNeedsLabel, matchBatchLabel, type BatchDetail, type FulfilmentBatch } from "../lib/fulfilment-batches";
import { useBatchAudioPreparation } from "./batch-audio-preparation";
import { BatchCodDetails } from "./batch-cod-details";
import { BatchTaskProgress } from "./batch-task-progress";
import type { Order } from "../lib/types";

const labels = ["Upload shipping labels", "Packing slips + shipping labels", "Generate envelopes", "Download audio ZIP", "Write NFC cards", "Batch complete"];
function shortOrder(order: Order) {
  const match = order.salesChannel === "tiktok" && order.orderNumber.match(/\b(TT\d+)\b\s+(\d+)/i);
  return match ? `${match[1].toUpperCase()} ${match[2].slice(-4)}` : `#${order.orderNumber}`;
}
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
  return <div className="batch-dialog-overlay"><section className="card batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title"><h2 id="batch-dialog-title">{t("Move to Batch Fulfilment")}</h2><p>{orderIds.length} {t("orders selected")}. {t("New orders will move to Uploading Audio.")}</p><label>{t("Choose batch")}<select value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}><option value="new">{t("Create a new batch")}</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{t("Batch")} {batch.number} · {batch.orderCount} {t("orders")}</option>)}</select></label>{error && <p role="alert">{t(error)}</p>}<div className="batch-buttons"><button className="button secondary" disabled={busy} onClick={onClose}>{t("Cancel")}</button><button className="button primary" disabled={busy} onClick={() => void assign()}>{busy ? <LoadingIndicator>{t("Saving...")}</LoadingIndicator> : t("Move to batch")}</button></div></section></div>;
}

export function BatchFulfilmentWorkspace(props: Parameters<typeof ActiveBatchFulfilmentWorkspace>[0]) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("active");
  return <><div className="batch-section-tabs" role="tablist" aria-label={t("Batch Fulfilment")}><button role="tab" aria-selected={tab === "active"} aria-controls="active-batches-panel" id="active-batches-tab" onClick={() => setTab("active")}>{t("Active batches")}</button><button role="tab" aria-selected={tab === "history"} aria-controls="batch-history-panel" id="batch-history-tab" onClick={() => setTab("history")}>{t("History")}</button></div><div id="active-batches-panel" role="tabpanel" aria-labelledby="active-batches-tab" hidden={tab !== "active"}><ActiveBatchFulfilmentWorkspace {...props} /></div>{tab === "history" && <div id="batch-history-panel" role="tabpanel" aria-labelledby="batch-history-tab"><BatchHistory token={props.token} /></div>}</>;
}

function ActiveBatchFulfilmentWorkspace({ token, initialBatchId, onOrdersChanged, onPrint, onEnvelopes, onNfc, onStartNfc, certificateFor, onOpenOrder }: {
  token: string; initialBatchId: string; onOrdersChanged: () => Promise<void>;
  onPrint: (orders: Order[]) => Promise<boolean | void>; onEnvelopes: (names: string[]) => Promise<boolean | void>; onNfc: (order: Order) => Promise<boolean | void>;
  certificateFor: (order: Order) => string; onOpenOrder: (order: Order) => Promise<void>;
  onStartNfc: () => void;
}) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<FulfilmentBatch[]>([]), [id, setId] = useState(initialBatchId), [detail, setDetail] = useState<BatchDetail | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [generated, setGenerated] = useState(false), [names, setNames] = useState<Record<string, string>>({}), [notice, setNotice] = useState("");
  const loadingGeneration = useRef(0), operation = useRef(false);
  const [audioStartedFor, setAudioStartedFor] = useState("");
  const [taskStarted, setTaskStarted] = useState(0);
  const audioEnabled = Boolean(detail && (audioStartedFor === detail.batch.id || ["envelopes", "audio"].includes(detail.batch.stage)));
  const audio = useBatchAudioPreparation(token, detail, audioEnabled);
  const envelopeOrders = detail?.orders.filter(batchNeedsEnvelope) ?? [];
  const labelInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false), [uploadProgress, setUploadProgress] = useState("");
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; message: string; failed: boolean }>>([]);
  const refreshList = useCallback(async () => { const result = await batchRequest(token); const active = result.batches.filter(batch => batch.stage !== "complete"); setBatches(active); return active; }, [token]);
  useEffect(() => { let active = true; refreshList().then(list => { if (active && !initialBatchId) setId(list[0]?.id ?? ""); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [refreshList, initialBatchId]);
  const openBatch = useCallback(async (selected: string) => {
    const generation = ++loadingGeneration.current;
    setLoading(true); setError(""); setNotice(""); setGenerated(false); setDetail(null);
    setUploadResults([]); setUploadProgress(""); setDragging(false);
    try { const result = await batchRequest(token, selected); if (generation === loadingGeneration.current) { if (result.batch.stage === "complete") { setId(""); setNotice(t("Completed batches are available in History.")); return; } setDetail(result); setNames(Object.fromEntries(result.orders.map(order => [order.id, batchEnvelopeName(order, result.batch.envelope_names[order.id])]))); } }
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
    setBatches(current => current.map(batch => batch.id === result.batch.id ? { ...batch, ...result.batch, orderCount: result.orders.length, writtenCount: result.members.filter(member => member.nfc_written_at).length } : batch).filter(batch => batch.stage !== "complete"));
    if (result.batch.stage === "complete") { setId(""); setDetail(null); setNotice(t("Completed batches are available in History.")); }
    return result;
  }
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setTaskStarted(Date.now()); setError(""); setNotice("");
    try { await action(); } catch (error) { setNotice(""); setError(error instanceof Error ? error.message : "Batch action failed."); } finally { operation.current = false; setBusy(false); }
  }
  async function upload(file: File, current: BatchDetail) {
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/shipping-labels", { method: "POST", body: form });
    const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not import labels.");
    const paired: Array<{ orderId: string; url: string; fileName: string; source: string }> = [], unmatched: number[] = [];
    for (const label of result.labels) {
      const matches = matchBatchLabel(current.orders, label);
      if (!matches.length) unmatched.push(label.page);
      for (const order of matches) if (!order.shippingLabelUrl) paired.push({ orderId: order.id, url: label.url, fileName: label.fileName, source: label.source });
    }
    if (!paired.length) {
      if (unmatched.length === result.labels.length) throw new Error("No labels matched orders in this batch.");
      return { detail: current, message: t("Matching orders already have labels.") };
    }
    if (new Set(paired.map(label => label.orderId)).size !== paired.length) throw new Error("Multiple labels matched the same order. Upload one label per order.");
    const updated = await mutate("labels", { labels: paired }, current);
    return { detail: updated, message: `${paired.length} ${t("labels paired")}${unmatched.length ? ` · ${t("Unmatched pages")}: ${unmatched.join(", ")}` : ""}` };
  }
  async function uploadFiles(files: File[]) {
    if (!detail || !files.length) return;
    let current = detail, changed = false;
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`${t("Uploading PDF")} ${index + 1}/${files.length}: ${file.name}`);
        try {
          if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(t("Choose PDF files only."));
          const result = await upload(file, current);
          changed ||= result.detail !== current;
          current = result.detail;
          setUploadResults(items => [...items, { name: file.name, message: result.message, failed: false }]);
        } catch (error) {
          setUploadResults(items => [...items, { name: file.name, message: error instanceof Error ? error.message : t("Could not import labels."), failed: true }]);
          // Stop after a version conflict rather than pairing subsequent files
          // against a batch another staff member has changed.
          if (error instanceof Error && /Another staff member|BATCH_CHANGED/.test(error.message)) break;
        }
      }
      if (changed) await onOrdersChanged();
    } finally { setUploadProgress(""); }
  }
  async function recordHistory(action: string) {
    if (!detail) return;
    const response = await fetch("/api/fulfilment/batches/history", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ batchId: detail.batch.id, action }) });
    if (!response.ok) throw new Error("The file was generated, but its history could not be saved. Refresh and try again.");
  }
  async function downloadAudio() {
    if (!detail) return;
    if (audio.phase === "ready" && !audio.available) { await mutate("advance", { stage: "audio" }); return; }
    if (!audio.blob) throw new Error("The audio ZIP is still being prepared.");
    const url = URL.createObjectURL(audio.blob), link = document.createElement("a"); link.href = url; link.download = `batch-${detail.batch.number}-audio.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    await recordHistory("audio_zip_download_started");
    await mutate("advance", { stage: "audio" });
    setNotice(t("Audio ZIP download started."));
  }
  const stage = detail?.batch.stage, step = stage ? batchStages.indexOf(stage) : -1, missingLabels = detail?.orders.filter(order => batchNeedsLabel(order) && !order.shippingLabelUrl) ?? [];
  const written = new Set(detail?.members.filter(member => member.nfc_written_at).map(member => member.order_id));
  return <section className="batch-workspace"><div className="batch-picker card"><label>{t("Choose batch")}<select value={id} disabled={busy || loading} onChange={event => setId(event.target.value)}><option value="">{t("Choose a batch")}</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{t("Batch")} {batch.number} · {batch.orderCount} {t("orders")} · {t(labels[batchStages.indexOf(batch.stage)])}</option>)}</select></label><button className="button secondary" disabled={busy || loading} onClick={() => void run(async () => { await refreshList(); if (id) await openBatch(id); })}>{t("Refresh")}</button></div>
    {error && <NotificationMessage><p className="batch-error" role="alert">{t(error)}</p></NotificationMessage>}{notice && <NotificationMessage><p role="status">{notice}</p></NotificationMessage>}
    {busy && <BatchTaskProgress label={uploadProgress || t("Processing batch action")} started={taskStarted} estimate={stage === "printing" || stage === "envelopes" ? Math.max(8, (detail?.orders.length ?? 1) * 2) : 8} />}
    {audioEnabled && Boolean(detail?.orders.length) && <div className="card batch-audio-status">{audio.phase === "ready" ? <p role="status">✓ {t(audio.available ? "Audio ZIP ready — download at the audio step." : "No voice files uploaded for this batch.")}</p> : audio.phase === "error" ? <><p role="alert">{audio.error}</p><button className="button secondary" disabled={busy} onClick={audio.retry}>{t("Retry audio preparation")}</button></> : <BatchTaskProgress label={t(audio.phase === "zip" ? "Building audio ZIP" : "Preparing audio in the background")} started={audio.started} completed={audio.completed} total={audio.total} estimate={Math.max(5, audio.total * 8 + 3)} />}{audio.missing.length > 0 && <p>{t("Voice not uploaded")}: {detail?.orders.filter(order => audio.missing.includes(order.id)).map(shortOrder).join(", ")}</p>}<small>{t("Keep this workspace open while audio is prepared. Other batch steps remain available.")}</small></div>}
    <ol className="batch-progress">{labels.slice(0, 5).map((label, index) => <li key={label} className={step > index ? "done" : step === index ? "current" : ""} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{t(label)}</li>)}</ol>
    {!id && !loading && <div className="card batch-step"><h2>{t("No batch selected")}</h2><p>{t("Select orders in Fulfilment, then choose Move to Batch Fulfilment.")}</p></div>}
    {loading && <NotificationMessage completionText={t("Batch data loaded")}><LoadingIndicator>{t("Loading batch...")}</LoadingIndicator></NotificationMessage>}
    {detail && <><div className="card batch-step"><p>{t("Batch")} {detail.batch.number} · {detail.orders.length} {t("orders")}</p><h2>{t(labels[step])}</h2>
      {stage === "labels" && <>
        <p>{t("Upload the courier PDFs. Only orders in this batch will be paired.")}</p>
        <div className={`batch-label-drop${dragging ? " dragging" : ""}${busy ? " busy" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void run(() => uploadFiles(Array.from(event.dataTransfer.files))); }}>
          <span className="batch-upload-icon" aria-hidden="true">↑</span>
          <strong>{t("Drop shipping-label PDFs here")}</strong>
          <p>{t("Add PDFs from different couriers together or upload more later. Existing pairs are kept.")}</p>
          <button className="button primary" disabled={busy} onClick={() => labelInput.current?.click()}>{t(busy ? "Uploading..." : "Choose PDFs")}</button>
          <input ref={labelInput} type="file" multiple hidden accept="application/pdf,.pdf" disabled={busy} aria-label={t("Upload shipping labels")} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void run(() => uploadFiles(files)); }} />
        </div>
        {uploadProgress && <p role="status" className="batch-upload-progress">{uploadProgress}</p>}
        {uploadResults.length > 0 && <ul className="batch-upload-results" aria-label={t("PDF upload results")}>{uploadResults.map((result, index) => <li key={index} className={result.failed ? "failed" : ""}><strong>{result.name}</strong><span>{t(result.message)}</span></li>)}</ul>}
        <section className={`batch-label-summary${missingLabels.length ? "" : " complete"}`} aria-live="polite">
          <strong>{detail.orders.filter(order => batchNeedsLabel(order) && order.shippingLabelUrl).length}/{detail.orders.filter(batchNeedsLabel).length} {t("shipping labels paired")}</strong>
          <p>{t(missingLabels.length ? "Still need pairing" : "All shipping labels are ready.")}</p>
          {missingLabels.length > 0 && <div className="batch-missing-orders">{missingLabels.map(order => <button key={order.id} title={order.orderNumber} disabled={busy} onClick={() => void run(() => onOpenOrder(order))}>{shortOrder(order)}{order.setIndicator ? ` (${order.setIndicator})` : ""}</button>)}</div>}
        </section>
        <button className="button primary" disabled={busy || Boolean(missingLabels.length)} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Next step")}</button>
      </>}
      {stage === "printing" && <><p>{t("Generate the combined PDF, then print it before continuing.")}</p><div className="batch-buttons"><button className="button primary" disabled={busy} onClick={() => void run(async () => { if (!await onPrint(detail.orders)) throw new Error("PDF generation failed. Try again."); await recordHistory("packing_slips_generated"); setGenerated(true); setAudioStartedFor(detail.batch.id); })}>{t("Generate packing slips + labels")}</button><button className="button secondary" disabled={busy || !generated} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Printed — next step")}</button></div></>}
      {stage === "envelopes" && <><p>{t("Check every envelope name, then generate the PDF.")}</p>{detail.orders.length > envelopeOrders.length && <p>{t("Meaningful Plush Charms do not need envelopes.")}</p>}<div className="batch-name-grid">{envelopeOrders.map(order => <label key={order.id}>#{order.orderNumber}<input maxLength={60} disabled={busy} value={names[order.id] ?? ""} onChange={event => { setNames(current => ({ ...current, [order.id]: event.target.value })); setGenerated(false); }} /></label>)}</div><div className="batch-buttons"><button className="button primary" disabled={busy || !envelopeOrders.length || envelopeOrders.some(order => !names[order.id]?.trim())} onClick={() => void run(async () => { await mutate("envelope_names", { names: Object.fromEntries(envelopeOrders.map(order => [order.id, names[order.id].trim()])) }); if (!await onEnvelopes(envelopeOrders.map(order => names[order.id].trim()))) throw new Error("Envelope generation failed. Try again."); await recordHistory("envelopes_generated"); setGenerated(true); })}>{t("Generate all envelopes")}</button><button className="button secondary" disabled={busy || (envelopeOrders.length > 0 && !generated)} onClick={() => void run(async () => { await mutate("advance", { stage }); })}>{t("Envelopes done — next step")}</button></div></>}
      {stage === "audio" && <><p>{t("Download one ZIP containing MP3 audio for this batch. Audio and video messages are converted on the first download; later downloads reuse the saved MP3 copies.")}</p><button className="button primary" disabled={busy || (audio.phase !== "ready")} onClick={() => void run(downloadAudio)}>{t(audio.phase !== "ready" || audio.available > 0 ? "Download audio ZIP" : "No audio required — next step")}</button></>}
      {stage === "nfc" && <><p>{t("Hold each card on the reader, then press Write. The final confirmed card completes the batch.")}</p><p>{written.size}/{detail.orders.length} {t("cards written")}</p><button className="button secondary" disabled={busy} onClick={onStartNfc}>{t("Start NFC Helper")}</button></>}
      {stage === "complete" && <p role="status">{t("All NFC cards are complete. The batch orders have moved to Sent for Sewing.")}</p>}
    </div><BatchCodDetails key={detail.batch.id} orders={detail.orders} /><div className="card batch-order-list"><h3>{t("Orders in this batch")}</h3>{detail.orders.map(order => <article key={order.id}><div><strong title={order.orderNumber}>{shortOrder(order)}{order.setIndicator ? ` (${order.setIndicator})` : ""}</strong><p>{order.plushName || order.customerName} · {order.character}</p><span className={`batch-label-badge ${order.shippingLabelUrl ? "paired" : !batchNeedsLabel(order) ? "not-required" : "missing"}`}>{t(order.shippingLabelUrl ? "Shipping label paired" : !batchNeedsLabel(order) ? "No shipping label required" : "Shipping label missing")}</span>{audio.missing.includes(order.id) && <span className="batch-label-badge missing">{t("Voice not uploaded")}</span>}{order.shippingLabelFileName && <small className="batch-label-filename" title={order.shippingLabelFileName}>{order.shippingLabelFileName}</small>}</div><div className="batch-buttons"><button className="button secondary" disabled={busy} onClick={() => void run(() => onOpenOrder(order))}>{t("View order")}</button>{stage === "nfc" && <button className="button primary" disabled={busy || written.has(order.id) || !certificateFor(order)} onClick={() => void run(async () => { if (!await onNfc(order)) throw new Error("NFC writer did not confirm this card. Try again."); const result = await mutate("nfc", { orderId: order.id }); if (result.batch.stage === "complete") await onOrdersChanged(); })}>{t(written.has(order.id) ? "Written" : certificateFor(order) ? "Write NFC card" : "Certificate link missing")}</button>}</div></article>)}</div></>}
  </section>;
}
