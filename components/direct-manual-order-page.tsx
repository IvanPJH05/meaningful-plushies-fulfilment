"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

import styles from "./direct-manual-order-page.module.css";

type ApiReply = {
  ok?: boolean;
  error?: string;
  session?: { token: string };
  upload?: { signedUrl: string; path: string };
  reference?: string;
  whatsAppUrl?: string;
};

export type LockedPlushie = {
  character: "Billy" | "Tootsie" | "Dragon Warrior" | "Hunnie";
  productKey: "plushie_5s" | "plushie_10s" | "plushie_20s";
};

const states = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang",
  "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu",
];

const eastMalaysiaStates = new Set(["Sabah", "Sarawak", "Labuan"]);

const MAX_VOICE_BYTES = 200 * 1024 * 1024;

function formatBirthDate(date: Date) {
  return date.toLocaleDateString("en-GB");
}

function parseBirthDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return day && month && year ? new Date(year, month - 1, day) : new Date();
}

function titleCaseWords(value: string) {
  return value.replace(/(^|[\s-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

function BirthDatePicker({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [shownMonth, setShownMonth] = useState(() => parseBirthDate(value));
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const latestYear = new Date().getFullYear() + 1;

  function setMonth(nextMonth: number, nextYear = year) {
    setShownMonth(new Date(nextYear, nextMonth, 1));
  }

  return <div className={styles.datePicker}>
    <button type="button" className={value ? styles.dateTriggerFilled : styles.dateTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setShownMonth(parseBirthDate(value)); setOpen((current) => !current); }}>{value || placeholder}</button>
    {open && <div className={styles.calendar} role="dialog" aria-label="Choose plushie's birth date">
      <div className={styles.calendarHeader}>
        <button type="button" aria-label="Previous month" onClick={() => setMonth(month === 0 ? 11 : month - 1, month === 0 ? year - 1 : year)}>‹</button>
        <div><select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(year, index, 1).toLocaleDateString("en-GB", { month: "long" })}</option>)}</select><select aria-label="Year" value={year} onChange={(event) => setMonth(month, Number(event.target.value))}>{Array.from({ length: latestYear - 1900 + 1 }, (_, index) => latestYear - index).map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}</select></div>
        <button type="button" aria-label="Next month" onClick={() => setMonth(month === 11 ? 0 : month + 1, month === 11 ? year + 1 : year)}>›</button>
      </div>
      <div className={styles.calendarGrid}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className={styles.calendarWeekday}>{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const selected = formatBirthDate(new Date(year, month, day)) === value;
        return <button key={day} type="button" className={selected ? styles.calendarDaySelected : styles.calendarDay} onClick={() => { onChange(formatBirthDate(new Date(year, month, day))); setOpen(false); }}>{day}</button>;
      })}</div>
    </div>}
  </div>;
}

