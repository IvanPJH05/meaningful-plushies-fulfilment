"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

import styles from "./direct-manual-order-page.module.css";

type Charm = { character: "Penny" | "Renny" | "Benny"; productKey: string; seconds: 5 | 10 | 20 };
type Reply = { ok?: boolean; error?: string; session?: { token: string }; upload?: { signedUrl: string; path: string }; reference?: string; whatsAppUrl?: string };
type Language = "en" | "ms";

const states = ["Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu"];
const eastStates = new Set(["Sabah", "Sarawak", "Labuan"]);
const MAX_VOICE_BYTES = 200 * 1024 * 1024;

const translations = {
  en: {
    title: "CUSTOMISE YOUR PLUSH CHARM", yourCharm: "YOUR PLUSH CHARM", secondsVoice: "seconds voice", voiceMessage: "YOUR VOICE MESSAGE",
    recordVoice: "RECORD VOICE", stopRecording: "STOP RECORDING", uploadAudio: "UPLOAD AUDIO", chooseAudio: "OPEN FILES", dragAudio: "Choose or drag your audio file here", voiceReady: "Voice message ready:", playback: "Listen to your message", uploadHint: "Maximum 200 MB.", recordingNow: "RECORDING NOW", seconds: "seconds",
    voiceTooLarge: "Your voice message must be 200 MB or smaller.", missingVoice: "Please record or choose a voice message.", recordingUnavailable: "Voice recording is not available in this browser. Please upload an audio file instead.", recordingError: "We could not start the voice recording. Please allow microphone access or upload an audio file.",
    shipping: "YOUR SHIPPING INFORMATION", fullName: "Full Name", fullNamePlaceholder: "Your full name", phone: "Phone Number", email: "Email", emailPlaceholder: "Your email address", address: "Address", addressPlaceholder: "House number, street, area", addressLine2: "Address Line 2", optional: "Optional", addressLine2Placeholder: "Apartment, unit, etc.", city: "City", cityPlaceholder: "Your city", state: "State", postcode: "Postcode", postcodePlaceholder: "Your postcode", deliveryRegion: "Delivery Region", westMalaysia: "West Malaysia", eastMalaysia: "East Malaysia",
    saving: "SAVING YOUR DETAILS…", savingDetails: "Saving your details…", submit: "SAVE MY CUSTOMISATION", saved: "Your Plush Charm details are saved. Your reference is", openingWhatsApp: "Opening WhatsApp now…", sendWhatsApp: "Please send this reference to us on WhatsApp.", saveFailed: "Your details could not be saved.", terms: "Terms and Policies",
  },
  ms: {
    title: "SESUAIKAN PLUSH CHARM ANDA", yourCharm: "PLUSH CHARM ANDA", secondsVoice: "saat suara", voiceMessage: "MESEJ SUARA ANDA",
    recordVoice: "RAKAM SUARA", stopRecording: "HENTIKAN RAKAMAN", uploadAudio: "MUAT NAIK AUDIO", chooseAudio: "BUKA FAIL", dragAudio: "Pilih atau seret fail audio anda di sini", voiceReady: "Mesej suara sedia:", playback: "Dengar mesej anda", uploadHint: "Maksimum 200 MB.", recordingNow: "SEDANG MERAKAM", seconds: "saat",
    voiceTooLarge: "Mesej suara anda mestilah 200 MB atau lebih kecil.", missingVoice: "Sila rakam atau pilih mesej suara.", recordingUnavailable: "Rakaman suara tidak tersedia dalam pelayar ini. Sila muat naik fail audio.", recordingError: "Rakaman suara tidak dapat dimulakan. Sila benarkan mikrofon atau muat naik fail audio.",
    shipping: "MAKLUMAT PENGHANTARAN ANDA", fullName: "Nama Penuh", fullNamePlaceholder: "Nama penuh anda", phone: "Nombor Telefon", email: "E-mel", emailPlaceholder: "Alamat e-mel anda", address: "Alamat", addressPlaceholder: "Nombor rumah, jalan, kawasan", addressLine2: "Alamat Baris 2", optional: "Pilihan", addressLine2Placeholder: "Apartmen, unit dan lain-lain", city: "Bandar", cityPlaceholder: "Bandar anda", state: "Negeri", postcode: "Poskod", postcodePlaceholder: "Poskod anda", deliveryRegion: "Kawasan Penghantaran", westMalaysia: "Semenanjung Malaysia", eastMalaysia: "Malaysia Timur",
    saving: "MENYIMPAN MAKLUMAT ANDA…", savingDetails: "Menyimpan maklumat anda…", submit: "SIMPAN PENYESUAIAN SAYA", saved: "Maklumat Plush Charm anda telah disimpan. Rujukan anda ialah", openingWhatsApp: "Membuka WhatsApp sekarang…", sendWhatsApp: "Sila hantar rujukan ini kepada kami melalui WhatsApp.", saveFailed: "Maklumat anda tidak dapat disimpan.", terms: "Terma dan Polisi",
  },
} as const;

