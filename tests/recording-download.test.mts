import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn(), mp3: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }) }));
vi.mock("../lib/batch-audio", () => ({ cachedBatchMp3: mocks.mp3, maxAudioSourceBytes: 50 * 1024 * 1024 }));
import { GET } from "../app/api/customisation/audio-download/route";
const path = "12345678-1234-1234-1234-123456789abc/recording.webm";
const request = (value = path) => new Request(`https://app.test/api/customisation/audio-download?path=${encodeURIComponent(value)}&filename=Customer.webm`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture");
  mocks.download.mockResolvedValue({ data: new Blob(["complete-webm"], { type: "audio/webm;codecs=opus" }), error: null });
  mocks.mp3.mockResolvedValue(Buffer.from("converted-mp3"));
});
it("downloads a real MP3 with a matching filename and content length", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("content-disposition")).toContain('filename="Customer.mp3"');
  expect(await response.text()).toBe("converted-mp3");
  expect(mocks.mp3.mock.calls[0][1].toString()).toBe("complete-webm");
});
it("preserves existing non-WebM uploads", async () => {
  mocks.download.mockResolvedValue({ data: new Blob(["original-mp3"], { type: "audio/mpeg" }), error: null });
  expect(await (await GET(request(path.replace("webm", "mp3")))).text()).toBe("original-mp3");
  expect(mocks.mp3).not.toHaveBeenCalled();
});
it("rejects paths outside a customisation session", async () => {
  expect((await GET(request("batch-mp3-v1/private.mp3"))).status).toBe(400);
  expect(mocks.download).not.toHaveBeenCalled();
});
it("reports damaged recordings without returning mislabeled WebM", async () => {
  mocks.mp3.mockRejectedValue(new Error("Damaged audio"));
  const response = await GET(request());
  expect(response.status).toBe(422);
  expect((await response.json()).error).toBe("Damaged audio");
});
