"use client";
import { useEffect, useRef, useState } from "react";
import { batchNeedsAudio, type BatchDetail } from "../lib/fulfilment-batches";
import { buildAudioZip } from "../lib/batch-zip-client";
import { voiceBackupFileName } from "../lib/voice-file-name";

export type AudioPreparation = { phase: "idle" | "audio" | "zip" | "ready" | "error"; completed: number; total: number; started: number; error: string; blob: Blob | null };
const idle: AudioPreparation = { phase: "idle", completed: 0, total: 0, started: 0, error: "", blob: null };
export function useBatchAudioPreparation(token: string, detail: BatchDetail | null, enabled: boolean) {
  // Stage/version changes must not restart work. Replaced audio or changed ZIP
  // filenames must invalidate it, so never key this cache by batch ID alone.
  const inputs = detail ? { id: detail.batch.id, orders: detail.orders.filter(batchNeedsAudio).map(order => ({
    id: order.id, name: voiceBackupFileName(order, "mp3"), source: order.salesChannel === "tiktok" ? order.tikTokFileDataUrl : order.meaningfulMessage,
  })) } : null;
  const previous = useRef(inputs);
  if (previous.current?.id !== inputs?.id || previous.current?.orders.length !== inputs?.orders.length || inputs?.orders.some((order, index) => {
    const before = previous.current?.orders[index];
    return before?.id !== order.id || before.name !== order.name || before.source !== order.source;
  })) previous.current = inputs;
  const key = previous.current;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AudioPreparation & { key?: typeof key }>(idle);
  useEffect(() => {
    if (!enabled || !detail) return;
    const controller = new AbortController(), signal = controller.signal;
    const expected = detail.orders.filter(batchNeedsAudio), started = Date.now();
    if (!expected.length) return;
    const update = (patch: Partial<AudioPreparation>) => { if (!signal.aborted) setState(current => ({ ...current, ...patch, key })); };
    update({ ...idle, phase: "audio", total: expected.length, started });
    void (async () => {
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      let total = 0;
      for (const [index, order] of expected.entries()) {
        const response = await fetch(`/api/fulfilment/batches/audio?id=${encodeURIComponent(detail.batch.id)}&orderId=${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
        if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(`Could not download audio for order #${order.orderNumber}: ${result.error ?? response.status}`); }
        const type = (response.headers.get("content-type") ?? "").split(";")[0];
        if (!type.startsWith("audio/") && type !== "application/octet-stream") throw new Error(`This order has no downloadable audio file: #${order.orderNumber}`);
        const bytes = new Uint8Array(await response.arrayBuffer()); total += bytes.length;
        if (!bytes.length || total > 200 * 1024 * 1024) throw new Error("Audio ZIP is empty or exceeds 200 MB. Use a smaller batch.");
        files.push({ name: `${String(index + 1).padStart(3, "0")}-${voiceBackupFileName(order, "mp3")}`, bytes });
        update({ completed: index + 1 });
      }
      if (signal.aborted) return;
      update({ phase: "zip", started: Date.now() });
      const blob = await buildAudioZip(files, signal);
      update({ phase: "ready", blob });
    })().catch(error => { if (!signal.aborted) update({ phase: "error", error: error instanceof Error ? error.message : "Audio ZIP failed." }); });
    return () => controller.abort();
    // The key contains every input used to build the ZIP, excluding stage data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, enabled, attempt]);
  return { ...(state.key === key ? state : idle), retry: () => setAttempt(value => value + 1) };
}
