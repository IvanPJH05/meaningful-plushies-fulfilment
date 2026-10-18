"use client";
import { useEffect, useRef, useState } from "react";
import { type BatchDetail } from "../lib/fulfilment-batches";
import { batchAudioSource } from "../lib/batch-audio-source";
import { prepareBatchAudioFiles } from "../lib/prepare-batch-audio";
import { buildAudioZip } from "../lib/batch-zip-client";
import { voiceBackupFileName } from "../lib/voice-file-name";

export type AudioPreparation = { phase: "idle" | "audio" | "zip" | "ready" | "error"; completed: number; total: number; started: number; error: string; blob: Blob | null; missing: string[]; available: number };
const idle: AudioPreparation = { phase: "idle", completed: 0, total: 0, started: 0, error: "", blob: null, missing: [], available: 0 };
export function useBatchAudioPreparation(token: string, detail: BatchDetail | null, enabled: boolean) {
  // Stage/version changes must not restart work. Replaced audio or changed ZIP
  // filenames must invalidate it, so never key this cache by batch ID alone.
  const inputs = detail ? { id: detail.batch.id, orders: detail.orders.map(order => ({
    id: order.id, name: voiceBackupFileName(order, "mp3"), source: batchAudioSource(order),
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
    const expected = detail.orders, started = Date.now();
    if (!expected.length) return;
    const update = (patch: Partial<AudioPreparation>) => { if (!signal.aborted) setState(current => ({ ...current, ...patch, key })); };
    update({ ...idle, phase: "audio", total: expected.length, started });
    void (async () => {
      const { files, available, missing } = await prepareBatchAudioFiles(expected, detail.batch.id, token, signal, update);
      if (signal.aborted) return;
      update({ phase: "zip", started: Date.now() });
      const blob = available ? await buildAudioZip(files, signal) : null;
      update({ phase: "ready", blob, missing, available });
    })().catch(error => { if (!signal.aborted) update({ phase: "error", error: error instanceof Error ? error.message : "Audio ZIP failed." }); });
    return () => controller.abort();
    // The key contains every input used to build the ZIP, excluding stage data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, enabled, attempt]);
  return { ...(state.key === key ? state : idle), retry: () => setAttempt(value => value + 1) };
}
