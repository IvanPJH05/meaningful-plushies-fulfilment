import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";

import { closerVoiceResponse, convertCloserVoiceToMp3 } from "../src/modules/closer/voice-audio.ts";

function ffmpeg(args: string[], input?: Buffer) {
  assert.ok(ffmpegPath);
  const result = spawnSync(ffmpegPath, ["-loglevel", "error", ...args], { input, windowsHide: true });
  assert.equal(result.status, 0, result.error?.message || result.stderr?.toString());
  return result.stdout;
}

test("Closer plays existing WebM voice notes as a consistent, seekable MP3", async () => {
  const webm = ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", "-f", "webm", "pipe:1"]);
  const source = Uint8Array.from(webm).buffer;
  const mp3 = await convertCloserVoiceToMp3(source);

  const whole = closerVoiceResponse(mp3, "audio/mpeg", null);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(whole.headers.get("Accept-Ranges"), "bytes");
  assert.equal(whole.headers.get("Cache-Control"), "private, no-store");
  const decoded = ffmpeg(["-f", "mp3", "-i", "pipe:0", "-f", "s16le", "pipe:1"], Buffer.from(await whole.arrayBuffer()));
  assert.ok(decoded.length >= 44_100 * 2);

  const repeat = await convertCloserVoiceToMp3(source);
  assert.deepEqual(repeat, mp3);
  const probe = closerVoiceResponse(repeat, "audio/mpeg", "bytes=0-1");
  assert.equal(probe.status, 206);
  assert.equal(probe.headers.get("Content-Range"), `bytes 0-1/${mp3.byteLength}`);
  assert.equal(probe.headers.get("Content-Length"), "2");
  assert.deepEqual(await probe.arrayBuffer(), mp3.slice(0, 2));

  const rest = closerVoiceResponse(mp3, "audio/mpeg", "bytes=2-");
  assert.equal(rest.status, 206);
  assert.deepEqual(await rest.arrayBuffer(), mp3.slice(2));

  const suffix = closerVoiceResponse(mp3, "audio/mpeg", "bytes=-2");
  assert.equal(suffix.status, 206);
  assert.deepEqual(await suffix.arrayBuffer(), mp3.slice(-2));

  const outside = closerVoiceResponse(mp3, "audio/mpeg", `bytes=${mp3.byteLength}-`);
  assert.equal(outside.status, 416);
  assert.equal(outside.headers.get("Content-Range"), `bytes */${mp3.byteLength}`);
});
