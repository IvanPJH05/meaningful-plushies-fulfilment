export function buildAudioZip(files: Array<{ name: string; bytes: Uint8Array }>, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Audio ZIP cancelled.")); return; }
    const worker = new Worker(new URL("./batch-zip-worker.ts", import.meta.url));
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { done(); reject(new Error("Audio ZIP cancelled.")); };
    const timer = setTimeout(() => { done(); reject(new Error("Audio ZIP timed out. Use a smaller batch.")); }, 180000);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => { done(); if (event.data.blob) resolve(event.data.blob); else reject(new Error(event.data.error || "Audio ZIP failed.")); };
    worker.onerror = () => { done(); reject(new Error("Audio ZIP could not be prepared. Refresh and try again.")); };
    worker.postMessage(files, files.map(file => file.bytes.buffer));
  });
}
