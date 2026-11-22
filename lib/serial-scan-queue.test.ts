import test from "node:test";
import assert from "node:assert/strict";
import { createSerialScanQueue } from "./serial-scan-queue.ts";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("an immediate card scan waits for its order lookup and retains its capture time", async () => {
  let finishLookup!: () => void;
  const lookup = new Promise<void>(resolve => { finishLookup = resolve; });
  const completed: { value: string; at: number }[] = [];
  let active = 0;
  const queue = createSerialScanQueue<{ value: string; at: number }>({
    canProcess: () => true,
    onError: error => { throw error; },
    process: async scan => {
      assert.equal(++active, 1, "scans must never run concurrently");
      if (scan.value === "order") await lookup;
      completed.push(scan);
      active--;
    },
  });
  queue.enqueue({ value: "order", at: 100 });
  queue.enqueue({ value: "card", at: 101 });
  assert.equal(active, 1);
  assert.deepEqual(completed, []);
  finishLookup();
  await flush();
  assert.deepEqual(completed, [{ value: "order", at: 100 }, { value: "card", at: 101 }]);
});

test("card-first scans stay ordered, and recording pauses the next parcel", async () => {
  let paused = false;
  const completed: string[] = [];
  const queue = createSerialScanQueue<string>({
    canProcess: () => !paused,
    onError: error => { throw error; },
    process: async value => { completed.push(value); if (value === "order") paused = true; },
  });
  queue.enqueue("card"); queue.enqueue("order"); queue.enqueue("next order");
  await flush();
  assert.deepEqual(completed, ["card", "order"]);
  paused = false;
  queue.resume();
  await flush();
  assert.deepEqual(completed, ["card", "order", "next order"]);
});

test("a failed scan clears waiting scans rather than pairing the next parcel", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const completed: string[] = [], errors: unknown[] = [];
  const queue = createSerialScanQueue<string>({
    canProcess: () => true,
    onError: error => errors.push(error),
    process: async value => { if (value === "bad order") { await wait; throw Error("lookup failed"); } completed.push(value); },
  });
  queue.enqueue("bad order"); queue.enqueue("card");
  release(); await flush();
  assert.equal(errors.length, 1);
  assert.deepEqual(completed, []);
  queue.enqueue("retry order"); await flush();
  assert.deepEqual(completed, ["retry order"]);
});
