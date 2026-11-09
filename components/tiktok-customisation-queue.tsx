"use client";

import { useEffect, useRef, useState } from "react";
import { parseTikTokDetailsBlock } from "../lib/importer";
import { mediaFileExtension, voiceBackupFileName } from "../lib/voice-file-name";
import { compactOrderLabel } from "../lib/table-layout";
import type { Order } from "../lib/types";
import styles from "./tiktok-customisation-queue.module.css";

const fields = [
  ["customerName", "Username"], ["plushName", "Plushie's Name"],
  ["plushGender", "Plushie's Gender"], ["plushBirthDate", "Plushie's Birth Date"],
  ["plushBirthPlace", "Plushie's Birth Place"], ["plushFavouritePerson", "Plushie's Favourite Person"],
  ["plushBelongsTo", "Plushie Belongs to"], ["character", "Character"],
] as const;
const placeholder = "Nama Plushie - Mochi\nJantina Plushie - Female\nTarikh Lahir Plushie - 28/6/2025\nTempat Lahir Plushie - Perak\nOrang Kegemaran Plushie - Panda shomel\nMainan lembut itu milik... Ayangku\nNota bermakna - Your message here";

export function TikTokCustomisationQueue({ orders, onSave, onFinish, onDirtyChange }: {
  onDirtyChange?: (dirty: boolean) => void;
  orders: Order[];
  onFinish: (order: Order) => Promise<void>;
  onSave: (id: string, patch: Partial<Order>, expectedUpdatedAt: string) => Promise<Order>;
}) {
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingSelection, setPendingSelection] = useState("");
  const [completion, setCompletion] = useState("");
  const order = orders.find(item => item.id === selected) || orders[0];
  useEffect(() => { onDirtyChange?.(Boolean(order) && dirty); }, [dirty, onDirtyChange, order]);
  function select(id: string) {
    if (id === order?.id) return;
    if (dirty) { setPendingSelection(id); return; }
    setDirty(false);
    setSelected(id);
  }
  function showNextItem(finished: Order) {
    const next = orders.find(item => item.id !== finished.id && item.orderNumber === finished.orderNumber);
    if (next) setSelected(next.id);
    setCompletion(next
      ? `${compactOrderLabel(finished)} moved to New Order. Now customising ${compactOrderLabel(next)}.`
      : `${compactOrderLabel(finished)} moved to New Order.`);
  }
  if (!order) return completion ? <p role="status">{completion}</p> : null;
  return <section className={styles.queue} aria-label="TikTok awaiting customisation">
    <div><h2>Awaiting Customisation</h2><p>Choose an order, paste the customer details and check the preview. The order ID is already filled in.</p></div>
    <label className={styles.choose}>Order to customise<select value={order.id} onChange={event => select(event.target.value)}>{orders.map(item => <option key={item.id} value={item.id}>{compactOrderLabel(item)} · {item.customerName || "TikTok customer"}</option>)}</select></label>
    {pendingSelection && <div role="alert" className={styles.actions}><span>This order has unsaved details.</span><button type="button" className="button secondary" onClick={() => setPendingSelection("")}>Keep editing</button><button type="button" className="button danger" onClick={() => { setDirty(false); setSelected(pendingSelection); setPendingSelection(""); }}>Discard and switch order</button></div>}
    {completion && <p role="status">{completion}</p>}
    <CustomisationEditor key={order.id} order={order} onSave={async (id, patch, version) => {
      const saved = await onSave(id, patch, version);
      if (saved.status === "new_order") showNextItem(order);
      return saved;
    }} onFinish={async finished => {
      await onFinish(finished);
      showNextItem(finished);
    }} onDirty={setDirty} />
  </section>;
}

