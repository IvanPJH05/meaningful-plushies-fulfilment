import test from "node:test";
import assert from "node:assert/strict";
import { visibleRows } from "./visible-rows.ts";

test("a long list renders a bounded window while preserving its full scroll height", () => {
  for (const scroll of [0, 48, 24000, 1000000]) {
    const window = visibleRows(1061, scroll, 480, 48);
    assert(window.end - window.start <= 26);
    assert.equal(window.before + (window.end - window.start) * 48 + window.after, 1061 * 48);
  }
});
test("first, middle and final orders remain reachable", () => {
  assert.equal(visibleRows(1061, 0, 480, 48).start, 0);
  const middle = visibleRows(1061, 500 * 48, 480, 48);
  assert(middle.start <= 500 && middle.end > 500);
  assert.equal(visibleRows(1061, 1061 * 48, 480, 48).end, 1061);
});
test("filtering to an empty or short list cannot leave a blank window at a stale scroll position", () => {
  assert.deepEqual(visibleRows(0, 50000, 480, 48), { start: 0, end: 0, before: 0, after: 0 });
  assert.deepEqual(visibleRows(1, 50000, 480, 48), { start: 0, end: 1, before: 0, after: 0 });
});
