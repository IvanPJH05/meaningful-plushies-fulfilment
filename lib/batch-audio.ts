import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "./types";

const exec = promisify(execFile);
export const maxAudioSourceBytes = 50 * 1024 * 1024;
const maxMp3Bytes = 4 * 1024 * 1024;

export class InvalidRecordingError extends Error {}

export { batchAudioSource } from "./batch-audio-source.ts";

export function assertAudioMediaType(type: string) {
  if (!/^(audio\/|video\/)/i.test(type) && type !== "application/octet-stream") {
    throw new Error("Attach an audio file or a video containing audio to this order.");
  }
}

export async function boundedAudioBytes(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxAudioSourceBytes) throw new Error("The message file exceeds 50 MB. Attach a smaller file.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function convertAudioToMp3(input: Buffer): Promise<Buffer> {
  if (!input.length || input.length > maxAudioSourceBytes) throw new InvalidRecordingError("The message file is empty or exceeds 50 MB.");
  // Resolved on the server only. Next includes the platform binary exclusively
  // in the batch-audio function, never in the staff browser bundle.
  const binary = ffmpegPath;
  if (!binary) throw new Error("Audio conversion is unavailable. Please retry later.");
  const directory = await mkdtemp(join(tmpdir(), "batch-audio-"));
  try {
    const source = join(directory, "source"), output = join(directory, "message.mp3");
    await writeFile(source, input);
    let scan: string;
    try {
      const result = await exec(binary, [
        "-hide_banner", "-loglevel", "info", "-nostats", "-nostdin", "-y",
        "-protocol_whitelist", "file,pipe",
        "-format_whitelist", "mov,mp3,ogg,wav,matroska,webm,flac,aac,amr,aiff,asf",
        "-threads", "1", "-i", source, "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-map_metadata", "-1", "-af", "aformat=channel_layouts=mono,volumedetect",
        "-c:a", "libmp3lame", "-b:a", "96k",
        "-ac", "1", "-ar", "44100", "-threads", "1", "-fs", String(maxMp3Bytes + 1), output,
      ], { timeout: 40_000, maxBuffer: 64 * 1024, windowsHide: true });
      scan = result.stderr;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      if (/Stream map .* matches no streams/i.test(stderr)) {
        throw new InvalidRecordingError("This video has no audio track. Attach the original recording with sound.");
      }
      if (stderr) throw new InvalidRecordingError("This file could not be converted to MP3. Attach a playable audio or video file and retry.");
      throw error;
    }
    const peak = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(scan);
    // volumedetect's 16-bit silence floor is -91 dB. Leave quiet recordings alone.
    if (peak && Number(peak[1]) <= -91) {
      throw new InvalidRecordingError("This recording is silent. Attach a recording with sound.");
    }
    const size = (await stat(output)).size;
    if (!size || size > maxMp3Bytes) throw new InvalidRecordingError("The converted audio is empty or exceeds 4 MB. Attach a playable, shorter recording.");
    return await readFile(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function cachedBatchMp3(db: SupabaseClient, source: Buffer, convert = convertAudioToMp3) {
  if (!source.length || source.length > maxAudioSourceBytes) throw new Error("The message file is empty or exceeds 50 MB.");
  // Content addressing invalidates the copy whenever staff replace a message.
  // Originals and order records are left intact; the existing bucket is private.
  const hash = createHash("sha256").update(source).digest("hex");
  const path = `batch-mp3-v1/${hash}.mp3`;
  const bucket = db.storage.from("customisation-audio");
  const cached = await bucket.download(path);
  if (!cached.error && cached.data?.size && cached.data.size <= maxMp3Bytes) {
    return Buffer.from(await cached.data.arrayBuffer());
  }
  const bytes = await convert(source);
  const saved = await bucket.upload(path, bytes, { contentType: "audio/mpeg", upsert: false, cacheControl: "31536000" });
  // A cache outage must not prevent a valid download. Concurrent requests may
  // also have written the identical object before this upload completed.
  if (saved.error && !/already exists|duplicate/i.test(saved.error.message)) console.warn("Batch MP3 cache write failed", { code: saved.error.name });
  return bytes;
}