async function request(body: Record<string, unknown>, collectionCode: string): Promise<Reply> {
  const response = await fetch("/apps/customise-your-plushie/manual-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, collectionCode }) });
  const data = await response.json().catch(() => ({})) as Reply;
  if (!response.ok || !data.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function DirectPlushCharmCollectionPage({ charm, collectionCode, orderSummaryVideo }: { charm: Charm; collectionCode: string; orderSummaryVideo?: string }) {
  const [language, setLanguage] = useState<Language>("en");
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [draggingAudio, setDraggingAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [province, setProvince] = useState(states[0]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const copy = translations[language];
  const shippingRegion = eastStates.has(province) ? "EAST" : "WEST";

  useEffect(() => {
    if (!voice) return setVoiceUrl("");
    const url = URL.createObjectURL(voice); setVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voice]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  function chooseVoice(file?: File) {
    if (!file) return;
    if (file.size > MAX_VOICE_BYTES) return setNotice(copy.voiceTooLarge);
    setVoice(file); setNotice("");
  }
  function stopRecording() { if (recorder.current?.state === "recording") recorder.current.stop(); }
  async function record() {
    if (recording) return stopRecording();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setNotice(copy.recordingUnavailable);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream); chunks.current = []; setSeconds(0);
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; stream.getTracks().forEach((track) => track.stop()); const type = next.mimeType || "audio/webm"; chooseVoice(new File([new Blob(chunks.current, { type })], `plush-charm-voice-${Date.now()}.webm`, { type })); setRecording(false); };
      recorder.current = next; next.start(); setRecording(true); const began = Date.now();
      timer.current = setInterval(() => { const elapsed = Math.min(charm.seconds, (Date.now() - began) / 1000); setSeconds(elapsed); if (elapsed >= charm.seconds && next.state === "recording") next.stop(); }, 80);
    } catch { setNotice(copy.recordingError); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!voice?.size) return setNotice(copy.missingVoice);
    setSaving(true); setNotice(copy.savingDetails);
    try {
      const data = new FormData(form); const started = await request({ action: "start" }, collectionCode);
      if (!started.session?.token) throw new Error(copy.saveFailed);
      const upload = await request({ action: "prepare_voice_upload", sessionToken: started.session.token, fileName: voice.name, contentType: voice.type || "audio/webm" }, collectionCode);
      if (!upload.upload?.signedUrl || !upload.upload.path) throw new Error(copy.saveFailed);
      const put = await fetch(upload.upload.signedUrl, { method: "PUT", headers: { "Content-Type": voice.type || "application/octet-stream" }, body: voice });
      if (!put.ok) throw new Error(copy.saveFailed);
      const saved = await request({ action: "submit", sessionToken: started.session.token, voiceStoragePath: upload.upload.path, customerName: data.get("customerName"), customerEmail: data.get("customerEmail"), phone: data.get("phone"), character: charm.character, productKey: charm.productKey, shippingRegion, shippingAddress: { address1: data.get("address1"), address2: data.get("address2"), city: data.get("city"), province, zip: data.get("zip"), countryCode: "MY" }, form: {} }, collectionCode);
      const reference = saved.reference || "MP-REFERENCE";
      setNotice(saved.whatsAppUrl ? `${copy.saved} ${reference}. ${copy.openingWhatsApp}` : `${copy.saved} ${reference}. ${copy.sendWhatsApp}`);
      if (saved.whatsAppUrl) window.location.assign(saved.whatsAppUrl);
    } catch (error) { setNotice(error instanceof Error && error.message ? error.message : copy.saveFailed); }
    finally { setSaving(false); }
  }

  return <main className={styles.page}><header className={styles.header}><Link href="/" className={styles.brand}>MEANINGFUL PLUSHIES</Link><div className={styles.languageButtons} aria-label="Language"><button className={language === "en" ? styles.languageActive : styles.languageButton} type="button" onClick={() => setLanguage("en")}>ENGLISH</button><button className={language === "ms" ? styles.languageActive : styles.languageButton} type="button" onClick={() => setLanguage("ms")}>MALAY</button></div></header><form className={styles.form} onSubmit={submit}>
    <h1>{copy.title}</h1>
    {orderSummaryVideo ? <video className={styles.orderSummaryVideo} autoPlay loop muted playsInline preload="metadata"><source src={orderSummaryVideo} type="video/mp4" /></video> : null}
    <div className={styles.lockedProduct}><span>{copy.yourCharm}</span><strong>{charm.character} · {charm.seconds} {copy.secondsVoice}</strong></div>
    <section className={styles.voiceSection} aria-label={copy.voiceMessage}><span>{copy.voiceMessage}</span><div className={styles.voiceModeButtons}><button className={mode === "record" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => setMode("record")}>{copy.recordVoice}</button><button className={mode === "upload" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => { stopRecording(); setMode("upload"); }}>{copy.uploadAudio}</button></div>
      {mode === "record" ? <div className={styles.voicePanel}><button className={recording ? styles.recordingButton : styles.recordButton} type="button" onClick={() => void record()}>{recording ? copy.stopRecording : copy.recordVoice}</button>{recording ? <div className={styles.recordingProgress}><div className={styles.recordingProgressTop}><span className={styles.recordingStatus}>{copy.recordingNow}</span><strong>{Math.floor(seconds)}/{charm.seconds} {copy.seconds}</strong></div><div className={styles.progressTrack}><span className={styles.progressFill} style={{ width: `${Math.min(100, seconds / charm.seconds * 100)}%` }} /></div></div> : null}</div> : <label className={draggingAudio ? styles.audioDropActive : styles.audioDropZone} onDragOver={(event) => { event.preventDefault(); setDraggingAudio(true); }} onDragLeave={() => setDraggingAudio(false)} onDrop={(event) => { event.preventDefault(); setDraggingAudio(false); chooseVoice(event.dataTransfer.files?.[0]); }}><strong>{copy.chooseAudio}</strong><span>{copy.dragAudio}</span><input type="file" accept="audio/*" onChange={(event) => chooseVoice(event.target.files?.[0])} /></label>}
      <small>{copy.uploadHint}</small>{voice ? <div className={styles.voicePreview}><p>{copy.voiceReady} {voice.name}</p><label>{copy.playback}<audio controls src={voiceUrl} /></label></div> : null}</section>
    <h2>{copy.shipping}</h2><label>{copy.fullName}<input required name="customerName" autoComplete="name" placeholder={copy.fullNamePlaceholder} /></label><label>{copy.phone}<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="0123456789" /></label><label>{copy.email}<input required name="customerEmail" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} /></label><label>{copy.address}<input required name="address1" autoComplete="address-line1" placeholder={copy.addressPlaceholder} /></label><label>{copy.addressLine2} <small>{copy.optional}</small><input name="address2" autoComplete="address-line2" placeholder={copy.addressLine2Placeholder} /></label><label>{copy.city}<input required name="city" autoComplete="address-level2" placeholder={copy.cityPlaceholder} /></label><label>{copy.state}<select value={province} onChange={(event) => setProvince(event.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></label><label>{copy.postcode}<input required name="zip" inputMode="numeric" autoComplete="postal-code" placeholder={copy.postcodePlaceholder} /></label><label>{copy.deliveryRegion}<input readOnly value={shippingRegion === "EAST" ? copy.eastMalaysia : copy.westMalaysia} /></label>
    <button className={styles.submit} disabled={saving}>{saving ? copy.saving : copy.submit}</button><p className={notice.includes("saved") || notice.includes("disimpan") ? styles.success : styles.notice} aria-live="polite">{notice}</p><footer><Link href="/policies/terms-of-service">{copy.terms}</Link><span>© 2026 MEANINGFUL PLUSHIES</span></footer>
  </form></main>;
}
