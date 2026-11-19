"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCameraCardCycle, createCameraScan } from "../lib/nfc-camera-scan";
import styles from "./nfc-card-workspace.module.css";

type Barcode = { rawValue: string };
type Decoder = { detect(frame: HTMLCanvasElement): Promise<Barcode[]> };
type DecoderApi = {
  BarcodeDetector: new (options: { formats: string[] }) => Decoder;
  prepareZXingModule(options: { overrides: { locateFile: () => string }; fireImmediately: true }): Promise<unknown>;
};
class ReaderSetupError extends Error {}

async function cardOnReader(signal: AbortSignal): Promise<string | null> {
  const response = await fetch("http://127.0.0.1:17654/card-present", {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
  }).catch(() => {
    throw new Error("Could not reach the Windows NFC Helper. Start it and allow local network access if prompted.");
  });
  if (response.status === 404) throw new ReaderSetupError("Install and restart the latest Windows NFC Helper to use the camera.");
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "The reader could not detect a card.");
  return result.uid;
}

export function NfcCameraWriter({ onWrite }: { onWrite: (code: string, uid: string) => Promise<number> }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const session = useRef<AbortController | null>(null);
  const scanning = useRef(false);
  const writeCard = useRef(onWrite);
  const [decoder, setDecoder] = useState<DecoderApi>();
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [preview, setPreview] = useState(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState("Place one stickered VIP card on the reader at a time.");

  useEffect(() => { writeCard.current = onWrite; }, [onWrite]);

  useEffect(() => () => {
    session.current?.abort();
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function openCamera(selected?: string) {
    setStarting(true);
    setPreview(false);
    const cameraSession = new AbortController();
    session.current?.abort();
    session.current = cameraSession;
    try {
      stream.current?.getTracks().forEach(track => track.stop());
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, ...(selected ? { deviceId: { exact: selected } } : {}) },
      });
      if (cameraSession.signal.aborted || !video.current) {
        next.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = next;
      video.current.srcObject = next;
      setDeviceId(next.getVideoTracks()[0].getSettings().deviceId || "");
      setCameras((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput"));
      if (cameraSession.signal.aborted) return;
      setPreview(true);
      setMessage("Camera ready. Scanning starts automatically when the decoder is ready.");
    } catch (error) {
      if (!cameraSession.signal.aborted) setMessage(error instanceof Error ? error.message : "Could not open the camera.");
    } finally {
      if (!cameraSession.signal.aborted) setStarting(false);
    }
  }

  const scanCards = useCallback(async () => {
    if (!decoder || !preview || scanning.current) return;
    scanning.current = true;
    const scanSession = new AbortController();
    session.current = scanSession;
    const { signal } = scanSession;
    setRunning(true);
    try {
      const reader = new decoder.BarcodeDetector({ formats: ["code_128", "code_39", "qr_code"] });
      const frame = document.createElement("canvas");
      const context = frame.getContext("2d", { willReadFrequently: true });
      const enhanced = document.createElement("canvas");
      const enhancedContext = enhanced.getContext("2d", { willReadFrequently: true });
      if (!context || !enhancedContext) throw new Error("The camera frame could not be read.");
      const cycle = createCameraCardCycle();
      let lastFrameTime = -1;
      const detectFrame = createCameraScan();
      while (!signal.aborted) {
        let uid: string | null;
        try {
          uid = await cardOnReader(signal);
        } catch (error) {
          if (signal.aborted) break;
          if (error instanceof ReaderSetupError) throw error;
          cycle.interrupt();
          setMessage(`${error instanceof Error ? error.message : "Reader temporarily unavailable."} Reconnecting automatically…`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        if (signal.aborted) break;
        const camera = video.current;
        const state = cycle.observe(uid);
        if (state === "empty") {
          setMessage("Waiting for a card on the NFC reader.");
        } else if (state === "changed") {
          setMessage("The card changed. Clear the reader before trying again.");
        } else if (state === "ready" && uid && camera && camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && camera.currentTime !== lastFrameTime) {
          lastFrameTime = camera.currentTime;
          // Resizing clears the canvas and reallocates its backing store. Reuse it.
          if (frame.width !== camera.videoWidth || frame.height !== camera.videoHeight) {
            frame.width = enhanced.width = camera.videoWidth;
            frame.height = enhanced.height = camera.videoHeight;
          }
          context.drawImage(camera, 0, 0);
          const barcodes = await detectFrame(async pass => {
              if (pass === "original") return reader.detect(frame);
              const angle = pass === "left" ? -10 : pass === "right" ? 10 : 0;
              enhancedContext.fillStyle = "white";
              enhancedContext.fillRect(0, 0, enhanced.width, enhanced.height);
              enhancedContext.save();
              enhancedContext.translate(enhanced.width / 2, enhanced.height / 2);
              enhancedContext.rotate(angle * Math.PI / 180);
              enhancedContext.filter = "grayscale(1) contrast(2)";
              enhancedContext.drawImage(frame, -frame.width / 2, -frame.height / 2);
              enhancedContext.restore();
              return reader.detect(enhanced);
          }, signal);
          if (signal.aborted) break;
          const { code, confirmed } = cycle.read(barcodes);
          if (code && confirmed) {
            cycle.beginWrite();
            setWriting(true);
            setMessage(`Writing and verifying ${code}. Keep the card on the reader.`);
            try {
              const id = await writeCard.current(code, uid);
              cycle.finishWrite(true);
              if (!signal.aborted) setMessage(`NFC-${id} verified. Replace it with the next card. Scanning stays on.`);
            } catch (error) {
              cycle.finishWrite(false);
              if (!signal.aborted) setMessage(`${code} · ${error instanceof Error ? error.message : "Write failed."} Clear the reader before retrying.`);
            } finally {
              if (!signal.aborted) setWriting(false);
            }
          } else {
            setMessage(barcodes.length > 1 ? "More than one barcode is visible. Show only the card’s sticker."
              : code ? `Read ${code}. Waiting for a clear NFC card barcode.`
              : "Card detected. Center the sticker and keep the bars in focus.");
          }
        }
        await new Promise(resolve => setTimeout(resolve, state === "ready" ? 40 : 120));
      }
    } catch (error) {
      if (!signal.aborted) setMessage(error instanceof Error ? error.message : "Camera scanning failed.");
    } finally {
      if (session.current === scanSession) {
        scanning.current = false;
        setRunning(false);
        setWriting(false);
      }
    }
  }, [decoder, preview]);

  useEffect(() => {
    if (decoder && preview) void scanCards();
  }, [decoder, preview, scanCards]);

  function stopCamera() {
    session.current?.abort();
    session.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setPreview(false);
    scanning.current = false;
    setRunning(false);
    setMessage("Camera stopped.");
  }

  return <section className={styles.card}>
    <Script src="/nfc-camera/decoder.js" strategy="afterInteractive" onReady={() => {
      const api = (window as Window & { BarcodeDetectionAPI?: DecoderApi }).BarcodeDetectionAPI;
      if (!api) return;
      // Download/compile while staff position the camera, before the first card.
      void api.prepareZXingModule({ overrides: { locateFile: () => "/nfc-camera/zxing_reader.wasm" }, fireImmediately: true })
        .then(() => setDecoder(api))
        .catch(() => setMessage("The barcode decoder could not load. Refresh and try again."));
    }} onError={() => setMessage("The barcode decoder could not load. Refresh and try again.")} />
    <h3>Write VIP cards with a camera</h3>
    <div className={styles.actions}>
      {!preview && <button type="button" className="button secondary" disabled={starting} onClick={() => void openCamera()}>Start camera</button>}
      {preview && <>
        <label>Webcam<select value={deviceId} disabled={running || starting} onChange={event => void openCamera(event.target.value)}>
          {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
        </select></label>
        {running ? <span role="status">Continuous scanning is on</span>
          : <button type="button" className="button primary" disabled={!decoder} onClick={() => void scanCards()}>{decoder ? "Restart scanning" : "Preparing scanner…"}</button>}
        <button type="button" className="button secondary" disabled={writing} onClick={stopCamera}>Stop camera</button>
      </>}
    </div>
    <p>Start the camera once. Place one stickered card on the reader, wait for verification, then replace it with the next card. Each barcode is scanned and written automatically.</p>
    <video ref={video} muted autoPlay playsInline hidden={!preview} className={styles.camera} />
    <p role="status">{message}</p>
  </section>;
}
