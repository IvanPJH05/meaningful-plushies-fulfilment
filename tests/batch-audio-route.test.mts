import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), single: vi.fn(), mp3: vi.fn(), storage: vi.fn() }));
vi.mock("../lib/mobile-api", () => ({ requireMobileSession: mocks.session, mobileServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.single }) }) }) }), storage: { from: () => ({ download: mocks.storage }) } }) }));
vi.mock("../lib/batch-audio", async importOriginal => ({ ...await importOriginal<typeof import("../lib/batch-audio")>(), cachedBatchMp3: mocks.mp3 }));
import { GET } from "../app/api/fulfilment/batches/audio/route";

const order = { id: "fixture", orderNumber: "TT1323 586597798472746996", character: "Tootsie", salesChannel: "tiktok", meaningfulMessage: "Gender: Male", tikTokFileName: "TT1323 TOOTSIE.mp4", tikTokFileDataUrl: `data:video/mp4;base64,${Buffer.from("video-with-audio").toString("base64")}` };
function request() { return new Request("https://app.test/api/fulfilment/batches/audio?id=batch&orderId=fixture", { headers: { Authorization: "Bearer fixture" } }); }
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); mocks.session.mockResolvedValue({ role: "staff" }); mocks.single.mockResolvedValue({ data: { fulfilment_orders: { data: order } }, error: null }); mocks.mp3.mockResolvedValue(Buffer.from("ID3-mp3-data")); });
describe("batch MP3 downloads", () => {
  it("converts TikTok video attachment and returns the actual MP3 filename", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-disposition")).toContain('filename="TT1323 TOOTSIE.mp3"');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("ID3-mp3-data");
    expect(mocks.mp3.mock.calls[0][1].toString()).toBe("video-with-audio");
  });
  it.each([["SIGN_IN_REQUIRED", 401], ["WAREHOUSE_ACCESS_REQUIRED", 403]])("requires an active warehouse session: %s", async (message, status) => {
    mocks.session.mockRejectedValue(new Error(message));
    expect((await GET(request())).status).toBe(status); expect(mocks.single).not.toHaveBeenCalled(); expect(mocks.mp3).not.toHaveBeenCalled();
  });
  it("rejects orders outside the batch before conversion", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404); expect(mocks.mp3).not.toHaveBeenCalled();
  });
  it("does not mistake TikTok certificate details for a voice attachment", async () => {
    mocks.single.mockResolvedValue({ data: { fulfilment_orders: { data: { ...order, tikTokFileDataUrl: "" } } }, error: null });
    const response = await GET(request()); expect(response.status).toBe(400); expect((await response.json()).error).toContain("No message file"); expect(mocks.mp3).not.toHaveBeenCalled();
  });
  it("rejects nonmedia attachments and untrusted remote URLs", async () => {
    for (const source of ["data:application/pdf;base64,cGRm", "https://untrusted.example/message.mp4"]) {
      mocks.single.mockResolvedValue({ data: { fulfilment_orders: { data: { ...order, tikTokFileDataUrl: source } } }, error: null });
      expect((await GET(request())).status).toBe(400);
    }
    expect(mocks.mp3).not.toHaveBeenCalled();
  });
  it("converts Shopify Storage audio too", async () => {
    mocks.single.mockResolvedValue({ data: { fulfilment_orders: { data: { ...order, salesChannel: "shopify", meaningfulMessage: "supabase-storage:12345678-1234-1234-1234-123456789abc/voice.webm" } } }, error: null });
    mocks.storage.mockResolvedValue({ data: new Blob(["webm-audio"], { type: "audio/webm" }), error: null });
    expect((await GET(request())).status).toBe(200); expect(mocks.mp3.mock.calls[0][1].toString()).toBe("webm-audio");
  });
  it("accepts recorded audio data URLs with codec parameters", async () => {
    mocks.single.mockResolvedValue({ data: { fulfilment_orders: { data: { ...order, tikTokFileDataUrl: "data:audio/webm;codecs=opus;base64,YXVkaW8=" } } }, error: null });
    expect((await GET(request())).status).toBe(200); expect(mocks.mp3.mock.calls[0][1].toString()).toBe("audio");
  });
  it("returns a useful error for silent or damaged media", async () => {
    mocks.mp3.mockRejectedValue(new Error("This file contains no audio."));
    const response = await GET(request()); expect(response.status).toBe(400); expect((await response.json()).error).toContain("no audio");
  });
});
