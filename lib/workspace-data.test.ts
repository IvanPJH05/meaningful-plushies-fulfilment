import assert from "node:assert/strict";
import test from "node:test";
import { sharedTablesForWorkspace, WorkspaceDataCache } from "./workspace-data.ts";

test("fulfilment loads sales dependencies without unrelated workspaces", () => {
  assert.deepEqual(sharedTablesForWorkspace("orders", "fulfilment", "admin"), ["manual_orders", "payment_processor_settings", "sales_fee_settings", "creator_profiles"]);
  assert.deepEqual(sharedTablesForWorkspace("orders", "fulfilment"), []);
});
test("stock includes offline sales and envelope printing retains staff font settings", () => {
  assert.deepEqual(sharedTablesForWorkspace("stock", "inventory", "admin"), ["stock_settings", "accounting_transactions"]);
  assert(sharedTablesForWorkspace("accounting_transactions", "accounting", "admin").includes("stock_settings"));
  assert(sharedTablesForWorkspace("print_envelope", "fulfilment", "staff").includes("envelope_print_settings"));
  assert(!sharedTablesForWorkspace("orders", "fulfilment", "staff").includes("creator_profiles"));
});
test("content and Meta read only their workspace data; monthly journal owns its loader", () => {
  assert.deepEqual(sharedTablesForWorkspace("content_dashboard", "content", "admin"), ["content_plan_items", "content_idea_items"]);
  assert.deepEqual(sharedTablesForWorkspace("meta_capi", "settings", "admin"), ["meta_capi_settings", "meta_capi_logs"]);
  assert.deepEqual(sharedTablesForWorkspace("monthly_journal_accounts", "monthly_journal", "admin"), []);
  assert.deepEqual(sharedTablesForWorkspace("creator_dashboard", "creator", "creator"), ["creator_profiles", "creator_commissions", "creator_payouts"]);
});
test("navigation caches successful reads and hidden realtime changes wait for entry", async () => {
  const cache = new WorkspaceDataCache();
  const calls: string[] = [];
  const loaders = { orders: async () => { calls.push("orders"); }, content: async () => { calls.push("content"); } };
  await cache.load(["orders"], loaders);
  cache.invalidate(["content"]);
  await cache.load(["orders"], loaders);
  assert.deepEqual(calls, ["orders"]);
  await cache.load(["content"], loaders);
  await cache.load(["orders", "content"], loaders);
  assert.deepEqual(calls, ["orders", "content"]);
});
test("concurrent readers share one request", async () => {
  const cache = new WorkspaceDataCache();
  let calls = 0;
  const loaders = { data: async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); } };
  assert.deepEqual(await Promise.all([cache.load(["data"], loaders), cache.load(["data"], loaders)]), [[], []]);
  assert.equal(calls, 1);
});
test("failed reads are reported and can retry without dropping successful data", async () => {
  const cache = new WorkspaceDataCache();
  let failing = true;
  let goodReads = 0;
  const loaders = { good: async () => { goodReads++; }, bad: async () => { if (failing) throw new Error("offline"); } };
  assert.deepEqual(await cache.load(["good", "bad"], loaders), ["bad"]);
  assert(!cache.isReady(["bad"]));
  failing = false;
  assert.deepEqual(await cache.load(["good", "bad"], loaders), []);
  assert.equal(goodReads, 1);
});
test("a change arriving during a read causes a fresh read before marking ready", async () => {
  const cache = new WorkspaceDataCache();
  let calls = 0;
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const loaders = { data: async () => { calls++; if (calls === 1) { started(); await wait; } } };
  const reading = cache.load(["data"], loaders);
  await began;
  cache.invalidate(["data"]);
  release();
  assert.deepEqual(await reading, []);
  assert.equal(calls, 2);
  assert(cache.isReady(["data"]));
});
