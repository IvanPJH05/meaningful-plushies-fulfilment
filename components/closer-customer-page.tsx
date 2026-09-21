"use client";

import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CloserGlyphText } from "./closer-art-text";
import styles from "./closer-customer-page.module.css";

type UnlinkedState = {
  status: "unlinked";
  request: { id: string; requesterName: string; fromCertificateId: string } | null;
  outgoingRequest: { id: string; partnerCertificateId: string } | null;
};

type LinkedState = {
  status: "linked";
  connection: { id: string; names: [string, string]; partnerCertificateId: string; hasPhoto: boolean; photoVersion: string; hasVoice: boolean; voiceVersion: string };
};

type CloserState = UnlinkedState | LinkedState;
type CloserTheme = { heading: string; accent: string; background: string };
type Language = "en" | "ms";

const defaultTheme: CloserTheme = { heading: "Your shared space", accent: "#d76b83", background: "#e7eedf" };
const languageStorageKey = "meaningful-plushies-closer-language";

const translations = {
  en: {
    settings: "Settings", language: "Language", english: "English", malay: "Malay",
    pair: "Pair Snowy", nickname: "Your nickname", partnerId: "Your partner ID", pairNow: "Pair now",
    connectionRequest: "Connection request", connectionRequestSent: "Connection request sent",
    wantsToPair: "Wants to pair with you", accept: "Accept", reject: "Reject", cancel: "Cancel",
    createSpace: "Create our shared space", waiting: "Waiting for your partner to accept",
    requestSentTo: "Your request was sent to", cancelRequest: "Cancel request",
    messageFrom: "Message from", sendVoice: "Send a voice message", addPhoto: "Add a photo",
    takePhoto: "Take photo", openGallery: "Open gallery", updating: "Updating", loading: "Loading",
    play: "Play", pause: "Pause", recording: "Recording", sending: "Sending",
    unlink: "Unlink our plushies", unlinkDescription: "Your shared space will close", unlinkAction: "Unlink",
    opening: "Opening your shared space", couldNotOpen: "We could not open this plushie", tryAgain: "Try again",
    connecting: "Connecting", requestSending: "Sending",
  },
  ms: {
    settings: "Tetapan", language: "Bahasa", english: "English", malay: "Bahasa Melayu",
    pair: "Pasangkan Snowy", nickname: "Nama panggilan anda", partnerId: "ID pasangan anda", pairNow: "Pasangkan",
    connectionRequest: "Permintaan sambungan", connectionRequestSent: "Permintaan sambungan dihantar",
    wantsToPair: "Mahu berpasangan dengan anda", accept: "Terima", reject: "Tolak", cancel: "Batal",
    createSpace: "Cipta ruang bersama kami", waiting: "Menunggu pasangan anda menerima",
    requestSentTo: "Permintaan anda dihantar kepada", cancelRequest: "Batalkan permintaan",
    messageFrom: "Mesej daripada", sendVoice: "Hantar mesej suara", addPhoto: "Tambah foto",
    takePhoto: "Ambil foto", openGallery: "Buka galeri", updating: "Mengemas kini", loading: "Memuatkan",
    play: "Main", pause: "Jeda", recording: "Merakam", sending: "Menghantar",
    unlink: "Nyahpaut plushies kami", unlinkDescription: "Ruang bersama anda akan ditutup", unlinkAction: "Nyahpaut",
    opening: "Membuka ruang bersama anda", couldNotOpen: "Kami tidak dapat membuka plushie ini", tryAgain: "Cuba lagi",
    connecting: "Menyambung", requestSending: "Menghantar",
  },
} as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function CloserCustomerPage({ proxyPath = "" }: { proxyPath?: string }) {
  const params = useSearchParams();
  const demoMode = useMemo(() => params.get("demo"), [params]);
  const isDemo = demoMode === "pairing" || demoMode === "shared";
  const certificateId = useMemo(() => isDemo ? "102331" : params.get("certificate") || params.get("id") || "", [isDemo, params]);
  const accessKey = useMemo(() => isDemo ? "demo" : params.get("key") || "", [isDemo, params]);
  const adminPreview = useMemo(() => isDemo ? "" : params.get("adminPreview") || "", [isDemo, params]);
  const backupApiPath = "https://meaningful-plushies-fulfilment.vercel.app/api/closer";
  // Keep the storefront URL through Shopify's app proxy, but use the app host
  // for API calls. The proxy can intermittently replace a POST response with
  // an HTML gateway page, which leaves one of the paired phones out of sync.
  const apiPath = proxyPath ? backupApiPath : "/api/closer";
  // Shared media needs the same reliable route as pairing actions. Shopify's
  // app proxy can return an HTML error page for the image request, leaving the
  // browser to show the image's alt text instead of the uploaded photo.
  const mediaPath = proxyPath ? `${backupApiPath}/media` : "/api/closer/media";
  const themePath = proxyPath ? `${proxyPath}/theme` : "/api/closer/theme";
  const [state, setState] = useState<CloserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [name, setName] = useState("");
  const [partnerCertificateId, setPartnerCertificateId] = useState("");
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadedPhotoVersion, setLoadedPhotoVersion] = useState<string | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceCurrentTime, setVoiceCurrentTime] = useState(0);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [theme, setTheme] = useState<CloserTheme>(defaultTheme);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const cameraPhotoInput = useRef<HTMLInputElement | null>(null);
  const galleryPhotoInput = useRef<HTMLInputElement | null>(null);
  const voiceAudio = useRef<HTMLAudioElement | null>(null);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!certificateId || (!accessKey && !adminPreview)) throw new Error("This NFC link is incomplete. Please scan the tag again.");
    const send = async (url: string, contentType: "application/json" | "text/plain") => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: JSON.stringify({ action, certificateId, accessKey, adminPreview, ...payload }),
      });
      // An app-proxy outage or storefront error can return an HTML page. Parse
      // defensively so customers see a useful retry message, never raw JSON
      // parsing text such as "Unexpected token '<'".
      const raw = await response.text();
      let data: { error?: string; state?: CloserState } = {};
      try { data = JSON.parse(raw) as { error?: string; state?: CloserState }; }
      catch {
        throw new Error(response.ok
          ? "Closer returned an unexpected response. Please refresh and try again."
          : "We could not reach Closer just now. Please refresh and try again.");
      }
      if (!response.ok) throw new Error(data.error || "We could not update your shared space.");
      return data;
    };
    return send(apiPath, proxyPath ? "text/plain" : "application/json");
  }, [accessKey, adminPreview, apiPath, certificateId, proxyPath]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    if (isDemo) {
      setState(demoMode === "shared"
        ? { status: "linked", connection: { id: "demo", names: ["Snowy", "Honey"], partnerCertificateId: "102332", hasPhoto: false, photoVersion: "none", hasVoice: false, voiceVersion: "none" } }
        : { status: "unlinked", request: null, outgoingRequest: null });
      setLoading(false);
      return;
    }
    try {
      const data = await call("state");
      setState(data.state || null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [call, demoMode, isDemo]);

  useEffect(() => {
    void refresh();
    if (isDemo) return;
    const interval = window.setInterval(() => {
      void call("state").then((data) => { if (data.state) setState(data.state); }).catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [call, isDemo, refresh]);

  useEffect(() => {
    if (isDemo) return;
    void fetch(themePath)
      .then((response) => response.ok ? response.json() : null)
      .then((data: { theme?: Partial<CloserTheme> } | null) => {
        if (data?.theme) setTheme((current) => ({ ...current, ...data.theme }));
      })
      .catch(() => undefined);
  }, [isDemo, themePath]);

  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem(languageStorageKey);
      if (savedLanguage === "en" || savedLanguage === "ms") setLanguage(savedLanguage);
    } catch {
      // Language selection remains available if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    setRecordingSeconds(0);
    const interval = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(interval);
  }, [recording]);

  async function recoverFromTransportIssue(caught: unknown) {
    const message = messageFrom(caught);
    setError(message);
    if (message === "We could not reach Closer just now. Please refresh and try again." || message === "Closer returned an unexpected response. Please refresh and try again.") await refresh();
  }

  const themedStyle = {
    "--closer-background": theme.background,
    "--closer-accent": theme.accent,
  } as CSSProperties;
  const copy = translations[language];

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(languageStorageKey, nextLanguage); } catch { /* ignore unavailable storage */ }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await call("request", { name, partnerCertificateId });
      setState(data.state || null);
      setShowRequest(false);
      setName("");
      setPartnerCertificateId("");
    } catch (caught) {
      await recoverFromTransportIssue(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || state.status !== "unlinked" || !state.request) return;
    setBusy(true);
    setError("");
    try {
      const data = await call("accept", { requestId: state.request.id, name });
      setState(data.state || null);
      setShowAccept(false);
      setName("");
    } catch (caught) {
      await recoverFromTransportIssue(caught);
    } finally {
      setBusy(false);
    }
  }

  async function rejectRequest() {
    if (!state || state.status !== "unlinked" || !state.request) return;
    setBusy(true);
    setError("");
    try {
      const data = await call("reject", { requestId: state.request.id });
      setState(data.state || null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOutgoingRequest() {
    if (!state || state.status !== "unlinked" || !state.outgoingRequest) return;
    setBusy(true);
    setError("");
    try {
      const data = await call("cancel_request", { requestId: state.outgoingRequest.id });
      setState(data.state || null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError("");
    try {
      const data = await call("unlink");
      setState(data.state || null);
      setShowSettings(false);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  const mediaUrl = (type: "photo" | "voice") => {
    const version = state?.status === "linked"
      ? type === "voice" ? state.connection.voiceVersion : state.connection.photoVersion
      : mediaVersion;
    return `${mediaPath}?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}&adminPreview=${encodeURIComponent(adminPreview)}&type=${type}&v=${encodeURIComponent(String(version))}`;
  };
  const photoIsLoading = state?.status === "linked" && state.connection.hasPhoto && loadedPhotoVersion !== state.connection.photoVersion;
  const recordingTime = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`;

  async function toggleVoicePlayback() {
    const audio = voiceAudio.current;
    if (!audio) return;
    if (audio.paused) {
      setVoiceLoading(true);
      try { await audio.play(); } catch { setVoiceLoading(false); setError("We could not play this voice message."); }
    } else {
      audio.pause();
    }
  }

  async function sendMedia(mediaType: "photo" | "voice", data: string) {
    setBusy(true);
    setError("");
    try {
      const result = await call("upload", { mediaType, data });
      setState(result.state || null);
      setMediaVersion((version) => version + 1);
      return true;
    } catch (caught) {
      setError(messageFrom(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function imageDataUrl(file: File) {
    const bitmap = await createImageBitmap(file);
    const limit = 2048;
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.82, 0.72, 0.62]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) continue;
      if (blob.size <= 3 * 1024 * 1024 || quality === 0.62) return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("We could not prepare that image.")); reader.readAsDataURL(blob); });
    }
    throw new Error("We could not prepare that image.");
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setShowPhotoPicker(false);
    setUploadingPhoto(true);
    try {
      const uploaded = await sendMedia("photo", await imageDataUrl(file));
      if (!uploaded) setUploadingPhoto(false);
    } catch (caught) {
      setUploadingPhoto(false);
      setError(messageFrom(caught));
    }
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const chunks: Blob[] = [];
      const activeRecorder = new MediaRecorder(stream, { mimeType: type });
      recorder.current = activeRecorder;
      recordingStream.current = stream;
      activeRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setSendingVoice(true);
        const blob = new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          await sendMedia("voice", String(reader.result));
          setSendingVoice(false);
        };
        reader.onerror = () => {
          setSendingVoice(false);
          setError("We could not save that voice note.");
        };
        reader.readAsDataURL(blob);
      };
      activeRecorder.start();
      setRecording(true);
    } catch { setError("Microphone access is needed to record a voice note."); }
  }

  if (loading) return <main className={styles.page} style={themedStyle}><div className={`${styles.scene} ${styles.loadingScene}`}><div className={styles.loading} role="status" aria-live="polite"><div className={styles.loadingContent}><CloserGlyphText className={styles.loadingLabel} text={copy.opening} label={copy.opening} /><span className={styles.loadingDots} aria-hidden="true"><i /><i /><i /></span></div></div></div></main>;
  if (error && !state) return <main className={styles.page} style={themedStyle}><div className={styles.scene}><section className={styles.card}><p className={styles.eyebrow}>closer ♥</p><h1><CloserGlyphText text={copy.couldNotOpen} label={copy.couldNotOpen} /></h1><p>{error}</p><button className={styles.secondaryButton} onClick={() => void refresh()}><CloserGlyphText text={copy.tryAgain} label={copy.tryAgain} /></button></section></div></main>;
  if (!state) return null;

  return <main className={styles.page} style={themedStyle}><div className={styles.scene}>
    <header className={styles.header}>
      <button type="button" className={styles.logoButton} disabled={busy} onClick={() => setShowSettings(true)} aria-label={copy.settings} aria-haspopup="dialog"><img className={styles.logo} src="https://meaningful-plushies-fulfilment.vercel.app/closer/meaningful-plushies-logo.png" alt="Meaningful Plushies" /></button>
    </header>
    {isDemo && <p className={styles.demoNotice}>Demo preview · No customer data is connected.</p>}
    {error && <p className={styles.error}>{error}</p>}

    {state.status === "unlinked" ? <section className={styles.unlinkedSpace}>
      <div className={styles.blankPanel} aria-hidden="true" />
      <div className={styles.idPill}><CloserGlyphText text={`ID: ${certificateId}`} /></div>
      {state.request ? <>
        <section className={styles.card}>
          <p className={`${styles.eyebrow} ${styles.requestEyebrow}`}><CloserGlyphText text={copy.connectionRequest} label={copy.connectionRequest} /></p>
          {!showAccept ? <><h1 className={styles.requestHeading}><CloserGlyphText className={styles.requestName} text={state.request.requesterName} label={state.request.requesterName} /><CloserGlyphText className={styles.requestPhrase} text={copy.wantsToPair} label={copy.wantsToPair} /></h1><div className={styles.actions}><button className={styles.primaryButton} disabled={busy} onClick={() => setShowAccept(true)}><CloserGlyphText className={styles.acceptWord} text={copy.accept} label={copy.accept} /></button><button className={styles.secondaryButton} disabled={busy} onClick={() => void rejectRequest()}><CloserGlyphText className={styles.actionWord} text={copy.reject} label={copy.reject} /></button></div></> : <form className={styles.form} onSubmit={submitAccept}><label><CloserGlyphText className={styles.formLabelArt} text={copy.nickname} label={copy.nickname} /><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={copy.nickname} required /></label><button className={styles.primaryButton} disabled={busy}><CloserGlyphText className={styles.createSpaceWord} text={busy ? copy.connecting : copy.createSpace} label={busy ? copy.connecting : copy.createSpace} /></button><button type="button" className={styles.textButton} onClick={() => setShowAccept(false)}><CloserGlyphText className={styles.actionWord} text={copy.cancel} label={copy.cancel} /></button></form>}
        </section>
      </> : state.outgoingRequest ? <section className={`${styles.card} ${styles.waitingCard}`}>
        <p className={`${styles.eyebrow} ${styles.waitingEyebrow}`}><CloserGlyphText text={copy.connectionRequestSent} label={copy.connectionRequestSent} /></p>
        <div className={styles.waitingAnimation} role="img" aria-label={copy.waiting}><CloserGlyphText className={styles.waitingText} text={copy.waiting} label={copy.waiting} /><span className={styles.loadingDots} aria-hidden="true"><i /><i /><i /></span></div>
        <div className={styles.sentTo}>
          <CloserGlyphText className={styles.sentToLabel} text={copy.requestSentTo} label={copy.requestSentTo} />
          <CloserGlyphText className={styles.partnerId} text={state.outgoingRequest.partnerCertificateId} label={`Partner ID ${state.outgoingRequest.partnerCertificateId}`} />
        </div>
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => void cancelOutgoingRequest()}><CloserGlyphText className={styles.actionWord} text={copy.cancelRequest} label={copy.cancelRequest} /></button>
      </section> : <>
        {!showRequest ? <button className={styles.primaryButton} onClick={() => setShowRequest(true)}><CloserGlyphText text={copy.pair} label={copy.pair} /></button> : <section className={styles.card} role="dialog" aria-modal="true" aria-label={copy.pair}><button type="button" className={styles.closeButton} onClick={() => setShowRequest(false)} aria-label={copy.cancel}>×</button><p className={styles.eyebrow}><CloserGlyphText text={copy.nickname} label={copy.nickname} /></p><form className={styles.form} onSubmit={submitRequest}><label><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={copy.nickname} required /></label><label><CloserGlyphText text={copy.partnerId} label={copy.partnerId} /><input value={partnerCertificateId} maxLength={100} onChange={(event) => setPartnerCertificateId(event.target.value)} placeholder="124" required /></label><button className={styles.primaryButton} disabled={busy}><CloserGlyphText text={busy ? copy.requestSending : copy.pairNow} label={busy ? copy.requestSending : copy.pairNow} /></button></form></section>}
      </>}
    </section> : <section className={styles.sharedSpace}>
      <div className={styles.namesPill} style={{ "--glyph-count": Math.max(Array.from(`${state.connection.names[0]} + ${state.connection.names[1]}`).length, 1) } as CSSProperties}><CloserGlyphText text={`${state.connection.names[0]} + ${state.connection.names[1]}`} /></div>
      <button type="button" className={styles.photoFrame} disabled={busy} onClick={() => setShowPhotoPicker(true)} aria-label="Add or replace the shared photo">
        {state.connection.hasPhoto ? <img className={styles.photo} src={mediaUrl("photo")} alt={`A shared memory from ${state.connection.names.join(" and ")}`} onLoad={() => { setUploadingPhoto(false); setLoadedPhotoVersion(state.connection.photoVersion); }} onError={() => { setUploadingPhoto(false); setLoadedPhotoVersion(state.connection.photoVersion); setError("We could not load the shared photo. Please refresh and try again."); }} /> : <span className={styles.photoEmpty} aria-hidden="true" />}
        {(uploadingPhoto || photoIsLoading) && <span className={styles.photoUploading} role="status" aria-live="polite"><CloserGlyphText text={uploadingPhoto ? copy.updating : copy.loading} label={uploadingPhoto ? copy.updating : copy.loading} /><span className={styles.uploadDots} aria-hidden="true"><i /><i /><i /></span></span>}
      </button>
      <input ref={cameraPhotoInput} type="file" accept="image/*" capture="environment" onChange={selectPhoto} hidden />
      <input ref={galleryPhotoInput} type="file" accept="image/*" onChange={selectPhoto} hidden />
      <div className={styles.voiceCard}>
        <h2><CloserGlyphText className={styles.voiceMessageTitle} text={`${copy.messageFrom} ${state.connection.names[1]}`} label={`${copy.messageFrom} ${state.connection.names[1]}`} /></h2>
        {state.connection.hasVoice && <div className={styles.voicePlayer}>
          <audio ref={voiceAudio} className={styles.audio} preload="metadata" src={mediaUrl("voice")} onLoadStart={() => setVoiceLoading(true)} onCanPlay={() => setVoiceLoading(false)} onWaiting={() => setVoiceLoading(true)} onPlaying={() => { setVoicePlaying(true); setVoiceLoading(false); }} onError={() => { setVoiceLoading(false); setError("We could not load this voice message. Please refresh and try again."); }} onLoadedMetadata={(event) => setVoiceDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setVoiceCurrentTime(event.currentTarget.currentTime)} onPause={() => setVoicePlaying(false)} onEnded={(event) => { event.currentTarget.currentTime = 0; setVoicePlaying(false); setVoiceLoading(false); setVoiceCurrentTime(0); }} />
          <button type="button" className={`${styles.voicePlayButton} ${voiceLoading ? styles.voiceLoadingButton : ""}`} onClick={() => void toggleVoicePlayback()} aria-label={voiceLoading ? copy.loading : voicePlaying ? copy.pause : copy.play}>{voiceLoading ? <span className={styles.voiceLoadingLabel}><CloserGlyphText text={copy.loading} label={copy.loading} /><span className={styles.voiceLoadingDots} aria-hidden="true"><i /><i /><i /></span></span> : <CloserGlyphText text={voicePlaying ? copy.pause : copy.play} label={voicePlaying ? copy.pause : copy.play} />}</button>
          <input className={styles.voiceProgress} type="range" min="0" max={voiceDuration || 0} step="0.1" value={Math.min(voiceCurrentTime, voiceDuration || 0)} onChange={(event) => { const time = Number(event.target.value); if (voiceAudio.current) voiceAudio.current.currentTime = time; setVoiceCurrentTime(time); }} aria-label="Voice message progress" />
        </div>}
      </div>
      <button className={`${styles.primaryButton} ${recording ? styles.recordingButton : ""} ${sendingVoice ? styles.sendingVoiceButton : ""}`} onClick={() => void toggleRecording()} disabled={busy || sendingVoice} aria-label={recording ? copy.recording : sendingVoice ? copy.sending : `${copy.sendVoice} ${state.connection.names[1]}`}>
        {recording ? <span className={styles.recordingLabel}><span className={styles.recordingPulse} aria-hidden="true" /><CloserGlyphText text={`${copy.recording} ${recordingTime}`} label={`${copy.recording} ${recordingTime}`} /></span> : sendingVoice ? <span className={styles.sendingVoiceLabel}><CloserGlyphText text={copy.sending} label={copy.sending} /><span className={styles.sendingDots} aria-hidden="true"><i /><i /><i /></span></span> : <CloserGlyphText className={styles.sendVoiceLabel} text={`${copy.sendVoice} ${state.connection.names[1]}`} label={`${copy.sendVoice} ${state.connection.names[1]}`} />}
      </button>
    </section>}
    {showPhotoPicker && state.status === "linked" && <section className={`${styles.card} ${styles.photoPicker}`} role="dialog" aria-modal="true" aria-label={copy.addPhoto}><button type="button" className={styles.closeButton} onClick={() => setShowPhotoPicker(false)} aria-label={copy.cancel}>×</button><h1><CloserGlyphText className={styles.photoPickerTitle} text={copy.addPhoto} label={copy.addPhoto} /></h1><div className={styles.photoButtons}><button className={styles.primaryButton} disabled={busy} onClick={() => cameraPhotoInput.current?.click()}><CloserGlyphText className={styles.photoActionArt} text={copy.takePhoto} label={copy.takePhoto} /></button><button className={styles.primaryButton} disabled={busy} onClick={() => galleryPhotoInput.current?.click()}><CloserGlyphText className={styles.photoActionArt} text={copy.openGallery} label={copy.openGallery} /></button></div></section>}
    {showSettings && <section className={`${styles.card} ${styles.settingsDialog}`} role="dialog" aria-modal="true" aria-label={copy.settings}><button type="button" className={styles.closeButton} onClick={() => setShowSettings(false)} aria-label={copy.cancel}>×</button><h1><CloserGlyphText className={styles.unlinkDialogTitle} text={copy.settings} label={copy.settings} /></h1><div className={styles.settingsLanguage}><CloserGlyphText className={styles.settingsLabel} text={copy.language} label={copy.language} /><div className={styles.languageSwitch}><button type="button" className={language === "en" ? styles.selectedLanguage : ""} onClick={() => selectLanguage("en")}><CloserGlyphText text={copy.english} label="English" /></button><button type="button" className={language === "ms" ? styles.selectedLanguage : ""} onClick={() => selectLanguage("ms")}><CloserGlyphText text={copy.malay} label="Malay" /></button></div></div>{state.status === "linked" && <div className={styles.unlinkSettings}><CloserGlyphText className={styles.unlinkDialogMessage} text={copy.unlinkDescription} label={copy.unlinkDescription} /><button className={styles.secondaryButton} disabled={busy} onClick={() => void unlink()}><CloserGlyphText className={styles.unlinkConfirmLabel} text={copy.unlinkAction} label={copy.unlinkAction} /></button></div>}</section>}
  </div></main>;
}
