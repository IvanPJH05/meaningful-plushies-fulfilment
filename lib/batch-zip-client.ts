export function buildAudioZip(files: Array<{ name: string; bytes: Uint8Array }>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./batch-zip-worker.ts", import.meta.url));
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("Audio ZIP timed out. Use a smaller batch.")); }, 180000);
    const done = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => { done(); if (event.data.blob) resolve(event.data.blob); else reject(new Error(event.data.error || "Audio ZIP failed.")); };
    worker.onerror = () => { done(); reject(new Error("Audio ZIP could not be prepared. Refresh and try again.")); };
    worker.postMessage(files, files.map(file => file.bytes.buffer));
  });
}
