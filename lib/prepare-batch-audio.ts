import type { Order } from "./types";
import { batchAudioSource } from "./batch-audio-source.ts";
import { voiceBackupFileName } from "./voice-file-name.ts";
export async function prepareBatchAudioFiles(expected: Order[], batchId: string, token: string, signal: AbortSignal, onProgress: (progress: { missing?: string[]; completed: number; available?: number }) => void = () => {}) {
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      let total = 0;
      const missing: string[] = [];
      for (const [index, order] of expected.entries()) {
        if (!batchAudioSource(order)) { missing.push(order.id); onProgress({ missing: [...missing], completed: index + 1 }); continue; }
        const response = await fetch(`/api/fulfilment/batches/audio?id=${encodeURIComponent(batchId)}&orderId=${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
        if (!response.ok) { const result = await response.json().catch(() => ({})); if (response.status === 400 && result.code === "VOICE_NOT_UPLOADED") { missing.push(order.id); onProgress({ missing: [...missing], completed: index + 1 }); continue; } throw new Error(`Could not download audio for order #${order.orderNumber}: ${result.error ?? response.status}`); }
        const type = (response.headers.get("content-type") ?? "").split(";")[0];
        if (!type.startsWith("audio/") && type !== "application/octet-stream") throw new Error(`This order has no downloadable audio file: #${order.orderNumber}`);
        const bytes = new Uint8Array(await response.arrayBuffer()); total += bytes.length;
        if (!bytes.length || total > 200 * 1024 * 1024) throw new Error("Audio ZIP is empty or exceeds 200 MB. Use a smaller batch.");
        files.push({ name: `${String(index + 1).padStart(3, "0")}-${voiceBackupFileName(order, "mp3")}`, bytes });
        onProgress({ completed: index + 1, available: files.length });
      }
      signal.throwIfAborted();
      
      const available = files.length;
      if (available && missing.length) files.push({ name: "voice-not-uploaded.txt", bytes: new TextEncoder().encode("Voice not uploaded for these orders:\n" + expected.filter(order => missing.includes(order.id)).map(order => "#" + order.orderNumber).join("\n")) });

 return { files, available, missing };
}