function CustomisationEditor({ order, onSave, onFinish, onDirty }: {
  order: Order;
  onFinish: (order: Order) => Promise<void>;
  onSave: (id: string, patch: Partial<Order>, expectedUpdatedAt: string) => Promise<Order>;
  onDirty: (dirty: boolean) => void;
}) {
  // Keep the version from the start of the draft. A realtime update must never
  // silently overwrite staff changes or remove the existing media attachment.
  const baseline = useRef(order);
  const [patch, setPatch] = useState<Partial<Order>>({});
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const dirty = Object.keys(patch).length > 0;
  const draft = { ...baseline.current, ...patch };
  useEffect(() => { onDirty(dirty || reading); }, [dirty, reading, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(changes: Partial<Order>) {
    setPatch(current => ({ ...current, ...changes }));
    setMessage("");
  }
  function paste(value: string) {
    setText(value);
    const parsed = parseTikTokDetailsBlock(value);
    const changes: Partial<Order> = {};
    const mapped = { customerName: parsed.username, plushName: parsed.plushName, plushGender: parsed.gender,
      plushBirthDate: parsed.birthDate, plushBirthPlace: parsed.birthPlace, plushFavouritePerson: parsed.favouritePerson,
      plushBelongsTo: parsed.belongsTo, meaningfulNote: parsed.meaningfulNote };
    // Missing fields in a pasted message do not erase details already entered.
    for (const [key, field] of Object.entries(mapped)) if (field) Object.assign(changes, { [key]: field });
    if (Object.keys(changes).length) edit(changes);
  }
  function upload(file?: File) {
    if (!file || busy.current) return;
    if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?|amr|mp4|mov|webm|mkv|m4v)$/i.test(file.name)) return setMessage("Please choose an audio or video recording.");
    if (file.size > 5_000_000) return setMessage("Please choose a voice file smaller than 5 MB.");
    busy.current = true;
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => edit({ tikTokFileDataUrl: String(reader.result),
      tikTokFileName: voiceBackupFileName(draft, mediaFileExtension(file.name, file.type, String(reader.result))),
      tikTokFileType: file.type || "application/octet-stream" });
    reader.onerror = () => setMessage("The file could not be read. Please choose it again.");
    reader.onloadend = () => { busy.current = false; setReading(false); };
    reader.readAsDataURL(file);
  }
  async function save() {
    if (busy.current || !dirty) return;
    busy.current = true;
    setSaving(true);
    try {
      const saved = await onSave(order.id, patch, baseline.current.updatedAt);
      baseline.current = { ...draft, ...saved };
      setPatch({});
      setMessage(saved.status === "new_order" ? "Saved. This order is now in New Order." : "Details saved. Add the remaining plushie details and voice to move to New Order.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Your draft is kept."); }
    finally { busy.current = false; setSaving(false); }
  }
  const locked = saving || reading;
  async function finish() {
    if (busy.current || dirty) return;
    busy.current = true; setSaving(true);
    try { await onFinish(baseline.current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not finish customisation."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <article className="tiktok-detail-entry">
    <header className="tiktok-detail-entry-header"><strong>{compactOrderLabel(order)} · TikTok plushie details</strong><span>Awaiting Customisation</span></header>
    <label>Order ID<input readOnly value={order.orderNumber.match(/\d{8,}/)?.[0] || order.orderNumber} /></label>
    <label>Paste customer details<textarea disabled={locked} value={text} onChange={event => paste(event.target.value)} placeholder={placeholder} className={styles.paste} /></label>
    <div className="tiktok-detail-preview"><strong>Editable preview</strong>
      {fields.map(([key, label]) => <label key={key}>{label}<input disabled={locked} value={draft[key] || ""} onChange={event => edit({ [key]: event.target.value })} /></label>)}
      <label>Voice length (seconds)<input disabled={locked} type="number" min="0" max="86400" value={draft.voiceLength || ""} onChange={event => edit({ voiceLength: Number(event.target.value) || 0 })} /></label>
      <label className="wide">Meaningful Note<textarea disabled={locked} value={draft.meaningfulNote || ""} onChange={event => edit({ meaningfulNote: event.target.value })} /></label>
    </div>
    <label>Customer voice</label>
    <button type="button" className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`} disabled={locked}
      onClick={() => fileInput.current?.click()}
      onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (locked) return; if (event.dataTransfer.files.length !== 1) { setMessage("Please drop one recording at a time."); return; } upload(event.dataTransfer.files[0]); }}>
      <strong>{reading ? "Reading recording…" : "Drag your audio or video here"}</strong>
      <span>or click to choose a file</span><small>Audio or video · up to 5 MB</small>
    </button>
    <input ref={fileInput} type="file" aria-label="Choose customer voice" accept="audio/*,video/*" hidden disabled={locked} onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} />
    <small>{draft.tikTokFileName ? `Attached: ${draft.tikTokFileName}` : "Choose the customer's audio or video recording."}</small>
    <p>Save the voice, plush name and character to move this order to New Order. You can save incomplete details and finish later.</p>
    <p>If this order was returned here to correct a mistake, save your corrections, then choose Finish customisation to move it back to New Order.</p>
    <button type="button" className="button secondary" disabled={dirty || locked} onClick={() => void finish()}>Finish customisation</button>
    <div className={styles.actions}><button type="button" className="button primary" disabled={!dirty || locked} onClick={() => void save()}>{reading ? "Reading voice..." : saving ? "Saving..." : "Save customisation"}</button>{dirty && <><button type="button" className="button secondary" disabled={locked} onClick={() => setDiscarding(true)}>Discard draft</button><span>Unsaved changes</span></>}</div>
    {discarding && <div className={styles.actions} role="alert"><span>Discard these unsaved changes?</span><button type="button" className="button secondary" onClick={() => setDiscarding(false)}>Keep editing</button><button type="button" className="button danger" disabled={locked} onClick={() => {
      baseline.current = order;
      setPatch({}); setText(""); setMessage(""); setDiscarding(false);
    }}>Discard changes</button></div>}
    <p role="status">{message}</p>
  </article>;
}