const translations = {
  en: {
    title: "CUSTOMISE YOUR PLUSHIE", certificate: "YOUR PLUSHIE'S BIRTH CERTIFICATE", yourPlushie: "YOUR PLUSHIE", character: "Character", voiceLength: "Voice Length", secondsVoice: "seconds voice",
    plushName: "Plushie's Name", plushNamePlaceholder: "Name your plushie", gender: "Plushie's Gender", male: "Male", female: "Female", birthDate: "Plushie's Birth Date", birthDatePlaceholder: "A meaningful date", birthPlace: "Plushie's Birth Place", birthPlacePlaceholder: "A meaningful place",
    favouritePerson: "Plushie's Favourite Person", favouritePersonPlaceholder: "A meaningful person", belongsTo: "Plushie Belongs To", belongsToPlaceholder: "The plushie's owner", meaningfulNote: "Meaningful Note", meaningfulNotePlaceholder: "A message for the plushie's owner",
    uploadVoice: "Your Voice Message", recordVoice: "RECORD VOICE", stopRecording: "STOP RECORDING", uploadAudio: "UPLOAD AUDIO", chooseAudio: "OPEN FILES", dragAudio: "Drag and drop your audio file here", playback: "Listen to your message", uploadHint: "Maximum 200 MB.", voiceReady: "Voice message ready:", recording: "Recording… tap Stop recording when you are done.", recordingNow: "RECORDING NOW", seconds: "seconds", recordingUnavailable: "Voice recording is not available in this browser. Please upload an audio file instead.", recordingError: "We could not start the voice recording. Please allow microphone access or upload an audio file.", shipping: "YOUR SHIPPING INFORMATION", fullName: "Full Name", fullNamePlaceholder: "Your full name", phone: "Phone Number", email: "Email", emailPlaceholder: "Your email address",
    address: "Address", addressPlaceholder: "House number, street, area", addressLine2: "Address Line 2", optional: "Optional", addressLine2Placeholder: "Apartment, unit, etc.", city: "City", cityPlaceholder: "Your city", state: "State", postcode: "Postcode", postcodePlaceholder: "Your postcode", deliveryRegion: "Delivery Region", westMalaysia: "West Malaysia", eastMalaysia: "East Malaysia",
    saving: "SAVING YOUR DETAILS…", submit: "SAVE MY CUSTOMISATION", terms: "Terms and Policies", missingVoice: "Please record or choose a voice message for your plushie.", voiceTooLarge: "Your voice message must be 200 MB or smaller.", savingDetails: "Saving your details…", saved: "Your details are saved. Your reference is", openingWhatsApp: "Opening WhatsApp now…", sendWhatsApp: "Please send this reference to us on WhatsApp.", saveFailed: "Your details could not be saved.",
  },
  ms: {
    title: "SESUAIKAN PLUSHIE ANDA", certificate: "SIJIL KELAHIRAN PLUSHIE ANDA", yourPlushie: "PLUSHIE ANDA", character: "Watak", voiceLength: "Tempoh Suara", secondsVoice: "saat suara",
    plushName: "Nama Plushie", plushNamePlaceholder: "Namakan plushie anda", gender: "Jantina Plushie", male: "Lelaki", female: "Perempuan", birthDate: "Tarikh Lahir Plushie", birthDatePlaceholder: "Tarikh yang bermakna", birthPlace: "Tempat Lahir Plushie", birthPlacePlaceholder: "Tempat yang bermakna",
    favouritePerson: "Orang Kegemaran Plushie", favouritePersonPlaceholder: "Orang yang bermakna", belongsTo: "Plushie Milik", belongsToPlaceholder: "Pemilik plushie", meaningfulNote: "Nota Bermakna", meaningfulNotePlaceholder: "Pesanan untuk pemilik plushie",
    uploadVoice: "Mesej Suara Anda", recordVoice: "RAKAM SUARA", stopRecording: "HENTIKAN RAKAMAN", uploadAudio: "MUAT NAIK AUDIO", chooseAudio: "BUKA FAIL", dragAudio: "Seret dan lepaskan fail audio anda di sini", playback: "Dengar mesej anda", uploadHint: "Maksimum 200 MB.", voiceReady: "Mesej suara sedia:", recording: "Sedang merakam… tekan Hentikan rakaman apabila selesai.", recordingNow: "SEDANG MERAKAM", seconds: "saat", recordingUnavailable: "Rakaman suara tidak tersedia dalam pelayar ini. Sila muat naik fail audio.", recordingError: "Rakaman suara tidak dapat dimulakan. Sila benarkan mikrofon atau muat naik fail audio.", shipping: "MAKLUMAT PENGHANTARAN ANDA", fullName: "Nama Penuh", fullNamePlaceholder: "Nama penuh anda", phone: "Nombor Telefon", email: "E-mel", emailPlaceholder: "Alamat e-mel anda",
    address: "Alamat", addressPlaceholder: "Nombor rumah, jalan, kawasan", addressLine2: "Alamat Baris 2", optional: "Pilihan", addressLine2Placeholder: "Apartmen, unit dan lain-lain", city: "Bandar", cityPlaceholder: "Bandar anda", state: "Negeri", postcode: "Poskod", postcodePlaceholder: "Poskod anda", deliveryRegion: "Kawasan Penghantaran", westMalaysia: "Semenanjung Malaysia", eastMalaysia: "Malaysia Timur",
    saving: "MENYIMPAN MAKLUMAT ANDA…", submit: "SIMPAN PENYESUAIAN SAYA", terms: "Terma dan Polisi", missingVoice: "Sila rakam atau pilih mesej suara untuk plushie anda.", voiceTooLarge: "Mesej suara anda mestilah 200 MB atau lebih kecil.", savingDetails: "Menyimpan maklumat anda…", saved: "Maklumat anda telah disimpan. Rujukan anda ialah", openingWhatsApp: "Membuka WhatsApp sekarang…", sendWhatsApp: "Sila hantar rujukan ini kepada kami melalui WhatsApp.", saveFailed: "Maklumat anda tidak dapat disimpan.",
  },
} as const;

