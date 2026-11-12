import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const exec = promisify(execFile);
const maxVoiceBytes = 3 * 1024 * 1024;

export async function convertCloserVoiceToMp3(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  if (!ffmpegPath) throw new Error("Voice conversion is unavailable.");

  const directory = await mkdtemp(join(tmpdir(), "closer-voice-"));
  const source = join(directory, "source");
  const output = join(directory, "voice.mp3");

  try {
    await writeFile(source, new Uint8Array(bytes));
    await exec(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-protocol_whitelist", "file,pipe",
      "-format_whitelist", "mov,matroska,webm,ogg,mp3",
      "-threads", "1", "-i", source, "-map", "0:a:0",
      "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "32k",
      "-ac", "1", "-ar", "44100", "-threads", "1",
      "-fs", String(maxVoiceBytes + 1), output,
    ], { timeout: 20_000, maxBuffer: 64 * 1024, windowsHide: true });

    const { size } = await stat(output);
    if (!size || size > maxVoiceBytes) throw new Error("The converted voice note is too large.");

    const mp3 = await readFile(output);
    return Uint8Array.from(mp3).buffer;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function closerVoiceResponse(bytes: ArrayBuffer, contentType: string, rangeHeader: string | null) {
  const size = bytes.byteLength;
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
  });

  // Safari typically probes bytes 0–1 before requesting the rest of the voice note.
  const range = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader ?? "");
  if (!range || (!range[1] && !range[2])) return new Response(bytes, { headers });

  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}
