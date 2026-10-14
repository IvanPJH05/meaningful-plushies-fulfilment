import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { customisationSessionIds, sessionIdForOrder } from "./customisation-links.ts";
const require = createRequire(import.meta.url);
const cart = require("../extensions/meaningful-plushie-customisation/assets/customisation-cart.js");
const session = "00000000-0000-4000-8000-000000000001";
const entries = [["id", "123"], ["quantity", "1"], ["properties[Name]", "Example"], ["properties[customisation_session_id]", "old"]];
const item = cart.buildItem(entries, session);
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
test("reads REST properties, GraphQL nodes and cart fallback without inventing missing IDs", () => {
  assert.deepEqual(customisationSessionIds({ line_items: [{ properties: { customisation_session_id: session } }] }), [session]);
  assert.deepEqual(customisationSessionIds({ lineItems: { nodes: [{ customAttributes: [{ key: "customisation_session_id", value: session }] }] }, customAttributes: [{ key: "mp_customisation_session_id", value: session }] }), [session]);
  assert.deepEqual(customisationSessionIds({ lineItems: [{ customAttributes: [] }], customAttributes: [] }), []);
});

test("builds explicit line properties including the authoritative session", () => {
  assert.deepEqual(item, { id: 123, quantity: 1, properties: { Name: "Example", customisation_session_id: session } });
  assert.throws(() => cart.buildItem(entries, ""));
});
test("verifies Shopify retained all properties before checkout", async () => {
  const calls: string[] = [];
  const saved = await cart.ensureItem(item, async (url: string, options: { body?: string }) => {
    calls.push(url);
    if (url.endsWith("cart.js")) return response({ items: [] });
    assert.deepEqual(JSON.parse(options.body!), { items: [item] });
    return response({ items: [item] });
  }, "/en/");
  assert.equal(saved.properties.customisation_session_id, session);
  assert.deepEqual(calls, ["/en/cart.js", "/en/cart/add.js"]);
});
test("stops when Shopify loses the ID or a customer form field", async () => {
  for (const properties of [{ Name: "Example" }, { customisation_session_id: session }]) {
    await assert.rejects(cart.ensureItem(item, async (url: string) => response(url.endsWith("cart.js") ? { items: [] } : { items: [{ id: 123, properties }] })), /did not retain/);
  }
});
test("a retry after a lost add response reuses the existing customised line", async () => {
  let calls = 0;
  await cart.ensureItem(item, async () => { calls++; return response({ items: [item] }); });
  assert.equal(calls, 1);
  await assert.rejects(cart.ensureItem({ ...item, quantity: 2 }, async () => response({ items: [item] })), /different details/);
});
test("surfaces Shopify add failures", async () => {
  await assert.rejects(cart.ensureItem(item, async (url: string) => url.endsWith("cart.js") ? response({ items: [] }) : response({ description: "Sold out" }, false)), /Sold out/);
});
test("matches by line reference rather than session list position", () => {
  const orders = [{ customisationSessionId: "b" }, {}, { customisationSessionId: "a" }];
  assert.deepEqual(orders.map(order => sessionIdForOrder(order, orders, ["a", "b"])), ["b", "", "a"]);
  assert.equal(sessionIdForOrder({}, [{}], ["a"]), "a");
  assert.equal(sessionIdForOrder({}, [{}], ["a", "b"]), "");
});
test("recognises wallet events retargeted to a shadow host", () => {
  const host = { nodeType: 1, matches: (s: string) => s.includes("shopify-accelerated-checkout"), closest: () => null, contains: () => false };
  const form = { querySelectorAll: (selector: string) => selector.startsWith("button") ? [] : [host] };
  assert.equal(cart.controlForEvent({ target: host, composedPath: () => [host] }, form), host);
  assert.equal(cart.isCheckoutControl(host), true);
});
