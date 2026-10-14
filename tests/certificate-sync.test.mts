import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), graphql: vi.fn() }));
vi.mock("../lib/mobile-api", () => ({ mobileServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("../lib/shopify-orders", async importOriginal => ({ ...await importOriginal<object>(), shopifyGraphql: mocks.graphql }));
import { syncLinkedCertificate, processCertificateSync } from "../lib/certificate-sync";
import type { Order } from "../lib/types";

const order = { id: "order-one", orderNumber: "1886", certificateCode: "18861234567", plushName: "Updated name", plushGender: "Female", plushBirthDate: "28/11/2025", plushBirthPlace: "", plushFavouritePerson: "Sam", plushBelongsTo: "Alex", meaningfulNote: "New note", product: "Billy", character: "Billy" } as Order;
const keys = ["code", "order_number", "id_name", "gender", "born_on", "birthplace", "favourite_person", "belongs_to", "meaningful_note", "plush_background_bottom", "plush_details", "certificate"];
const object = { id: "gid://shopify/Metaobject/123", type: "version_1_certs", handle: "existing-original-handle", fields: [{ key: "code", value: order.certificateCode }, { key: "order_number", value: "#1886" }] };
const definition = { fieldDefinitions: keys.map(key => ({ key, name: key })) };
function prepare(linked = true) {
  mocks.rpc.mockResolvedValueOnce({ data: { sessions: linked ? [{ certificate_code: order.certificateCode, certificate_metaobject_id: object.id }] : [], duplicate: false }, error: null });
  mocks.graphql.mockResolvedValueOnce({ data: { metaobject: object, metaobjectByHandle: object, metaobjectDefinitionByType: definition } }).mockResolvedValueOnce({ data: { metaobjectUpsert: { metaobject: { id: object.id }, userErrors: [] } } });
}
beforeEach(() => { vi.resetAllMocks(); process.env.SHOPIFY_SHOP_DOMAIN = "fixture.myshopify.com"; });
describe("linked certificate synchronization", () => {
  it("writes the existing handle, preserves identity/media link, and sends explicit clears", async () => {
    prepare(); await syncLinkedCertificate(order);
    const variables = mocks.graphql.mock.calls[1][2];
    expect(variables.handle).toEqual({ type: object.type, handle: object.handle });
    expect(variables.metaobject.fields).toContainEqual({ key: "birthplace", value: "" });
    expect(variables.metaobject.fields).toContainEqual({ key: "id_name", value: "Updated name" });
    expect(variables.metaobject.fields.some((field: { key: string }) => ["code", "created_at", "order_number", "meaningful_message"].includes(field.key))).toBe(false);
  });
  it("uses code lookup only when no session metaobject ID is linked", async () => {
    prepare(false); await syncLinkedCertificate(order);
    expect(mocks.graphql.mock.calls[0][2].handle).toEqual({ type: object.type, handle: order.certificateCode });
    expect(mocks.graphql.mock.calls[1][2].handle.handle).toBe(object.handle);
  });
  it("does not create a missing certificate", async () => {
    prepare(); mocks.graphql.mockReset().mockResolvedValueOnce({ data: { metaobject: null, metaobjectDefinitionByType: definition } });
    await expect(syncLinkedCertificate(order)).rejects.toThrow("not found"); expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });
  it("rejects a certificate belonging to another order", async () => {
    prepare(); mocks.graphql.mockReset().mockResolvedValueOnce({ data: { metaobject: { ...object, fields: [...object.fields.slice(0, 1), { key: "order_number", value: "#9999" }] }, metaobjectDefinitionByType: definition } });
    await expect(syncLinkedCertificate(order)).rejects.toThrow("another order"); expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });
  it("rejects duplicate links before contacting Shopify", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { sessions: [], duplicate: true }, error: null });
    await expect(syncLinkedCertificate(order)).rejects.toThrow("another order"); expect(mocks.graphql).not.toHaveBeenCalled();
  });
  it("reports access errors instead of acknowledging a successful sync", async () => {
    prepare(); mocks.graphql.mockReset().mockResolvedValueOnce({ errors: [{ message: "Access denied" }] });
    await expect(syncLinkedCertificate(order)).rejects.toThrow("access was denied");
  });
  it("keeps failed work for automatic retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ order_id: order.id, revision: 2, attempts: 1, data: order }], error: null }).mockResolvedValueOnce({ data: { sessions: [], duplicate: false }, error: null }).mockResolvedValueOnce({ error: null });
    mocks.graphql.mockResolvedValue(null);
    expect(await processCertificateSync()).toEqual({ processed: 1, failed: 1 });
    const [name, args] = mocks.rpc.mock.calls[2];
    expect(name).toBe("finish_certificate_sync");
    expect(args.p_error).toContain("unavailable");
    expect(args.p_revision).toBe(2);
    expect(args.p_delay).toBe(30);
  });
  it("creates a TikTok certificate directly with quotes and backslashes intact", async () => {
    const tt = { ...order, salesChannel: "tiktok", orderNumber: "TT1321 586581292406506537", plushBirthPlace: "KL", plushName: 'My "Best" Plushie', meaningfulNote: 'Say "I love you" \\ always 💗' } as Order;
    mocks.rpc.mockResolvedValueOnce({ data: { sessions: [], duplicate: false }, error: null });
    mocks.graphql.mockResolvedValueOnce({ data: { metaobjectByHandle: null, metaobjectDefinitionByType: definition } }).mockResolvedValueOnce({ data: { metaobjectUpsert: { metaobject: { id: object.id }, userErrors: [] } } });
    await syncLinkedCertificate(tt);
    const variables = mocks.graphql.mock.calls[1][2];
    expect(variables.metaobject.fields).toContainEqual({ key: "code", value: tt.certificateCode });
    expect(variables.metaobject.fields).toContainEqual({ key: "order_number", value: tt.orderNumber });
    expect(JSON.parse(JSON.stringify(variables)).metaobject.fields).toContainEqual({ key: "meaningful_note", value: tt.meaningfulNote });
    expect(variables.metaobject.fields).toContainEqual({ key: "id_name", value: tt.plushName });
  });
  it("waits for complete TikTok personalisation instead of creating an empty certificate", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { sessions: [], duplicate: false }, error: null });
    mocks.graphql.mockResolvedValueOnce({ data: { metaobjectByHandle: null, metaobjectDefinitionByType: definition } });
    await expect(syncLinkedCertificate({ ...order, salesChannel: "tiktok", plushGender: "" } as Order)).rejects.toThrow("Complete the TikTok");
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });
  it("never creates birth certificates for Plush Charm orders", async () => {
    await expect(syncLinkedCertificate({ ...order, salesChannel: "tiktok", productType: "plush_charm" } as Order)).rejects.toThrow("Plush Charms");
    expect(mocks.graphql).not.toHaveBeenCalled();
  });
});
