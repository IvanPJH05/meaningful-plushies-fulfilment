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
  async function add(form, sessionId) {
    const item = buildItem([...new FormData(form).entries()], sessionId);
    const base = root.Shopify?.routes?.root || "/";
    const saved = await ensureItem(item, root.fetch.bind(root), base);
    // The verified line property is authoritative. A cart-level mirror is only
    // a compatibility fallback, and must not undo a successful item addition.
    try {
      await root.fetch(`${base.replace(/\/$/, "")}/cart/update.js`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attributes: { mp_customisation_session_id: sessionId } }) });
    } catch { /* The line property was already verified. */ }
    return saved;
  }
  const api = { buildItem, ensureItem, controls, controlForEvent, isCheckoutControl, add };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MPCustomisationCart = api;
})(typeof window !== "undefined" ? window : null);
