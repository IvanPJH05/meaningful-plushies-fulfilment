import assert from "node:assert/strict";
import test from "node:test";
import { mergeRefreshedOrder } from "./order-refresh.ts";
import type { Order } from "./types";

test("late refresh cannot revert a committed stage", () => {
  const saved = { id: "one", status: "uploading_audio", updatedAt: "2026-10-13T15:00:02Z" } as Order;
  const stale = { ...saved, status: "new_order", updatedAt: "2026-10-13T15:00:01Z" } as Order;
  assert.equal(mergeRefreshedOrder(saved, stale), saved);
});

test("summary refresh retains assets from the detail record", () => {
  const detail = { id: "one", status: "new_order", updatedAt: "2026-10-13T15:00:01Z", tikTokFileDataUrl: "data:audio/test;base64,abc" } as Order;
  const summary = { id: "one", status: "uploading_audio", updatedAt: "2026-10-13T15:00:02Z" } as Order;
  const merged = mergeRefreshedOrder(detail, summary);
  assert.equal(merged.status, "uploading_audio");
  assert.equal(merged.tikTokFileDataUrl, detail.tikTokFileDataUrl);
});
