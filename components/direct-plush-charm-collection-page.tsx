"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

import styles from "./direct-manual-order-page.module.css";

type Charm = { character: "Penny" | "Renny" | "Benny"; productKey: string; seconds: 5 | 10 | 20 };
type Reply = { ok?: boolean; error?: string; session?: { token: string }; upload?: { signedUrl: string; path: string }; reference?: string; whatsAppUrl?: string };

const states = ["Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu"];
const eastStates = new Set(["Sabah", "Sarawak", "Labuan"]);
const MAX_VOICE_BYTES = 200 * 1024 * 1024;

async function request(body: Record<string, unknown>, collectionCode: string): Promise<Reply> {
  const response = await fetch("/apps/customise-your-plushie/manual-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, collectionCode }) });
  const data = await response.json().catch(() => ({})) as Reply;
  if (!response.ok || !data.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function DirectPlushCharmCollectionPage({ charm, collectionCode, orderSummaryVideo }: { charm: Charm; collectionCode: string; orderSummaryVideo?: string }) {
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [province, setProvince] = useState(states[0]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const shippingRegion = eastStates.has(province) ? "EAST" : "WEST";

  useEffect(() => {
    if (!voice) return setVoiceUrl("");
    const url = URL.createObjectURL(voice); setVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voice]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  function chooseVoice(file?: File) {
    if (!file) return;
    if (file.size > MAX_VOICE_BYTES) return setNotice("Your voice message must be 200 MB or smaller.");
    setVoice(file); setNotice("");
  }
  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setNotice("Voice recording is not available here. Please upload an audio file instead.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream); chunks.current = []; setSeconds(0);
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; stream.getTracks().forEach((track) => track.stop()); const type = next.mimeType || "audio/webm"; chooseVoice(new File([new Blob(chunks.current, { type })], `plush-charm-voice-${Date.now()}.webm`, { type })); setRecording(false); };
      recorder.current = next; next.start(); setRecording(true); const began = Date.now();
      timer.current = setInterval(() => { const elapsed = Math.min(charm.seconds, (Date.now() - began) / 1000); setSeconds(elapsed); if (elapsed >= charm.seconds && next.state === "recording") next.stop(); }, 80);
    } catch { setNotice("Please allow microphone access or upload an audio file."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!voice?.size) return setNotice("Please record or choose a voice message.");
    setSaving(true); setNotice("Saving your details…");
    try {
      const data = new FormData(form); const started = await request({ action: "start" }, collectionCode);
      if (!started.session?.token) throw new Error("Could not start your order.");
      const upload = await request({ action: "prepare_voice_upload", sessionToken: started.session.token, fileName: voice.name, contentType: voice.type || "audio/webm" }, collectionCode);
      if (!upload.upload?.signedUrl || !upload.upload.path) throw new Error("Could not prepare your voice message.");
      const put = await fetch(upload.upload.signedUrl, { method: "PUT", headers: { "Content-Type": voice.type || "application/octet-stream" }, body: voice });
      if (!put.ok) throw new Error("Your voice message could not be uploaded. Please try again.");
      const saved = await request({ action: "submit", sessionToken: started.session.token, voiceStoragePath: upload.upload.path, customerName: data.get("customerName"), customerEmail: data.get("customerEmail"), phone: data.get("phone"), character: charm.character, productKey: charm.productKey, shippingRegion, shippingAddress: { address1: data.get("address1"), address2: data.get("address2"), city: data.get("city"), province, zip: data.get("zip"), countryCode: "MY" }, form: {} }, collectionCode);
      setNotice(`Your Plush Charm details are saved. Your reference is ${saved.reference || "MP-REFERENCE"}.`);
      if (saved.whatsAppUrl) window.location.assign(saved.whatsAppUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your details could not be saved."); }
    finally { setSaving(false); }
  }

  return <main className={styles.page}><header className={styles.header}><Link href="/" className={styles.brand}>MEANINGFUL PLUSHIES</Link></header><form className={styles.form} onSubmit={submit}>
    <h1>CUSTOMISE YOUR PLUSH CHARM</h1>
    {orderSummaryVideo ? <video className={styles.orderSummaryVideo} autoPlay loop muted playsInline preload="metadata"><source src={orderSummaryVideo} type="video/mp4" /></video> : null}
    <div className={styles.lockedProduct}><span>YOUR PLUSH CHARM</span><strong>{charm.character} · {charm.seconds} seconds voice</strong></div>
    <section className={styles.voiceSection}><span>YOUR VOICE MESSAGE</span><div className={styles.voiceModeButtons}><button className={mode === "record" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => setMode("record")}>RECORD VOICE</button><button className={mode === "upload" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => { if (recording) recorder.current?.stop(); setMode("upload"); }}>UPLOAD AUDIO</button></div>
      {mode === "record" ? <div className={styles.voicePanel}><button className={recording ? styles.recordingButton : styles.recordButton} type="button" onClick={() => void record()}>{recording ? "STOP RECORDING" : "RECORD VOICE"}</button>{recording ? <div className={styles.recordingProgress}><div className={styles.recordingProgressTop}><span className={styles.recordingStatus}>RECORDING NOW</span><strong>{Math.floor(seconds)}/{charm.seconds} seconds</strong></div><div className={styles.progressTrack}><span className={styles.progressFill} style={{ width: `${Math.min(100, seconds / charm.seconds * 100)}%` }} /></div></div> : null}</div> : <label className={styles.audioDropZone}><strong>OPEN FILES</strong><span>Choose or drag your audio file here</span><input type="file" accept="audio/*" onChange={(event) => chooseVoice(event.target.files?.[0])} /></label>}
      {voice ? <div className={styles.voicePreview}><p>Voice message ready: {voice.name}</p><audio controls src={voiceUrl} /></div> : null}</section>
    <h2>YOUR SHIPPING INFORMATION</h2><label>Full Name<input required name="customerName" autoComplete="name" /></label><label>Phone Number<input required name="phone" inputMode="tel" autoComplete="tel" /></label><label>Email<input required name="customerEmail" type="email" autoComplete="email" /></label><label>Address<input required name="address1" autoComplete="address-line1" /></label><label>Address Line 2 <small>Optional</small><input name="address2" autoComplete="address-line2" /></label><label>City<input required name="city" autoComplete="address-level2" /></label><label>State<select value={province} onChange={(event) => setProvince(event.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></label><label>Postcode<input required name="zip" inputMode="numeric" autoComplete="postal-code" /></label><label>Delivery Region<input readOnly value={shippingRegion === "EAST" ? "East Malaysia" : "West Malaysia"} /></label>
    <button className={styles.submit} disabled={saving}>{saving ? "SAVING YOUR DETAILS…" : "SAVE MY CUSTOMISATION"}</button><p className={notice.includes("saved") ? styles.success : styles.notice} aria-live="polite">{notice}</p>
  </form></main>;
}
