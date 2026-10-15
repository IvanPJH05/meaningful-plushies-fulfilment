import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), client: { serverOnly: true } }));
vi.mock("../lib/mobile-api", () => ({ requireMobileSession: mocks.session, mobileServiceClient: () => mocks.client }));
vi.mock("../lib/supabase", () => ({ upsertSharedOrders: mocks.save }));
import { POST } from "../app/api/fulfilment/orders/import/route";
import { saveImportedOrders } from "../lib/order-import-save";
import type { Order } from "../lib/types";

const order = { id: "tiktok-fixture", orderNumber: "TT1321 586581292406506537", salesChannel: "tiktok", status: "new_order", orderDate: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", customerName: "Test", phone: "", email: "", address: "", product: "Billy", character: "Billy", plushName: 'Sam "Junior"', meaningfulNote: "", meaningfulMessage: "", certificateCode: "13216537106", trackingNumber: "", paymentProcessor: "" } as Order;
function request(body: unknown = { orders: [order] }) { return new Request("https://app.test/api/fulfilment/orders/import", { method: "POST", headers: { Authorization: "Bearer fixture-session" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); mocks.session.mockResolvedValue({ role: "admin" }); mocks.save.mockResolvedValue({ saved: true, accountingWarning: null }); });

describe("authenticated CSV import saves", () => {
  it("uses the server connection after validating the session, retaining quoted customisation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.session.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]);
    expect(mocks.save).toHaveBeenCalledWith([order], undefined, mocks.client);
    expect(await response.json()).toEqual({ saved: true, accountingWarning: null });
  });
  it.each([["SIGN_IN_REQUIRED", 401], ["WAREHOUSE_ACCESS_REQUIRED", 403]])("rejects %s before writing", async (error, status) => {
    mocks.session.mockRejectedValue(new Error(error));
    expect((await POST(request())).status).toBe(status);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{}, { orders: [] }, { orders: [null] }, { orders: [{ ...order, status: "invalid" }] }, { orders: [order, order] }, { orders: Array.from({ length: 26 }, (_, i) => ({ ...order, id: String(i) })) }])("rejects malformed import batches", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("returns accounting warnings as a successful order save", async () => {
    mocks.save.mockResolvedValue({ saved: true, accountingWarning: "Retry accounting" });
    expect(await (await POST(request())).json()).toEqual({ saved: true, accountingWarning: "Retry accounting" });
  });
  it("sends only 25 rows per server request and combines accounting warnings", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ saved: true, accountingWarning: "Retry accounting" })).mockResolvedValue(Response.json({ saved: true, accountingWarning: null }));
    vi.stubGlobal("fetch", fetcher);
    const orders = Array.from({ length: 26 }, (_, index) => ({ ...order, id: String(index) }));
    expect(await saveImportedOrders(orders, "fixture-session")).toEqual({ saved: true, accountingWarning: "Retry accounting" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).orders).toHaveLength(25);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).orders).toHaveLength(1);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer fixture-session");
  });
  it("stops on a rejected save instead of reporting import success", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "Sign in again" }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(saveImportedOrders([order], "expired")).rejects.toThrow("Sign in again");
  });
});
