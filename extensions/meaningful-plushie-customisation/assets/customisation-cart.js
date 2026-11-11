(function (root) {
  "use strict";
  const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function buildItem(entries, sessionId) {
    if (!sessionPattern.test(sessionId || "")) throw new Error("Your customisation reference is missing. Please try again.");
    const values = new Map(entries);
    const id = Number(values.get("id"));
    const quantity = Number(values.get("quantity") || 1);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error("Please choose a valid product and quantity.");
    }
    const properties = {};
    for (const [key, value] of entries) {
      const match = /^properties\[([^\]]+)\]$/.exec(key);
      if (match && typeof value === "string") Object.defineProperty(properties, match[1], { value, enumerable: true, configurable: true, writable: true });
    }
    properties.customisation_session_id = sessionId;
    const item = { id, quantity, properties };
    if (values.get("selling_plan")) item.selling_plan = String(values.get("selling_plan"));
    return item;
  }
  function controls(form) {
    const buttons = [...form.querySelectorAll("button, input[type='submit']")].filter((button) =>
      (button.form || button.closest("form")) === form && (button.type === "submit" || button.name === "add" || button.closest(".shopify-payment-button")));
    return [...new Set([...buttons, ...form.querySelectorAll("shopify-accelerated-checkout, shopify-buy-it-now-button")])];
  }
  function controlForEvent(event, form) {
    // Wallet buttons live in a shadow root: event.target can be the host rather
    // than a button. The composed path and host list cover both representations.
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return controls(form).find((control) => path.some((target) => target === control || (target && target.nodeType === 1 && control.contains(target)))) || null;
  }
  function isCheckoutControl(control) {
    return Boolean(control?.matches("shopify-accelerated-checkout, shopify-buy-it-now-button")
      || control?.closest(".shopify-payment-button") || /buy\s*(it\s*)?now|beli\s*sekarang/i.test(control?.textContent || ""));
  }
  async function ensureItem(item, fetcher, base = "/") {
    const endpoint = (path) => `${base.replace(/\/$/, "")}/${path}`;
    const read = async (path, options) => {
      const response = await fetcher(endpoint(path), { credentials: "same-origin", ...options });
      const body = await response.json();
      if (!response.ok) throw new Error(body.description || body.message || "Could not add your customised product. Please try again.");
      return body;
    };
    const cart = await read("cart.js");
    const existing = (cart.items || []).find((line) => String(line.variant_id || line.id) === String(item.id)
      && line.properties?.customisation_session_id === item.properties.customisation_session_id);
    if (existing) {
      if (existing.quantity !== item.quantity || !Object.entries(item.properties).every(([key, value]) => existing.properties?.[key] === value)) {
        throw new Error("This customisation is already in your cart with different details. Please remove that cart item before adding the updated version.");
      }
      return existing; // A retry after a lost response must not add a second item.
    }
    const result = await read("cart/add.js", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items: [item] }) });
    const saved = (result.items || [result]).find((line) => String(line.variant_id || line.id) === String(item.id)
      && line.properties?.customisation_session_id === item.properties.customisation_session_id);
    if (!saved || !Object.entries(item.properties).every(([key, value]) => saved.properties?.[key] === value)) {
      throw new Error("Shopify did not retain your customisation. Checkout has been stopped; please try again.");
    }
    return saved;
  }
  async function ensureCheckoutReady(item, fetcher, base = "/") {
    const saved = await ensureItem(item, fetcher, base);
    const endpoint = (path) => `${base.replace(/\/$/, "")}/${path}`;
    const mirror = await fetcher(endpoint("cart/update.js"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attributes: { mp_customisation_session_id: item.properties.customisation_session_id } }) });
    if (!mirror.ok) throw new Error("Your customisation is saved, but checkout could not be prepared. Please try again.");
    // The add response alone is insufficient: confirm the persisted cart,
    // including the backup reference, before navigating to checkout.
    const response = await fetcher(endpoint("cart.js"), { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Could not verify your customisation in the cart. Please try again.");
    const cart = await response.json();
    const lines = (cart.items || []).filter(line => String(line.variant_id || line.id) === String(item.id));
    const persisted = lines.find(line => line.properties?.customisation_session_id === item.properties.customisation_session_id);
    if (!persisted || persisted.quantity !== item.quantity || !Object.entries(item.properties).every(([key, value]) => persisted.properties?.[key] === value)
      || cart.attributes?.mp_customisation_session_id !== item.properties.customisation_session_id) {
      throw new Error("Shopify did not retain your customisation reference. Checkout has been stopped; please try again.");
    }
    if (lines.some(line => !sessionPattern.test(line.properties?.customisation_session_id || ""))) {
      throw new Error("Your cart also contains this plushie without customisation. Remove that item from the cart before checking out.");
    }
    return saved;
  }
  async function add(form, sessionId) {
    const item = buildItem([...new FormData(form).entries()], sessionId);
    return ensureCheckoutReady(item, root.fetch.bind(root), root.Shopify?.routes?.root || "/");
  }
  const api = { buildItem, ensureItem, ensureCheckoutReady, controls, controlForEvent, isCheckoutControl, add };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MPCustomisationCart = api;
})(typeof window !== "undefined" ? window : null);
