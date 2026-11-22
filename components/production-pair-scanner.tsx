"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type ProductionItem } from "@/lib/production-tracking";
import type { Order } from "@/lib/types";
import type { PackingProofTicket } from "./packing-camera-station";
import { createSerialScanQueue } from "@/lib/serial-scan-queue";

type Pending = ({ kind: "order"; item: ProductionItem; barcode: string } | { kind: "card"; code: string }) & { expires: number };
type ScanEntry = { value: string; scannedAt: number };
type Props = {
  findOrder: (barcode: string) => Promise<ProductionItem | null>;
  audioSourceFor: (order: Order) => string;
  checkCard: (code: string, orderId?: string) => Promise<unknown>;
  save: (item: ProductionItem, action: string, barcode: string, card: string, note: string) => Promise<ProductionItem[]>;
  onBusy: (busy: boolean) => void;
  proofEnabled?: boolean;
  recording?: boolean;
  preparePackingProof?: (item: ProductionItem, barcode: string, card: string, scannedAt: number) => PackingProofTicket | null;
};

export function ProductionPairScanner({ findOrder, audioSourceFor, checkCard, save, onBusy, proofEnabled=false, recording=false, preparePackingProof }: Props) {
  const [scan, setScan] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [status, setStatus] = useState("Scan an order or NFC card barcode.");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ProductionItem | null>(null);
  const [note, setNote] = useState("");
  const current = useRef<Pending | null>(null);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  const recordingRef = useRef(recording);
  const mounted = useRef(true);
  recordingRef.current = recording;
  const handlers = useRef<{ process: (entry: ScanEntry) => Promise<void>; failed: (error: unknown) => void }>({ process: async () => {}, failed: () => {} });
  const scans = useRef<ReturnType<typeof createSerialScanQueue<ScanEntry>> | null>(null);
  if (!scans.current) scans.current = createSerialScanQueue({
    process: entry => handlers.current.process(entry),
    canProcess: () => mounted.current && !recordingRef.current && !lock.current,
    onError: error => handlers.current.failed(error),
  });
  handlers.current = {
    process: entry => run(() => processScan(entry.value, entry.scannedAt)),
    failed: error => show("Unable to complete the scan. " + failureText(error)),
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; scans.current?.clear(); };
  }, []);

  function show(message: string, replay?: ProductionItem) {
    setStatus(message);
    player.current?.pause();
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      if (replay) play(replay);
      return;
    }
    window.speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(message);
    voice.lang = "en-MY";
    if (replay) {
      voice.onend = () => play(replay);
      voice.onerror = () => play(replay);
    }
    window.speechSynthesis.speak(voice);
  }

  function play(item: ProductionItem) {
    const source = audioSourceFor({ ...item.order, id: item.order_id } as Order);
    const audio = player.current;
    if (!audio) return;
    window.speechSynthesis?.cancel();
    audio.pause();
    if (!source) {
      audio.removeAttribute("src");
      return;
    }
    audio.src = source;
    void audio.play().catch(() => {});
  }

  function update(next: Pending | null) {
    current.current = next;
    setPending(next);
    setSeconds(60);
  }

  function failureText(error: unknown) {
    const reason = error instanceof Error ? error.message : "Please try again.";
    if (reason.includes("NFC_CARD_ALREADY_ASSIGNED")) return "This NFC card is already activated.";
    if (reason.includes("NFC_ORDER_ALREADY_PAIRED")) return "This order already has an activated card.";
    if (reason.includes("NFC_CARD_NOT_PROGRAMMED")) return "This NFC card has not been programmed.";
    return reason;
  }

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    try { await work(); }
    catch (error) { scans.current?.clear(); show("Unable to complete the scan. " + failureText(error)); }
    finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
      scans.current?.resume();
    }
  }

  async function expire(window: Pending) {
    update(null);
    if (window.kind === "card") {
      show("Card scan expired. Scan the card again.");
      return;
    }
    show("Pairing window expired. The order stays packed. Scan the order again to pair its card.");
  }

  useEffect(() => {
    if (recording) return;
    scans.current?.resume();

    function focusScanner() {
      input.current?.focus({ preventScroll: true });
      if (!input.current?.value) input.current?.select();
    }

    function focusFromPage(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("button, a, input, textarea, select, label, audio, video, summary, [role=button], [contenteditable], [role=dialog]")) return;
      focusScanner();
    }

    focusScanner();
    document.addEventListener("click", focusFromPage);
    return () => document.removeEventListener("click", focusFromPage);
  }, [recording, proofEnabled]);

  // A keyboard scanner sends its characters as a burst. Select any text
  // left idle so the next burst replaces it, even if the field kept focus.
  useEffect(() => {
    if (!scan) return;
    const timer = window.setTimeout(() => {
      if (document.activeElement === input.current) input.current?.select();
    }, 750);
    return () => window.clearTimeout(timer);
  }, [scan]);

  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      setSeconds(Math.max(0, Math.ceil((pending.expires - Date.now()) / 1000)));
      if (!lock.current && current.current === pending && Date.now() >= pending.expires) void run(() => expire(pending));
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pair(item: ProductionItem, barcode: string, code: string, scannedAt: number) {
    const previous = current.current;
    player.current?.pause();
    let ticket: PackingProofTicket | null = null;
    try {
      ticket = preparePackingProof?.(item, barcode, code, scannedAt) || null;
      await save(item, "packed", barcode, code, "");
      ticket?.confirm();
      update(null);
      show("NFC card paired successfully. Order packed and ready for J and T pickup.", item);
    } catch (error) {
      ticket?.cancel();
      if (previous?.kind === "card") update(null);
      scans.current?.clear();
      show("Unable to pair. " + failureText(error), item);
    }
  }

  async function processScan(value: string, scannedAt: number) {
      let previous = current.current;
      if (previous && Date.now() >= previous.expires) {
        await expire(previous);
        previous = null;
      }
      const item = /^NFC-/i.test(value) ? null : await findOrder(value);
      if (item) {
        setSelected(item);
        setNote("");
        if ((item.certificate_code || item.nfc_paired) && !proofEnabled) {
          update(null);
          if (previous?.kind === "card") show("Order packed. This order already has an activated card.", item);
          else { setStatus("Order packed. Already paired. Playing the saved recording for review."); play(item); }
          return;
        }
        if (previous?.kind === "card") {
          if (Date.now() >= previous.expires) { await expire(previous); return; }
          await pair(item, value, previous.code, scannedAt);
          return;
        }
        update({ kind: "order", item, barcode: value, expires: Date.now() + 60000 });
        setStatus("Order packed. Scan the NFC card within one minute to pair it.");
        play(item);
        return;
      }

      const code = value.toUpperCase();
      if (!/^NFC-\d{6,12}$/.test(code) && !(previous?.kind === "order" && /^\d{6}$/.test(code))) {
        scans.current?.clear();
        show("Barcode not recognised. Scan a packing slip or an NFC card.");
        return;
      }
      if (code.startsWith("NFC-")) {
        try { await checkCard(code, previous?.kind === "order" ? previous.item.order_id : undefined); }
        catch (error) { scans.current?.clear(); show("Unable to pair. " + failureText(error), previous?.kind === "order" ? previous.item : undefined); return; }
      }
      if (previous?.kind === "order") {
        if (Date.now() >= previous.expires) { await expire(previous); return; }
        await pair(previous.item, previous.barcode, code, scannedAt);
      } else {
        update({ kind: "card", code, expires: Date.now() + 60000 });
        show("Card ready. Scan the order within one minute.");
      }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    // Read and clear the actual field immediately, before the order lookup.
    // The next keyboard-scanner burst must have a focused, writable input.
    const value = (input.current?.value ?? scan).trim();
    if (recordingRef.current) return;
    const scannedAt = performance.now();
    if (input.current) input.current.value = "";
    setScan("");
    if (value) scans.current?.enqueue({ value, scannedAt });
  }

  return <section>
    <h2>Scan an order or NFC card</h2>
    <p>Scanning an order marks it Packed from any stage and confirms any previous issue was fixed. Scan its NFC card to pair it. You can scan either barcode first, back-to-back. Scans are checked in the order received.</p>
    <form onSubmit={submit}>
      <label>Scan order or NFC card<input ref={input} autoFocus onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} value={scan} onChange={event => setScan(event.target.value)} disabled={recording} autoComplete="off" /></label>
      <button disabled={recording} type="submit">Scan</button>
    </form>
    {pending && <p>{seconds} seconds remaining · {pending.kind === "card" ? pending.code : "#" + (pending.item.order?.orderNumber || pending.item.order_id)}</p>}
    {busy && <p role="status">Checking scan… You can scan the next barcode now.</p>}
    <p role="status">{status}</p>
    {selected && <p>#{String(selected.order?.orderNumber || selected.order_id)} · {String(selected.order?.plushName || selected.order?.character || "")}</p>}
    <audio ref={player} controls preload="none" />
    {selected?.issue && !pending && <details><summary>Manage order issue</summary>
      <label>Reason<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} /></label>
      {["resolve", "remove", "defer"].map(action => <button key={action} disabled={busy || note.trim().length < 3}
        onClick={() => void run(async () => { await save(selected, action, "", "", note); setSelected(null); show("Issue decision saved."); })}>{action === "resolve" ? "Resolve issue" : action === "remove" ? "Remove from queue" : "Leave for tomorrow"}</button>)}
    </details>}
  </section>
}
