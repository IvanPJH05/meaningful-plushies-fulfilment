"use client";

import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import styles from "./closer-customer-page.module.css";

type UnlinkedState = {
  status: "unlinked";
  request: { id: string; requesterName: string; fromCertificateId: string } | null;
};

type LinkedState = {
  status: "linked";
  connection: { id: string; names: [string, string]; partnerCertificateId: string; canUploadNextPhoto: boolean; hasPhoto: boolean; hasVoice: boolean };
};

type CloserState = UnlinkedState | LinkedState;
type CloserTheme = { heading: string; accent: string; background: string };

const defaultTheme: CloserTheme = { heading: "Your shared space", accent: "#d76b83", background: "#e7eedf" };

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function CloserCustomerPage() {
  const params = useSearchParams();
  const demoMode = useMemo(() => params.get("demo"), [params]);
  const isDemo = demoMode === "pairing" || demoMode === "shared";
  const certificateId = useMemo(() => isDemo ? "102331" : params.get("certificate") || params.get("id") || "", [isDemo, params]);
  const accessKey = useMemo(() => isDemo ? "demo" : params.get("key") || "", [isDemo, params]);
  const proxyPath = useMemo(() => {
    const forwardedPrefix = (params.get("path_prefix") || "").replace(/\/+$/, "");
    if (forwardedPrefix) return forwardedPrefix;
    // Shopify adds path_prefix only to its server-to-server proxy request, not
    // to the address visible in the customer's browser. Detect the public
    // proxy URL so customer actions stay under /apps/closer instead of asking
    // Shopify's theme for the non-existent /api/closer route.
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/apps/closer")) return "/apps/closer";
    return "";
  }, [params]);
  const apiPath = proxyPath ? `${proxyPath}/api` : "/api/closer";
  const mediaPath = proxyPath ? `${proxyPath}/media` : "/api/closer/media";
  const themePath = proxyPath ? `${proxyPath}/theme` : "/api/closer/theme";
  const [state, setState] = useState<CloserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [name, setName] = useState("");
  const [partnerCertificateId, setPartnerCertificateId] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [theme, setTheme] = useState<CloserTheme>(defaultTheme);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const cameraPhotoInput = useRef<HTMLInputElement | null>(null);
  const galleryPhotoInput = useRef<HTMLInputElement | null>(null);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!certificateId || !accessKey) throw new Error("This NFC link is incomplete. Please scan the tag again.");
    const response = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, certificateId, accessKey, ...payload }),
    });
    const data = await response.json() as { error?: string; state?: CloserState };
    if (!response.ok) throw new Error(data.error || "We could not update your shared space.");
    return data;
  }, [accessKey, apiPath, certificateId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    if (isDemo) {
      setState(demoMode === "shared"
        ? { status: "linked", connection: { id: "demo", names: ["Snowy", "Honey"], partnerCertificateId: "102332", canUploadNextPhoto: true, hasPhoto: false, hasVoice: false } }
        : { status: "unlinked", request: null });
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
      setError(messageFrom(caught));
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
      setError(messageFrom(caught));
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

  async function unlink() {
    if (!window.confirm("Unlink these plushies? Their shared space will be closed.")) return;
    setBusy(true);
    setError("");
    try {
      const data = await call("unlink");
      setState(data.state || null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  const mediaUrl = (type: "photo" | "voice") => `${mediaPath}?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}&type=${type}&v=${mediaVersion}`;

  async function sendMedia(mediaType: "photo" | "voice", data: string) {
    setBusy(true);
    setError("");
    try {
      const result = await call("upload", { mediaType, data });
      setState(result.state || null);
      setMediaVersion((version) => version + 1);
    } catch (caught) {
      setError(messageFrom(caught));
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
    try { await sendMedia("photo", await imageDataUrl(file)); } catch (caught) { setError(messageFrom(caught)); }
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

  if (loading) return <main className={styles.page} style={themedStyle}><div className={styles.loading}>Opening your shared space…</div></main>;
  if (error && !state) return <main className={styles.page} style={themedStyle}><section className={styles.card}><p className={styles.eyebrow}>closer ♥</p><h1>We couldn’t open this plushie.</h1><p>{error}</p><button className={styles.secondaryButton} onClick={() => void refresh()}>Try again</button></section></main>;
  if (!state) return null;

  return <main className={styles.page} style={themedStyle}>
    <header className={styles.header}><Link href="/" className={styles.brand}>closer<span>♥</span></Link><span>{theme.heading.toUpperCase()}</span></header>
    {isDemo && <p className={styles.demoNotice}>Demo preview · No customer data is connected.</p>}
    {error && <p className={styles.error}>{error}</p>}

    {state.status === "unlinked" ? <section className={styles.unlinkedSpace}>
      <div className={styles.idPill}>ID: {certificateId}</div>
      {state.request ? <>
        <section className={styles.card}>
          <p className={styles.eyebrow}>CONNECTION REQUEST</p>
          <h1>{state.request.requesterName} wants to pair with you.</h1>
          {!showAccept ? <div className={styles.actions}><button className={styles.primaryButton} disabled={busy} onClick={() => setShowAccept(true)}>Accept connection</button><button className={styles.secondaryButton} disabled={busy} onClick={() => void rejectRequest()}>Reject</button></div> : <form className={styles.form} onSubmit={submitAccept}><label>What should your partner call you?<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your nickname" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Connecting…" : "Create our shared space"}</button><button type="button" className={styles.textButton} onClick={() => setShowAccept(false)}>Go back</button></form>}
        </section>
      </> : <>
        <section className={styles.tutorialCard}>
          <h1>Video tutorial on how it works</h1>
          <button className={styles.playButton} onClick={() => setShowTutorial(true)} aria-label="See how pairing works"><span /></button>
          {showTutorial && <div className={styles.tutorialSteps} role="dialog" aria-modal="true" aria-label="How Closer works">
            <strong>How Closer works</strong>
            <ol><li>Scan your Snowy’s NFC tag.</li><li>Enter your partner’s plushie ID and your nickname.</li><li>They accept the request from their tag.</li><li>Take turns sharing a photo and leave voice messages.</li></ol>
            <button className={styles.textButton} onClick={() => setShowTutorial(false)}>Close</button>
          </div>}
        </section>
        {!showRequest ? <button className={styles.primaryButton} onClick={() => setShowRequest(true)}>Pair Snowy now</button> : <section className={styles.card}><p className={styles.eyebrow}>PAIR YOUR SNOWY</p><form className={styles.form} onSubmit={submitRequest}><label>What should your partner call you?<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your nickname" required /></label><label>Your partner’s Snowy ID<input value={partnerCertificateId} maxLength={100} onChange={(event) => setPartnerCertificateId(event.target.value)} placeholder="For example: 124" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Sending…" : "Send connection request"}</button><button type="button" className={styles.textButton} onClick={() => setShowRequest(false)}>Go back</button></form></section>}
      </>}
    </section> : <section className={styles.sharedSpace}>
      <div className={styles.namesPill}>“{state.connection.names[0]}” + “{state.connection.names[1]}”</div>
      <div className={styles.photoFrame}>
        {state.connection.hasPhoto ? <img className={styles.photo} src={mediaUrl("photo")} alt={`A shared memory from ${state.connection.names.join(" and ")}`} /> : <div className={styles.mediaPlaceholder}><span>♥</span><h2>Your memories will live here</h2><p>Share the first photo when it is your turn.</p></div>}
      </div>
      <div className={styles.uploadCard}>
        <h2>{state.connection.canUploadNextPhoto ? "It’s your turn to upload" : `It’s ${state.connection.names[1]}’s turn to upload`}</h2>
        {state.connection.canUploadNextPhoto ? <div className={styles.photoButtons}>
          <button className={styles.primaryButton} disabled={busy} onClick={() => cameraPhotoInput.current?.click()}>Take image</button>
          <button className={styles.primaryButton} disabled={busy} onClick={() => galleryPhotoInput.current?.click()}>Open gallery</button>
          <input ref={cameraPhotoInput} type="file" accept="image/*" capture="environment" onChange={selectPhoto} hidden />
          <input ref={galleryPhotoInput} type="file" accept="image/*" onChange={selectPhoto} hidden />
        </div> : <p className={styles.waiting}>You’ll be able to share after {state.connection.names[1]} adds the next photo.</p>}
      </div>
      <div className={styles.voiceCard}>
        {state.connection.hasVoice ? <><audio className={styles.audio} controls src={mediaUrl("voice")}>Your browser cannot play this voice note.</audio><h2>“{state.connection.names[1]}” left you a message</h2></> : <h2>Leave “{state.connection.names[1]}” a message</h2>}
      </div>
      <button className={styles.primaryButton} onClick={() => void toggleRecording()} disabled={busy}>{recording ? "Stop and send voice message" : "Send them a voice message"}</button>
      <button className={styles.textButton} onClick={() => void unlink()} disabled={busy}>{busy ? "Unlinking…" : "Unlink our plushies"}</button>
    </section>}
  </main>;
}
