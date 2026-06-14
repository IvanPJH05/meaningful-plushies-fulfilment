import assert from "node:assert/strict";
import test from "node:test";
import { summarizeStock } from "./stock.ts";
import type { Order } from "./types";

const base = { character: "BILLY", voiceLength: 5 } as Order;

test("tracks character stock and one shared voice inventory", () => {
  const result = summarizeStock([
    { ...base, id: "1", character: "Billy", voiceLength: 5 },
    { ...base, id: "2", character: "TOOTSIE", voiceLength: 10 },
    { ...base, id: "3", character: "BILLY", voiceLength: 20 },
  ], [
    { itemKey: "BILLY", initialStock: 10 },
    { itemKey: "TOOTSIE", initialStock: 8 },
    { itemKey: "VOICE", initialStock: 20 },
  ]);

  assert.deepEqual(result.characters.slice(0, 2).map(({ name, sold, remaining }) => ({ name, sold, remaining })), [
    { name: "BILLY", sold: 2, remaining: 8 },
    { name: "TOOTSIE", sold: 1, remaining: 7 },
  ]);
  assert.deepEqual(result.voices, [{ length: 5, sold: 1 }, { length: 10, sold: 1 }, { length: 20, sold: 1 }]);
  assert.equal(result.voiceRemaining, 17);
});
