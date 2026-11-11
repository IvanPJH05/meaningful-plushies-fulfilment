import test from "node:test";
import assert from "node:assert/strict";
import { buildAudioZip } from "./batch-zip-client.ts";

test("ZIP worker returns the prepared download and releases resources", async context => {
  const original = globalThis.Worker;
  let terminated = false;
  const blob = new Blob(["prepared ZIP"]);
  globalThis.Worker = class {
    onmessage?: (event: unknown) => void;
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { blob } })); }
    terminate() { terminated = true; }
  } as unknown as typeof Worker;
  context.after(() => { globalThis.Worker = original; });
  assert.equal(await buildAudioZip([{ name: "voice.mp3", bytes: new Uint8Array([1]) }]), blob);
  assert.equal(terminated, true);
});

test("switching away cancels an unfinished ZIP worker", async context => {
  const original = globalThis.Worker;
  let terminated = false, created = 0;
  globalThis.Worker = class {
    constructor() { created++; }
    postMessage() {}
    terminate() { terminated = true; }
  } as unknown as typeof Worker;
  context.after(() => { globalThis.Worker = original; });
  const controller = new AbortController();
  const result = buildAudioZip([], controller.signal);
  controller.abort();
  await assert.rejects(result, /cancelled/);
  assert.equal(terminated, true);
  await assert.rejects(buildAudioZip([], controller.signal), /cancelled/);
  assert.equal(created, 1);
});
