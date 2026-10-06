"use client";

import { useMemo, useState } from "react";

import styles from "./page.module.css";

type TestOrder = {
  id: string;
  customer: string;
  plush: string;
  character: string;
  audio: string;
  address: string;
};

// This deliberately stays as local test data. It is a staff-flow prototype,
// not a second way to change live fulfilment orders.
const testOrders: TestOrder[] = [
  { id: "#1850", customer: "Aina Sofea", plush: "MILO", character: "HUNNIE", audio: "10 seconds", address: "Shah Alam, Selangor" },
  { id: "#1849", customer: "Siti Nur", plush: "BUBU", character: "TOOTSIE", audio: "5 seconds", address: "Kuala Lumpur" },
  { id: "#1848", customer: "Nur Iman", plush: "KIKI", character: "TOOTSIE", audio: "5 seconds", address: "Gombak, Kuala Lumpur" },
  { id: "#1847", customer: "Amir Hakim", plush: "TEDDY", character: "BILLY", audio: "20 seconds", address: "Kajang, Selangor" },
];

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function OrderFulfilmentTestPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [envelopesPrepared, setEnvelopesPrepared] = useState(false);
  const [audioPrepared, setAudioPrepared] = useState(false);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [labelsImported, setLabelsImported] = useState(false);

  const selected = useMemo(() => testOrders.filter((order) => selectedIds.includes(order.id)), [selectedIds]);
  const selectedCount = selected.length;
  const toggleOrder = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const resetAfterSelection = () => {
    setEnvelopesPrepared(false);
    setAudioPrepared(false);
    setLabelFile(null);
    setLabelsImported(false);
  };
  const changeSelection = (id: string) => {
    toggleOrder(id);
    resetAfterSelection();
  };

  function prepareAudio() {
    if (!selected.length) return;
    const lines = ["Order,Customer,Plush,Character,Audio", ...selected.map((order) => `${order.id},${order.customer},${order.plush},${order.character},${order.audio}`)];
    downloadText("meaningful-plushies-audio-test-list.csv", lines.join("\n"));
    setAudioPrepared(true);
  }

  function importTestLabels() {
    if (!labelFile || !audioPrepared) return;
    setLabelsImported(true);
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>LOCAL TEST PAGE · NO LIVE ORDERS ARE CHANGED</p>
        <h1>Order fulfilment</h1>
        <p className={styles.intro}>Follow these four steps in order. The page is intentionally simple so a new staff member always knows what to do next.</p>
      </div>
      <div className={styles.progress} aria-label="Fulfilment progress">
        {["Choose", "Envelopes", "Audio", "Labels"].map((label, index) => <div key={label} className={`${styles.progressStep} ${selectedCount && index === 0 || envelopesPrepared && index === 1 || audioPrepared && index === 2 || labelsImported && index === 3 ? styles.done : ""}`}><span>{index + 1}</span>{label}</div>)}
      </div>
    </header>

    <section className={styles.notice}><strong>Prototype only.</strong> The orders below are examples. Printing, audio download, and label import are safe test actions and do not affect the fulfilment system.</section>

    <section className={styles.flow}>
      <article className={styles.stepCard}>
        <div className={styles.stepHeader}><span className={styles.stepNumber}>1</span><div><p>START HERE</p><h2>Choose orders</h2><span>Select every order you are fulfilling in this batch.</span></div><strong className={styles.count}>{selectedCount} selected</strong></div>
        <div className={styles.selectActions}><button type="button" onClick={() => { setSelectedIds(testOrders.map((order) => order.id)); resetAfterSelection(); }}>Select all</button><button type="button" onClick={() => { setSelectedIds([]); resetAfterSelection(); }}>Clear</button></div>
        <div className={styles.orderList}>{testOrders.map((order) => <label className={`${styles.order} ${selectedIds.includes(order.id) ? styles.selected : ""}`} key={order.id}><input type="checkbox" checked={selectedIds.includes(order.id)} onChange={() => changeSelection(order.id)} /><div><strong>{order.id} · {order.plush}</strong><span>{order.customer} · {order.character} · {order.audio}</span></div><small>{order.address}</small></label>)}</div>
      </article>

      <article className={`${styles.stepCard} ${selectedCount ? "" : styles.locked}`}>
        <div className={styles.stepHeader}><span className={styles.stepNumber}>2</span><div><p>NEXT</p><h2>Print envelopes</h2><span>Print the recipient names before packing the plushies.</span></div></div>
        <div className={styles.actionRow}><div><strong>{selectedCount ? `${selectedCount} envelope name${selectedCount === 1 ? "" : "s"} ready` : "Choose orders first"}</strong><span>Two names per A4 page.</span></div><button type="button" className={styles.primary} disabled={!selectedCount} onClick={() => { setEnvelopesPrepared(true); window.print(); }}>Print test envelopes</button></div>
        {envelopesPrepared && <p className={styles.success}>Envelope print page opened. Continue when printing is complete.</p>}
      </article>

      <article className={`${styles.stepCard} ${envelopesPrepared ? "" : styles.locked}`}>
        <div className={styles.stepHeader}><span className={styles.stepNumber}>3</span><div><p>THEN</p><h2>Download all audio files</h2><span>Prepare one clear list of every voice message needed for this batch.</span></div></div>
        <div className={styles.actionRow}><div><strong>{selectedCount ? `${selectedCount} voice message${selectedCount === 1 ? "" : "s"} in this batch` : "Choose orders first"}</strong><span>Test version downloads a manifest only, never customer audio.</span></div><button type="button" className={styles.primary} disabled={!envelopesPrepared} onClick={prepareAudio}>Download test audio list</button></div>
        {audioPrepared && <p className={styles.success}>Audio checklist downloaded. The live version will download the actual voice files here.</p>}
      </article>

      <article className={`${styles.stepCard} ${audioPrepared ? "" : styles.locked}`}>
        <div className={styles.stepHeader}><span className={styles.stepNumber}>4</span><div><p>LAST</p><h2>Import shipping labels</h2><span>Upload the J&amp;T shipping-label PDF after the order batch is ready.</span></div></div>
        <label className={styles.upload}><input type="file" accept="application/pdf,.pdf" disabled={!audioPrepared} onChange={(event) => { setLabelFile(event.target.files?.[0] ?? null); setLabelsImported(false); }} /><strong>{labelFile ? labelFile.name : "Choose shipping-label PDF"}</strong><span>Test only — this file remains on your computer and is not uploaded.</span></label>
        <div className={styles.actionRow}><div><strong>{labelFile ? "Shipping label PDF ready" : "Choose a PDF to continue"}</strong><span>We will add real order matching after you approve this page.</span></div><button type="button" className={styles.primary} disabled={!audioPrepared || !labelFile} onClick={importTestLabels}>Test label import</button></div>
        {labelsImported && <p className={styles.success}>Test complete: {selectedCount} selected orders would now be ready for shipping-label pairing.</p>}
      </article>
    </section>

    <section className={styles.batch}>
      <h2>Current test batch</h2>
      {selected.length ? <div>{selected.map((order) => <span key={order.id}>{order.id} · {order.plush}</span>)}</div> : <p>No orders selected yet.</p>}
    </section>
  </main>;
}
