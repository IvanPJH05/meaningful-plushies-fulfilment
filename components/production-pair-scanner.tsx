"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { matchesProductionBarcode, type ProductionItem } from "@/lib/production-tracking";
import type { Order } from "@/lib/types";

type Pending = ({ kind: "order"; item: ProductionItem; barcode: string } | { kind: "card"; code: string }) & { expires: number };
type Props = {
  items: ProductionItem[];
  audioSourceFor: (order: Order) => string;
  checkCard: (code: string) => Promise<unknown>;
  save: (item: ProductionItem, action: string, barcode: string, card: string, note: string) => Promise<ProductionItem[]>;
  onBusy: (busy: boolean) => void;
};

export function ProductionPairScanner({ items, audioSourceFor, checkCard, save, onBusy }: Props) {
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
    catch (error) { show("Unable to complete the scan. " + failureText(error)); }
    finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  async function expire(window: Pending) {
    update(null);
    if (window.kind === "card") {
      show("Card scan expired. Scan the card again.");
      return;
    }
    if (window.item.stage !== "audio_passed") await save(window.item, "audio_passed", window.barcode, "", "");
    show("Time expired. Sewing and quality check complete. Scan the order again to pack it.");
  }

  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      setSeconds(Math.max(0, Math.ceil((pending.expires - Date.now()) / 1000)));
      if (!lock.current && current.current === pending && Date.now() >= pending.expires) void run(() => expire(pending));
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pair(item: ProductionItem, barcode: string, code: string) {
    const previous = current.current;
    player.current?.pause();
    try {
      await save(item, "packed", barcode, code, "");
      update(null);
      show("NFC card paired successfully. Order packed and ready for J and T pickup.", item);
    } catch (error) {
      if (previous?.kind === "card") update(null);
      show("Unable to pair. " + failureText(error), item);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = scan.trim();
    if (!value || lock.current) return;
    setScan("");
    void run(async () => {
      const previous = current.current;
      if (previous && Date.now() >= previous.expires) {
        await expire(previous);
        return;
      }
      const matches = items.filter(item => matchesProductionBarcode({ id: item.order_id, orderNumber: item.order?.orderNumber }, value));
      if (matches.length > 1) {
        show("This barcode matches multiple items. Scan the individual packing slip barcode.");
        return;
      }
      const item = matches[0];
      if (item) {
        if (previous?.kind === "order" && previous.item.id !== item.id) {
          show("Finish the current order or wait for its pairing window to expire.");
          return;
        }
        setSelected(item);
        setNote("");
        if (item.certificate_code || item.nfc_paired || ["packed", "collected", "delivered"].includes(item.stage)) {
          update(null);
          if (previous?.kind === "card") show("Unable to pair. This order already has an activated card.", item);
          else { setStatus("Already paired. Playing the saved recording for review."); play(item); }
          return;
        }
        if (item.issue || (item.disposition && item.disposition !== "active") || !["at_tailor", "returned", "audio_passed"].includes(item.stage)) {
          show("Unable to pair. " + (item.issue || "This order is not ready for packing."), item);
          return;
        }
        if (previous?.kind === "card") {
          await pair(item, value, previous.code);
          return;
        }
        if (!previous) update({ kind: "order", item, barcode: value, expires: Date.now() + 60000 });
        setStatus("Scan the NFC card within one minute.");
        play(item);
        return;
      }

      const code = value.toUpperCase();
      if (!/^NFC-\d{6,12}$/.test(code) && !(previous?.kind === "order" && /^\d{6}$/.test(code))) {
        show("Barcode not recognised. Scan a packing slip or an NFC card.");
        return;
      }
      if (code.startsWith("NFC-")) {
        try { await checkCard(code); }
        catch (error) { show("Unable to pair. " + failureText(error), previous?.kind === "order" ? previous.item : undefined); return; }
      }
      if (previous?.kind === "order") {
        if (Date.now() >= previous.expires) { await expire(previous); return; }
        await pair(previous.item, previous.barcode, code);
      } else {
        update({ kind: "card", code, expires: Date.now() + 60000 });
        show("Card ready. Scan the order within one minute.");
      }
    });
  }

  return <main>
    <h1>Barcode Scanner</h1>
    <p>Scan the order or NFC card first. Pairing completes sewing, quality check and packing.</p>
    <form onSubmit={submit}>
      <label>Scan order or NFC card<input ref={input} autoFocus value={scan} onChange={event => setScan(event.target.value)} disabled={busy} autoComplete="off" /></label>
      <button disabled={busy} type="submit">Scan</button>
    </form>
    {pending && <p>{seconds} seconds remaining · {pending.kind === "card" ? pending.code : "#" + (pending.item.order?.orderNumber || pending.item.order_id)}</p>}
    <p role="status">{status}</p>
    {selected && <p>#{String(selected.order?.orderNumber || selected.order_id)} · {String(selected.order?.plushName || selected.order?.character || "")}</p>}
    <audio ref={player} controls preload="none" />
    {selected?.issue && !pending && <details><summary>Manage order issue</summary>
      <label>Reason<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} /></label>
      {["resolve", "remove", "defer"].map(action => <button key={action} disabled={busy || note.trim().length < 3}
        onClick={() => void run(async () => { await save(selected, action, "", "", note); setSelected(null); show("Issue decision saved."); })}>{action === "resolve" ? "Resolve issue" : action === "remove" ? "Remove from queue" : "Leave for tomorrow"}</button>)}
    </details>}
  </main>;
}
