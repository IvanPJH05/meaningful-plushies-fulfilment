import test from "node:test";
import assert from "node:assert/strict";
import { batchNeedsAudio, batchNeedsLabel, canJoinBatch, matchBatchLabel } from "./fulfilment-batches.ts";
import type { Order } from "./types";
test("only preparation-stage orders can join a batch", () => {
  for (const stage of ["new_order", "uploading_audio"]) assert.ok(canJoinBatch(stage));
  for (const stage of [undefined, "awaiting_customisation", "sent_for_sewing", "packed", "shipped", "issue"]) assert.ok(!canJoinBatch(stage));
});
test("labels are paired only to batch members and to the correct marketplace", () => {
  const orders = [{id:"a",orderNumber:"1887",salesChannel:"shopify"},{id:"b",orderNumber:"1887",salesChannel:"shopify"},{id:"c",orderNumber:"TT1321 586581292406506537",salesChannel:"tiktok"}] as Order[];
  assert.deepEqual(matchBatchLabel(orders,{source:"jnt",reference:"1887"}).map(order=>order.id),["a","b"]);
  assert.deepEqual(matchBatchLabel(orders,{source:"tiktok",reference:"586581292406506537"}).map(order=>order.id),["c"]);
  assert.deepEqual(matchBatchLabel(orders,{source:"jnt",reference:"1885"}),[]);
  assert.deepEqual(matchBatchLabel(orders,{source:null,reference:"1887"}),[]);
});
test("COD can use generated labels, and orders requiring audio cannot silently skip it", () => {
  assert.equal(batchNeedsLabel({paymentProcessor:"Cash on delivery (COD)"}),false);
  assert.equal(batchNeedsLabel({paymentProcessor:"Stripe"}),true);
  assert.equal(batchNeedsAudio({voiceLength:5,meaningfulMessage:""}),true);
  assert.equal(batchNeedsAudio({voiceLength:0,meaningfulMessage:"",tikTokFileName:"voice.mp3"}),true);
  assert.equal(batchNeedsAudio({voiceLength:0,meaningfulMessage:""}),false);
});
