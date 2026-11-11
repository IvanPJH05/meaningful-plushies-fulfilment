export const demoMode = import.meta.env.DEV
  && ["localhost", "127.0.0.1"].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).get("demo") === "1";

export const demoSession = { token: "local-demo", username: "demo", displayName: "Demo operator", role: "admin" } as const;

const orders = ["new_order", "uploading_audio", "sent_for_sewing", "packed"].map((status, index) => ({
  customisationSessionId: index === 3 ? "a1044000-0000-4000-8000-000000000001" : "",
  id: String(index + 1), orderNumber: String(1041 + index), status,
  orderDate: "2026-11-11", updatedAt: "2026-11-11T09:00:00Z",
  customerName: ["Avery", "Morgan", "Riley", "Jamie"][index],
  plushName: ["Buttons", "Pebble", "Clover", "Maple"][index],
  character: "Sample bear", product: "Personalised plushie", phone: "", address: "Sample delivery address",
  voiceLength: 0, paymentProcessor: "Sample payment", totalAmount: 89,
  courier: index === 3 ? "Sample courier" : "", trackingNumber: index === 3 ? "DEMO1044" : "",
}));

const manualIntake = {
  id: "demo-manual-1045", reference: "MP-1045", customerName: "Taylor", customerEmail: "",
  phoneOriginal: "", character: "Sample bear", productDisplayName: "Personalised plushie",
  customisationSessionId: "a1045000-0000-4000-8000-000000000002", shippingAddress: { province: "Selangor" },
  amountToCollect: 89, shippingRegion: "WEST", paymentReceipts: [], isCod: false, status: "awaiting_payment", shopifyOrderName: "",
  createdAt: "2026-11-11T09:00:00Z", paymentApprovedAt: "",
};

export async function mobileFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!demoMode) return fetch(input, init);
  const url = new URL(input);
  const path = url.pathname.replace(/^\/api\/mobile/, "");
  const json = (body: unknown, status = 200) => Response.json(body, { status });

  if (init?.method === "POST") {
    if (path === "/manual-orders" && JSON.parse(String(init.body)).action === "details") {
      return json({ details: { intake: manualIntake, form: { plushName: "Fern" }, voiceUrl: "", customisationSavedAt: manualIntake.createdAt } });
    }
    if (path === "/login") return json(demoSession);
    if (path === "/orders/transition") {
      const { orderId, fromStatus, toStatus } = JSON.parse(String(init.body));
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.status !== fromStatus) return json({ error: "ORDER_CHANGED" }, 409);
      order.status = toStatus;
      return json({ order });
    }
    return json({ error: "This action requires a connected account." }, 403);
  }

  if (path === "/demo-batch") return json({ orders: orders.filter((order) => ["2", "3", "4"].includes(order.id)).map((order) => ({ ...order, status: order.id === "2" ? "sent_for_sewing" : order.status, batch: order.id === "2" ? "Batch #0001" : "Batch #0002", scannedToday: order.id !== "2" })) });
  if (path === "/dashboard") {
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("q") || "").trim().replace(/^#(?=\d)/, "").toLowerCase();
    const matching = orders.filter((item) => (!status || status === "all" || status === item.status)
      && [item.orderNumber, item.customerName, item.phone, item.trackingNumber, item.plushName,
        item.product, item.character, "Standard delivery"].some((field) => field.toLowerCase().includes(search)) || (Boolean(search) && item.customisationSessionId.endsWith(search) && (!status || status === "all" || status === item.status)));
    const counts = Object.fromEntries(matching.map((item) => [item.status, matching.filter((order) => order.status === item.status).length]));
    return json({ orders: matching, counts, totalCount: matching.length, hasMore: false, latestUpdatedAt: orders[0].updatedAt });
  }
  if (path === "/orders/lookup") {
    const code = url.searchParams.get("code")?.trim().replace(/^#|^MP-?/i, "");
    return json({ order: orders.find((order) => order.orderNumber === code) ?? null });
  }
  if (path === "/reports") return json({
    sales: { gross: 356, totalCollected: 267, productDiscounted: 0, shippingDiscounted: 0, totalFees: 0, collected: 267 },
    channel: { shopify: { count: 3, sales: 267 }, tiktok: { count: 1, sales: 89 } },
    orderCount: 4,
  });
  if (path === "/manual-orders") return json({ intakes: [manualIntake] });
  const order = orders.find((item) => path === `/orders/${item.id}`);
  if (order) return json({ order, details: { email: "", subtotalAmount: 80, shippingAmount: 9, discountAmount: 0, outstandingBalance: 0, meaningfulNote: "A sample message for the production team.", certificateCode: "DEMO-" + order.orderNumber, shippingMethod: "Standard delivery", voice: null } });
  return json({ error: "This view requires a connected account." }, 404);
}
