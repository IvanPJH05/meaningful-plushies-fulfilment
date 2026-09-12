"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Order } from "../lib/types";
import { normaliseBarcodeValue, OrderBarcode, orderBarcodeValue } from "./order-barcode";
import styles from "./audio-scanner-workspace.module.css";

type Props = { orders: Order[]; audioSourceFor: (order: Order) => string };

export function AudioScannerWorkspace({ orders, audioSourceFor }: Props) {
  const [scanValue, setScanValue] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scanIndex = useMemo(() => new Map(orders.map((order) => [normaliseBarcodeValue(orderBarcodeValue(order)), order])), [orders]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function scan(event?: FormEvent) {
    event?.preventDefault();
    const token = normaliseBarcodeValue(scanValue);
    if (!token) return;
    const order = scanIndex.get(token) ?? orders.find((candidate) => normaliseBarcodeValue(candidate.orderNumber) === token.replace(/^MP/, ""));
    if (!order) { setSelected(null); setMessage("No order matches this barcode. Please scan the barcode printed on the packing slip."); return; }
    setSelected(order);
    setScanValue("");
    const audioSource = audioSourceFor(order);
    if (!audioSource) { setMessage(`Order #${order.orderNumber} has no voice message saved yet.`); inputRef.current?.focus(); return; }
    setMessage("");
    const player = audioRef.current;
    if (player) {
      player.src = audioSource;
      player.load();
      try { await player.play(); }
      catch { setMessage("The order was found. Press Play below if your browser blocked automatic playback."); }
    }
    inputRef.current?.focus();
  }

  return <section className={styles.workspace}>
    <header className={styles.intro}><div><p className={styles.eyebrow}>AUDIO VERIFICATION</p><h2>Barcode Scanner</h2><p>Scan a packing-slip barcode to immediately play that plushie&apos;s saved voice message.</p></div></header>
    <form className={styles.card} onSubmit={scan}>
      <div className={styles.scanner}><label>Scan barcode or enter the order code<input ref={inputRef} value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Scan now…" autoComplete="off" /></label><button type="submit">Verify & play</button></div>
      <p className={styles.help}>A USB barcode scanner works like a keyboard: click here once, scan the label, and it will submit automatically when the scanner sends Enter. You can also type a code for testing.</p>
    </form>
    <audio ref={audioRef} className={styles.audio} controls hidden={!selected || !audioSourceFor(selected)} preload="metadata" />
    {message && <p className={message.startsWith("Order #") ? `${styles.error}` : styles.error}>{message}</p>}
    {selected ? <article className={`${styles.card} ${styles.result}`}>
      <div><p className={styles.eyebrow}>ORDER FOUND</p><h3>#{selected.orderNumber} · {selected.plushName || "Unnamed plushie"}</h3><p className={audioSourceFor(selected) ? styles.success : ""}>{audioSourceFor(selected) ? "Voice message ready — playing now." : "No voice message has been uploaded for this order."}</p><div className={styles.details}><div><span>CHARACTER</span><strong>{selected.character || "—"}</strong></div><div><span>CUSTOMER</span><strong>{selected.customerName || "—"}</strong></div></div>{audioSourceFor(selected) && <button className={styles.replay} type="button" onClick={() => void audioRef.current?.play()}>Play voice again</button>}</div>
      <div className={styles.barcode}><OrderBarcode value={orderBarcodeValue(selected)} /><p className={styles.help}>This is the code printed on the packing slip.</p></div>
    </article> : <div className={`${styles.card} ${styles.empty}`}><strong>Ready to scan</strong><p>Scan any new packing slip to check the plushie&apos;s voice before packing.</p></div>}
  </section>;
}
