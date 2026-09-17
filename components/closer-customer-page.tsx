"use client";

import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CloserGlyphText, CloserWordArt } from "./closer-art-text";
import styles from "./closer-customer-page.module.css";

type UnlinkedState = {
  status: "unlinked";
  request: { id: string; requesterName: string; fromCertificateId: string } | null;
  outgoingRequest: { id: string; partnerCertificateId: string } | null;
};

type LinkedState = {
  status: "linked";
  connection: { id: string; names: [string, string]; partnerCertificateId: string; canUploadNextPhoto: boolean; hasPhoto: boolean; hasVoice: boolean; voiceVersion: string };
};

type CloserState = UnlinkedState | LinkedState;
type CloserTheme = { heading: string; accent: string; background: string };

const defaultTheme: CloserTheme = { heading: "Your shared space", accent: "#d76b83", background: "#e7eedf" };

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
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [language, setLanguage] = useState<"en" | "ms">("en");
  const [name, setName] = useState("");
  const [partnerCertificateId, setPartnerCertificateId] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
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
        ? { status: "linked", connection: { id: "demo", names: ["Snowy", "Honey"], partnerCertificateId: "102332", canUploadNextPhoto: true, hasPhoto: false, hasVoice: false, voiceVersion: "none" } }
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
      setShowUnlinkConfirm(false);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  const mediaUrl = (type: "photo" | "voice") => {
    const version = type === "voice" && state?.status === "linked" ? state.connection.voiceVersion : mediaVersion;
    return `${mediaPath}?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}&adminPreview=${encodeURIComponent(adminPreview)}&type=${type}&v=${encodeURIComponent(String(version))}`;
  };
  const recordingTime = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`;

  async function toggleVoicePlayback() {
    const audio = voiceAudio.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setError("We could not play this voice message."); }
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
        const blob = new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => void sendMedia("voice", String(reader.result));
        reader.onerror = () => setError("We could not save that voice note.");
        reader.readAsDataURL(blob);
      };
      activeRecorder.start();
      setRecording(true);
    } catch (caught) { setError("Microphone access is needed to record a voice note."); }
  }

  if (loading) return <main className={styles.page} style={themedStyle}><div className={styles.scene}><div className={styles.loading}>Opening your shared space…</div></div></main>;
  if (error && !state) return <main className={styles.page} style={themedStyle}><div className={styles.scene}><section className={styles.card}><p className={styles.eyebrow}>closer ♥</p><h1>We couldn’t open this plushie.</h1><p>{error}</p><button className={styles.secondaryButton} onClick={() => void refresh()}>Try again</button></section></div></main>;
  if (!state) return null;

  return <main className={styles.page} style={themedStyle}><div className={styles.scene}>
    <header className={styles.header}>
      <img className={styles.logo} src="https://meaningful-plushies-fulfilment.vercel.app/closer/meaningful-plushies-logo.png" alt="Meaningful Plushies" />
      {state.status === "unlinked" && <div className={styles.languageSwitch}><button className={language === "en" ? styles.selectedLanguage : ""} onClick={() => setLanguage("en")}><CloserWordArt asset="english" label="English" /></button><button className={language === "ms" ? styles.selectedLanguage : ""} onClick={() => setLanguage("ms")}><CloserWordArt asset="malay" label="Malay" /></button></div>}
    </header>
    {isDemo && <p className={styles.demoNotice}>Demo preview · No customer data is connected.</p>}
    {error && <p className={styles.error}>{error}</p>}

    {state.status === "unlinked" ? <section className={styles.unlinkedSpace}>
      <div className={styles.blankPanel} aria-hidden="true" />
      <div className={styles.idPill}><CloserGlyphText text={`ID: ${certificateId}`} /></div>
      {state.request ? <>
        <section className={styles.card}>
          <p className={`${styles.eyebrow} ${styles.requestEyebrow}`}><CloserWordArt asset="connection-request" label="Connection request" /></p>
          {!showAccept ? <><h1 className={styles.requestHeading}><CloserGlyphText className={styles.requestName} text={state.request.requesterName} label={state.request.requesterName} /><CloserWordArt className={styles.requestPhrase} asset="wants-to-pair-with-you" label="Wants to pair with you" /></h1><div className={styles.actions}><button className={styles.primaryButton} disabled={busy} onClick={() => setShowAccept(true)}><CloserWordArt className={styles.acceptWord} asset="accept" label="Accept" /></button><button className={styles.secondaryButton} disabled={busy} onClick={() => void rejectRequest()}><CloserWordArt className={styles.actionWord} asset="reject" label="Reject" /></button></div></> : <form className={styles.form} onSubmit={submitAccept}><label><CloserWordArt className={styles.formLabelArt} asset="your-nickname" label="Your nickname" /><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your nickname" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Connecting…" : <CloserWordArt className={styles.createSpaceWord} asset="create-our-shared-space" label="Create our shared space" />}</button><button type="button" className={styles.textButton} onClick={() => setShowAccept(false)}><CloserWordArt className={styles.actionWord} asset="cancel" label="Cancel" /></button></form>}
        </section>
      </> : state.outgoingRequest ? <section className={`${styles.card} ${styles.waitingCard}`}>
        <p className={`${styles.eyebrow} ${styles.waitingEyebrow}`}><CloserWordArt asset="connection-request-sent" label="Connection request sent" /></p>
        <div className={styles.waitingAnimation} role="img" aria-label="Waiting for your partner to accept">
          {["waiting-0", "waiting-1", "waiting-2", "waiting-3"].map((asset, index) => <CloserWordArt className={`${styles.waitingFrame} ${styles[`waitingFrame${index}`]}`} asset={asset} label="" key={asset} />)}
        </div>
        <div className={styles.sentTo}>
          <CloserWordArt className={styles.sentToArt} asset="your-request-was-sent-to" label="Your request was sent to" />
          <CloserGlyphText className={styles.partnerId} text={state.outgoingRequest.partnerCertificateId} label={`Partner ID ${state.outgoingRequest.partnerCertificateId}`} />
        </div>
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => void cancelOutgoingRequest()}><CloserWordArt className={styles.actionWord} asset="cancel" label="Cancel request" /></button>
      </section> : <>
        {!showRequest ? <button className={styles.primaryButton} onClick={() => setShowRequest(true)}><CloserWordArt asset="pair-snowy" label="Pair Snowy" /></button> : <section className={styles.card} role="dialog" aria-modal="true" aria-label="Pair your plushie"><button type="button" className={styles.closeButton} onClick={() => setShowRequest(false)} aria-label="Close">×</button><p className={styles.eyebrow}><CloserWordArt asset="your-nickname" label="Your nickname" /></p><form className={styles.form} onSubmit={submitRequest}><label><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your nickname" required /></label><label><CloserWordArt asset="partners-id" label="Your partner's ID" /><input value={partnerCertificateId} maxLength={100} onChange={(event) => setPartnerCertificateId(event.target.value)} placeholder="For example: 124" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Sending…" : <CloserWordArt asset="pair-now" label="Pair now" />}</button></form></section>}
      </>}
    </section> : <section className={styles.sharedSpace}>
      <div className={styles.namesPill} style={{ "--glyph-count": Math.max(Array.from(`${state.connection.names[0]} + ${state.connection.names[1]}`).length, 1) } as CSSProperties}><CloserGlyphText text={`${state.connection.names[0]} + ${state.connection.names[1]}`} /></div>
      <button type="button" className={styles.photoFrame} disabled={busy || !state.connection.canUploadNextPhoto} onClick={() => setShowPhotoPicker(true)} aria-label={state.connection.canUploadNextPhoto ? "Add or replace the shared photo" : `Waiting for ${state.connection.names[1]} to add the next photo`}>
        {state.connection.hasPhoto ? <img className={styles.photo} src={mediaUrl("photo")} alt={`A shared memory from ${state.connection.names.join(" and ")}`} onLoad={() => setUploadingPhoto(false)} onError={() => { setUploadingPhoto(false); setError("We could not load the shared photo. Please refresh and try again."); }} /> : <span className={styles.photoEmpty} aria-hidden="true" />}
        {uploadingPhoto && <span className={styles.photoUploading} role="status" aria-live="polite"><CloserGlyphText text="Updating" label="Updating shared photo" /><span className={styles.uploadDots} aria-hidden="true"><i /><i /><i /></span></span>}
      </button>
      <input ref={cameraPhotoInput} type="file" accept="image/*" capture="environment" onChange={selectPhoto} hidden />
      <input ref={galleryPhotoInput} type="file" accept="image/*" onChange={selectPhoto} hidden />
      <div className={styles.voiceCard}>
        <h2><CloserGlyphText className={styles.voiceMessageTitle} text={`Message from ${state.connection.names[1]}`} label={`Message from ${state.connection.names[1]}`} /></h2>
        {state.connection.hasVoice && <div className={styles.voicePlayer}>
          <audio ref={voiceAudio} className={styles.audio} src={mediaUrl("voice")} onLoadedMetadata={(event) => setVoiceDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setVoiceCurrentTime(event.currentTarget.currentTime)} onPlay={() => setVoicePlaying(true)} onPause={() => setVoicePlaying(false)} onEnded={(event) => { event.currentTarget.currentTime = 0; setVoicePlaying(false); setVoiceCurrentTime(0); }} />
          <button type="button" className={styles.voicePlayButton} onClick={() => void toggleVoicePlayback()} aria-label={voicePlaying ? "Pause voice message" : "Play voice message"}><CloserGlyphText text={voicePlaying ? "Pause" : "Play"} label={voicePlaying ? "Pause" : "Play"} /></button>
          <input className={styles.voiceProgress} type="range" min="0" max={voiceDuration || 0} step="0.1" value={Math.min(voiceCurrentTime, voiceDuration || 0)} onChange={(event) => { const time = Number(event.target.value); if (voiceAudio.current) voiceAudio.current.currentTime = time; setVoiceCurrentTime(time); }} aria-label="Voice message progress" />
        </div>}
      </div>
      <button className={`${styles.primaryButton} ${recording ? styles.recordingButton : ""}`} onClick={() => void toggleRecording()} disabled={busy} aria-label={recording ? "Stop and send voice message" : `Send ${state.connection.names[1]} a voice message`}>
        {recording ? <span className={styles.recordingLabel}><span className={styles.recordingPulse} aria-hidden="true" /><CloserGlyphText text={`Recording ${recordingTime}`} label={`Recording ${recordingTime}`} /></span> : <CloserGlyphText className={styles.sendVoiceLabel} text={`Send ${state.connection.names[1]} a voice message`} label={`Send ${state.connection.names[1]} a voice message`} />}
      </button>
      <button className={styles.textButton} onClick={() => setShowUnlinkConfirm(true)} disabled={busy}><CloserGlyphText className={styles.unlinkLabel} text="Unlink our plushies" label="Unlink our plushies" /></button>
      {showPhotoPicker && <section className={`${styles.card} ${styles.photoPicker}`} role="dialog" aria-modal="true" aria-label="Add a shared photo"><button type="button" className={styles.closeButton} onClick={() => setShowPhotoPicker(false)} aria-label="Close">×</button><h1><CloserGlyphText className={styles.photoPickerTitle} text="Add a photo" label="Add a photo" /></h1><div className={styles.photoButtons}><button className={styles.primaryButton} disabled={busy} onClick={() => cameraPhotoInput.current?.click()}><CloserGlyphText className={styles.photoActionArt} text="Take photo" label="Take photo" /></button><button className={styles.primaryButton} disabled={busy} onClick={() => galleryPhotoInput.current?.click()}><CloserGlyphText className={styles.photoActionArt} text="Open gallery" label="Open gallery" /></button></div></section>}
      {showUnlinkConfirm && <section className={`${styles.card} ${styles.unlinkDialog}`} role="dialog" aria-modal="true" aria-label="Unlink our plushies"><button type="button" className={styles.closeButton} onClick={() => setShowUnlinkConfirm(false)} aria-label="Close">×</button><h1><CloserGlyphText className={styles.unlinkDialogTitle} text="Unlink our plushies" label="Unlink our plushies" /></h1><p><CloserGlyphText className={styles.unlinkDialogMessage} text="Your shared space will close" label="Your shared space will close" /></p><div className={styles.actions}><button className={styles.primaryButton} disabled={busy} onClick={() => void unlink()}><CloserGlyphText className={styles.unlinkConfirmLabel} text={busy ? "Unlinking" : "Unlink"} label={busy ? "Unlinking" : "Unlink"} /></button><button className={styles.secondaryButton} disabled={busy} onClick={() => setShowUnlinkConfirm(false)}><CloserGlyphText className={styles.unlinkConfirmLabel} text="Cancel" label="Cancel" /></button></div></section>}
    </section>}
  </div></main>;
}
