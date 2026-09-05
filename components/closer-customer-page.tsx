"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function CloserCustomerPage() {
  const params = useSearchParams();
  const certificateId = useMemo(() => params.get("certificate") || params.get("id") || "", [params]);
  const accessKey = useMemo(() => params.get("key") || "", [params]);
  const [state, setState] = useState<CloserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [name, setName] = useState("");
  const [partnerCertificateId, setPartnerCertificateId] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!certificateId || !accessKey) throw new Error("This NFC link is incomplete. Please scan the tag again.");
    const response = await fetch("/api/closer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, certificateId, accessKey, ...payload }),
    });
    const data = await response.json() as { error?: string; state?: CloserState };
    if (!response.ok) throw new Error(data.error || "We could not update your shared space.");
    return data;
  }, [accessKey, certificateId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await call("state");
      setState(data.state || null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void call("state").then((data) => { if (data.state) setState(data.state); }).catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [call, refresh]);

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

  const mediaUrl = (type: "photo" | "voice") => `/api/closer/media?certificate=${encodeURIComponent(certificateId)}&key=${encodeURIComponent(accessKey)}&type=${type}&v=${mediaVersion}`;

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

  if (loading) return <main className={styles.page}><div className={styles.loading}>Opening your shared space…</div></main>;
  if (error && !state) return <main className={styles.page}><section className={styles.card}><p className={styles.eyebrow}>closer ♥</p><h1>We couldn’t open this plushie.</h1><p>{error}</p><button className={styles.secondaryButton} onClick={() => void refresh()}>Try again</button></section></main>;
  if (!state) return null;

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>closer<span>♥</span></Link><span>YOUR SHARED SPACE</span></header>
    {error && <p className={styles.error}>{error}</p>}

    {state.status === "unlinked" ? <section className={styles.card}>
      <p className={styles.eyebrow}>YOUR PLUSHIE IS READY</p>
      <h1>{state.request ? "Someone wants to connect." : "Bring your plushies closer."}</h1>
      {state.request ? <>
        <p><strong>{state.request.requesterName}</strong> would like to link their plushie with yours.</p>
        {!showAccept ? <div className={styles.actions}><button className={styles.primaryButton} disabled={busy} onClick={() => setShowAccept(true)}>Accept connection</button><button className={styles.secondaryButton} disabled={busy} onClick={() => void rejectRequest()}>Reject</button></div> : <form className={styles.form} onSubmit={submitAccept}><label>Your name<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your name" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Connecting…" : "Create our shared space"}</button><button type="button" className={styles.textButton} onClick={() => setShowAccept(false)}>Go back</button></form>}
      </> : <>
        <p>Link with the person you love to create one shared space for photos and voice notes.</p>
        {!showRequest ? <button className={styles.primaryButton} onClick={() => setShowRequest(true)}>Request connection</button> : <form className={styles.form} onSubmit={submitRequest}><label>Your name<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your name" required /></label><label>Their plushie ID<input value={partnerCertificateId} maxLength={100} onChange={(event) => setPartnerCertificateId(event.target.value)} placeholder="For example: 124" required /></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Sending…" : "Send connection request"}</button><button type="button" className={styles.textButton} onClick={() => setShowRequest(false)}>Go back</button></form>}
      </>}
    </section> : <section className={`${styles.card} ${styles.linkedCard}`}>
      <p className={styles.eyebrow}>CONNECTED FROM AFAR</p>
      <h1>{state.connection.names[0]} <span>+</span> {state.connection.names[1]}</h1>
      <p className={styles.partner}>Linked with plushie #{state.connection.partnerCertificateId}</p>
      <div className={styles.mediaArea}>
        {state.connection.hasPhoto ? <img className={styles.photo} src={mediaUrl("photo")} alt={`A shared memory from ${state.connection.names.join(" and ")}`} /> : <div className={styles.mediaPlaceholder}><span>♥</span><h2>Your memories will live here</h2><p>Share the first photo when it is your turn.</p></div>}
        {state.connection.hasVoice && <audio className={styles.audio} controls src={mediaUrl("voice")}>Your browser cannot play this voice note.</audio>}
      </div>
      <div className={styles.mediaActions}>
        {state.connection.canUploadNextPhoto ? <label className={styles.primaryButton}>Share a photo<input type="file" accept="image/*" onChange={selectPhoto} disabled={busy} hidden /></label> : <span className={styles.waiting}>Your partner shares the next photo.</span>}
        <button className={styles.secondaryButton} onClick={() => void toggleRecording()} disabled={busy}>{recording ? "Stop & send voice note" : "Record a voice note"}</button>
      </div>
      <p className={styles.turnNote}>{state.connection.canUploadNextPhoto ? "It’s your turn to share the next photo." : "Your partner’s turn to share the next photo."}</p>
      <button className={styles.textButton} onClick={() => void unlink()} disabled={busy}>{busy ? "Unlinking…" : "Unlink our plushies"}</button>
    </section>}
  </main>;
}