async function request(apiUrl: string, body: Record<string, unknown>, collectionCode?: string): Promise<ApiReply> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectionCode ? { ...body, collectionCode } : body),
  });
  const data = await response.json().catch(() => ({})) as ApiReply;
  if (!response.ok || !data.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function DirectManualOrderPage({
  lockedPlushie,
  apiUrl = "/apps/closer/manual-order",
  collectionCode,
  orderSummaryVideo,
}: {
  lockedPlushie?: LockedPlushie;
  apiUrl?: string;
  collectionCode?: string;
  orderSummaryVideo?: string;
}) {
  const [language, setLanguage] = useState<keyof typeof translations>("en");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceMode, setVoiceMode] = useState<"record" | "upload">("record");
  const [draggingAudio, setDraggingAudio] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [province, setProvince] = useState(states[0]);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = translations[language];
  const voiceSeconds = Number(lockedPlushie?.productKey.match(/\d+/)?.[0] || 20);
  const shippingRegion = eastMalaysiaStates.has(province) ? "EAST" : "WEST";

  useEffect(() => {
    if (!voice) return setVoiceUrl("");
    const url = URL.createObjectURL(voice);
    setVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voice]);

  useEffect(() => () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  function clearRecordingTimers() {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    recordingTimer.current = null;
    stopTimer.current = null;
  }

  function selectVoice(file?: File) {
    if (!file) return;
    if (file.size > MAX_VOICE_BYTES) return setNotice(copy.voiceTooLarge);
    setVoice(file);
    setNotice("");
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setNotice(copy.recordingUnavailable);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      chunks.current = [];
      setRecordedSeconds(0);
      setLimitReached(false);
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        clearRecordingTimers();
        stream.getTracks().forEach((track) => track.stop());
        const type = next.mimeType || "audio/webm";
        selectVoice(new File([new Blob(chunks.current, { type })], `voice-message-${Date.now()}.webm`, { type }));
        setRecording(false);
      };
      recorder.current = next;
      next.start();
      setRecording(true);
      setNotice(copy.recording);
      const startedAt = Date.now();
      recordingTimer.current = setInterval(() => {
        const elapsed = Math.min(voiceSeconds, (Date.now() - startedAt) / 1000);
        setRecordedSeconds(elapsed);
        if (elapsed >= voiceSeconds) {
          if (recordingTimer.current) clearInterval(recordingTimer.current);
          recordingTimer.current = null;
          setLimitReached(true);
          stopTimer.current = setTimeout(() => { if (next.state === "recording") next.stop(); }, 450);
        }
      }, 80);
    } catch {
      setNotice(copy.recordingError);
    }
  }

  function stopRecording() {
    clearRecordingTimers();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!birthDate) {
      setNotice(language === "ms" ? "Sila pilih tarikh lahir plushie." : "Please choose your plushie's birth date.");
      return;
    }
    const data = new FormData(form);
    if (!voice?.size) {
      setNotice(copy.missingVoice);
      return;
    }
    if (voice.size > MAX_VOICE_BYTES) {
      setNotice(copy.voiceTooLarge);
      return;
    }

    setSaving(true);
    setNotice(copy.savingDetails);
    try {
      const started = await request(apiUrl, { action: "start" }, collectionCode);
      if (!started.session?.token) throw new Error("Could not start your order.");
      const upload = await request(apiUrl, {
        action: "prepare_voice_upload",
        sessionToken: started.session.token,
        fileName: voice.name || "voice-message.webm",
        contentType: voice.type || "audio/webm",
      }, collectionCode);
      if (!upload.upload?.signedUrl || !upload.upload.path) throw new Error("Could not prepare your voice message.");
      const voiceUpload = await fetch(upload.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": voice.type || "application/octet-stream" },
        body: voice,
      });
      if (!voiceUpload.ok) throw new Error("Your voice message could not be uploaded. Please try again.");

      const submitted = await request(apiUrl, {
        action: "submit",
        sessionToken: started.session.token,
        voiceStoragePath: upload.upload.path,
        customerName: data.get("customerName"),
        customerEmail: data.get("customerEmail"),
        phone: data.get("phone"),
        character: data.get("character"),
        productKey: data.get("productKey"),
        shippingRegion,
        shippingAddress: {
          address1: data.get("address1"), address2: data.get("address2"), city: data.get("city"),
          province, zip: data.get("zip"), countryCode: "MY",
        },
        form: {
          plushName: data.get("plushName"), gender: data.get("gender"), birthDate,
          birthPlace: data.get("birthPlace"), favouritePerson: data.get("favouritePerson"),
          belongsTo: data.get("belongsTo"), meaningfulNote: data.get("meaningfulNote"),
        },
      }, collectionCode);
      form.reset();
      setVoice(null);
      setBirthDate("");
      const reference = submitted.reference || "MP-REFERENCE";
      setNotice(submitted.whatsAppUrl ? `${copy.saved} ${reference}. ${copy.openingWhatsApp}` : `${copy.saved} ${reference}. ${copy.sendWhatsApp}`);
      if (submitted.whatsAppUrl) window.location.assign(submitted.whatsAppUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>MEANINGFUL PLUSHIES</Link><div className={styles.languageButtons} aria-label="Language"><button className={language === "en" ? styles.languageActive : styles.languageButton} type="button" onClick={() => setLanguage("en")}>ENGLISH</button><button className={language === "ms" ? styles.languageActive : styles.languageButton} type="button" onClick={() => setLanguage("ms")}>MALAY</button></div></header>
    <form className={styles.form} onSubmit={submit}>
      <h1>{copy.title}</h1>
      {orderSummaryVideo ? <video className={styles.orderSummaryVideo} autoPlay loop muted playsInline preload="metadata" aria-label="Order summary"><source src={orderSummaryVideo} type="video/mp4" /></video> : null}
      <h2>{copy.certificate}</h2>
      {lockedPlushie ? <div className={styles.lockedProduct}><span>{copy.yourPlushie}</span><strong>{lockedPlushie.character} · {lockedPlushie.productKey.replace("plushie_", "").replace("s", ` ${copy.secondsVoice}`)}</strong><input type="hidden" name="character" value={lockedPlushie.character} /><input type="hidden" name="productKey" value={lockedPlushie.productKey} /></div> : <><label>{copy.character}<select required name="character"><option value="Billy">Billy</option><option value="Tootsie">Tootsie</option><option value="Hunnie">Hunnie</option><option value="Dragon Warrior">Dragon Warrior</option></select></label><label>{copy.voiceLength}<select required name="productKey"><option value="plushie_5s">5 {copy.secondsVoice}</option><option value="plushie_10s">10 {copy.secondsVoice}</option><option value="plushie_20s">20 {copy.secondsVoice}</option></select></label></>}
      <label>{copy.plushName}<input required name="plushName" maxLength={20} autoCapitalize="characters" placeholder={copy.plushNamePlaceholder} onChange={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }} /></label>
      <label>{copy.gender}<select required name="gender"><option value="Male">{copy.male}</option><option value="Female">{copy.female}</option></select></label>
      <label>{copy.birthDate}<BirthDatePicker value={birthDate} placeholder={copy.birthDatePlaceholder} onChange={setBirthDate} /></label>
      <label>{copy.birthPlace}<input required name="birthPlace" maxLength={20} placeholder={copy.birthPlacePlaceholder} onBlur={(event) => { event.currentTarget.value = titleCaseWords(event.currentTarget.value); }} /></label>
      <label>{copy.favouritePerson}<input required name="favouritePerson" maxLength={20} placeholder={copy.favouritePersonPlaceholder} onBlur={(event) => { event.currentTarget.value = titleCaseWords(event.currentTarget.value); }} /></label>
      <label>{copy.belongsTo}<input required name="belongsTo" maxLength={20} placeholder={copy.belongsToPlaceholder} onBlur={(event) => { event.currentTarget.value = titleCaseWords(event.currentTarget.value); }} /></label>
      <label>{copy.meaningfulNote}<textarea required name="meaningfulNote" rows={4} placeholder={copy.meaningfulNotePlaceholder} /></label>
      <section className={styles.voiceSection} aria-label={copy.uploadVoice}><span>{copy.uploadVoice}</span><div className={styles.voiceModeButtons}><button className={voiceMode === "record" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => setVoiceMode("record")}>{copy.recordVoice}</button><button className={voiceMode === "upload" ? styles.voiceModeActive : styles.voiceModeButton} type="button" onClick={() => { if (recording) stopRecording(); setVoiceMode("upload"); }}>{copy.uploadAudio}</button></div>{voiceMode === "record" ? <div className={styles.voicePanel}><button className={recording ? styles.recordingButton : styles.recordButton} type="button" onClick={recording ? stopRecording : () => void startRecording()}>{recording ? <><span className={styles.recordingPulse} />{copy.stopRecording}</> : copy.recordVoice}</button>{recording || limitReached ? <div className={styles.recordingProgress}><div className={styles.recordingProgressTop}><span className={recording ? styles.recordingStatus : styles.recordingComplete}>{recording ? <><span className={styles.recordingDot} />{copy.recordingNow}</> : copy.recordingNow}</span><strong>{Math.floor(recordedSeconds)}/{voiceSeconds} {copy.seconds}</strong></div><div className={styles.progressTrack}><span className={limitReached ? styles.progressFull : styles.progressFill} style={{ width: `${Math.min(100, (recordedSeconds / voiceSeconds) * 100)}%` }} /></div></div> : null}</div> : <label className={draggingAudio ? styles.audioDropActive : styles.audioDropZone} onDragOver={(event) => { event.preventDefault(); setDraggingAudio(true); }} onDragLeave={() => setDraggingAudio(false)} onDrop={(event) => { event.preventDefault(); setDraggingAudio(false); selectVoice(event.dataTransfer.files?.[0]); }}><strong>{copy.chooseAudio}</strong><span>{copy.dragAudio}</span><input type="file" accept="audio/*" onChange={(event) => selectVoice(event.target.files?.[0])} /></label>}<small>{copy.uploadHint}</small>{voice ? <div className={styles.voicePreview}><p>{copy.voiceReady} {voice.name}</p><label>{copy.playback}<audio controls src={voiceUrl} /></label></div> : null}</section>

      <h2>{copy.shipping}</h2>
      <label>{copy.fullName}<input required name="customerName" autoComplete="name" placeholder={copy.fullNamePlaceholder} /></label>
      <label>{copy.phone}<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="0123456789" /></label>
      <label>{copy.email}<input required name="customerEmail" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} /></label>
      <label>{copy.address}<input required name="address1" autoComplete="address-line1" placeholder={copy.addressPlaceholder} /></label>
      <label>{copy.addressLine2} <small>{copy.optional}</small><input name="address2" autoComplete="address-line2" placeholder={copy.addressLine2Placeholder} /></label>
      <label>{copy.city}<input required name="city" autoComplete="address-level2" placeholder={copy.cityPlaceholder} /></label>
      <label>{copy.state}<select required name="province" value={province} onChange={(event) => setProvince(event.target.value)}>{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
      <label>{copy.postcode}<input required name="zip" inputMode="numeric" autoComplete="postal-code" placeholder={copy.postcodePlaceholder} /></label>
      <label>{copy.deliveryRegion}<input readOnly value={shippingRegion === "EAST" ? copy.eastMalaysia : copy.westMalaysia} /></label>
      <button className={styles.submit} type="submit" disabled={saving}>{saving ? copy.saving : copy.submit}</button>
      <p className={notice.includes("saved") ? styles.success : styles.notice} aria-live="polite">{notice}</p>
      <footer><Link href="/policies/terms-of-service">{copy.terms}</Link><span>© 2026 MEANINGFUL PLUSHIES</span></footer>
    </form>
  </main>;
}
