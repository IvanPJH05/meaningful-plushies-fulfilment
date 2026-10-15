import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAudioMediaType, boundedAudioBytes, cachedBatchMp3, convertAudioToMp3 } from "./batch-audio.ts";

const exec = promisify(execFile);
test("video audio is extracted as a playable MP3; silent video fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "batch-audio-test-"));
  try {
    const video = join(dir, "message.mp4"), silent = join(dir, "silent.mp4"), mp3 = join(dir, "voice.mp3");
    await exec(ffmpegPath!, ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", video], { windowsHide: true });
    const bytes = await convertAudioToMp3(await readFile(video));
    assert.ok(bytes.length > 1000);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(mp3, bytes);
    await exec(ffmpegPath!, ["-loglevel", "error", "-i", mp3, "-map", "0:a:0", "-f", "null", "-"], { windowsHide: true });
    await exec(ffmpegPath!, ["-loglevel", "error", "-i", video, "-an", "-c:v", "copy", silent], { windowsHide: true });
    await assert.rejects(convertAudioToMp3(await readFile(silent)), /no audio or be damaged/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("MP3 conversion reduces uncompressed voice size without truncating the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "batch-wav-test-"));
  try {
    const wav = join(dir, "voice.wav");
    await exec(ffmpegPath!, ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", wav], { windowsHide: true });
    const source = await readFile(wav), mp3 = await convertAudioToMp3(source);
    assert.ok(mp3.length < source.length / 4);
    await assert.rejects(convertAudioToMp3(Buffer.from("not an audio file")), /could not be converted/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("private MP3 cache reuses copies and invalidates a replaced source", async () => {
  const saved = new Map<string, Buffer>(); let conversions = 0;
  const db = { storage: { from: (bucket: string) => {
    assert.equal(bucket, "customisation-audio");
    return {
      download: async (path: string) => ({ data: saved.has(path) ? new Blob([new Uint8Array(saved.get(path)!)]) : null, error: saved.has(path) ? null : { message: "not found" } }),
      upload: async (path: string, bytes: Buffer, options: { contentType: string; upsert: boolean }) => { assert.equal(options.contentType, "audio/mpeg"); assert.equal(options.upsert, false); saved.set(path, bytes); return { error: null }; },
    };
  } } } as unknown as SupabaseClient;
  const convert = async (source: Buffer) => { conversions++; return Buffer.concat([Buffer.from("ID3"), source]); };
  const source = Buffer.from("message one");
  assert.deepEqual(await cachedBatchMp3(db, source, convert), await cachedBatchMp3(db, source, convert));
  assert.equal(conversions, 1);
  await cachedBatchMp3(db, Buffer.from("message two"), convert);
  assert.equal(conversions, 2); assert.equal(saved.size, 2);
});

test("only audio/video media are accepted and source reads are bounded", async () => {
  assert.doesNotThrow(() => assertAudioMediaType("video/mp4"));
  assert.doesNotThrow(() => assertAudioMediaType("audio/webm"));
  assert.throws(() => assertAudioMediaType("application/pdf"), /audio file or a video/);
  assert.throws(() => assertAudioMediaType("text/html"), /audio file or a video/);
  const stream = new Blob([new Uint8Array([1, 2, 3])]).stream();
  assert.deepEqual(await boundedAudioBytes(stream), Buffer.from([1, 2, 3]));
  const oversized = new Blob([new Uint8Array(51 * 1024 * 1024)]).stream();
  await assert.rejects(boundedAudioBytes(oversized), /exceeds 50 MB/);
});
