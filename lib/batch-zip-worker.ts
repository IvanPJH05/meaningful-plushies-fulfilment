import { audioZip } from "./batch-zip";
self.addEventListener("message", (event: MessageEvent<Array<{ name: string; bytes: Uint8Array }>>) => {
  try { self.postMessage({ blob: audioZip(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Audio ZIP could not be created." }); }
});
