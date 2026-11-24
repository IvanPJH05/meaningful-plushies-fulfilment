import { beforeEach, expect, test, vi } from "vitest";
import type { Order } from "../../lib/types";

const state = vi.hoisted(() => ({ order: {} as Partial<Order>, signedIn: true, source: Buffer.alloc(0) }));
vi.mock("../../lib/mobile-api", () => ({
  requireMobileSession: async () => { if (!state.signedIn) throw new Error("SIGN_IN_REQUIRED"); },
  mobileServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: state.order } }) }) }) }) }),
}));
vi.mock("../../lib/batch-audio", () => ({
  assertAudioMediaType: (type: string) => { if (!/^(audio|video)\//.test(type)) throw new Error("Invalid voice media"); },
  cachedBatchMp3: async (_db: unknown, bytes: Buffer) => { state.source = Buffer.from(bytes); return Buffer.from("playable-mp3"); },
}));
import { GET } from "../../app/api/mobile/orders/[id]/assets/route";
const read = (kind = "voice") => GET(new Request(`https://example.test/api/mobile/orders/test/assets?kind=${kind}`), { params: Promise.resolve({ id: "test" }) });

beforeEach(() => { state.order = {}; state.signedIn = true; state.source = Buffer.alloc(0); });
test.each(["audio/mpeg", "video/mp4"])("tablet voice reads the TikTok %s attachment, not the written customisation", async type => {
  state.order = { salesChannel: "tiktok", meaningfulMessage: "Gender: Male", tikTokFileDataUrl: `data:${type};base64,${Buffer.from("customer-recording").toString("base64")}` };
  const response = await read();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(await response.text()).toBe("playable-mp3");
  expect(state.source.toString()).toBe("customer-recording");
});
test("Shopify voice stays on the existing message field", async () => {
  state.order = { salesChannel: "shopify", meaningfulMessage: "data:audio/mpeg;base64,c2hvcGlmeQ==", tikTokFileDataUrl: "data:audio/mpeg;base64,d3Jvbmc=" };
  const response = await read();
  expect(await response.text()).toBe("shopify");
  expect(state.source.length).toBe(0);
});
test("original TikTok attachment remains downloadable without conversion", async () => {
  state.order = { salesChannel: "tiktok", tikTokFileDataUrl: "data:video/mp4;base64,b3JpZ2luYWw=" };
  const response = await read("attachment");
  expect(response.headers.get("content-type")).toBe("video/mp4");
  expect(await response.text()).toBe("original");
  expect(state.source.length).toBe(0);
});
test("a missing recording returns 404 rather than trying to play written details", async () => {
  state.order = { salesChannel: "tiktok", meaningfulMessage: "Gender: Male" };
  expect((await read()).status).toBe(404);
});
test("recordings still require a staff session", async () => {
  state.signedIn = false;
  expect((await read()).status).toBe(401);
});
