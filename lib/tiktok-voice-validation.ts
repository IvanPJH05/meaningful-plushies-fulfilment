import type { SupabaseClient } from "@supabase/supabase-js";
import { boundedAudioBytes, convertAudioToMp3, InvalidRecordingError, maxAudioSourceBytes } from "./batch-audio.ts";

const inlineVoice = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i;
const recordingExtension = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?|amr|mp4|mov|webm|mkv|m4v)$/i;

/** Validate new voice attachments with the same decoder used to make the batch ZIP. */
export async function validateTikTokVoice(
  db: SupabaseClient,
  attachment: { tikTokFileDataUrl?: string; tikTokFileName?: string; tikTokFileType?: string },
) {
  const source = attachment.tikTokFileDataUrl;
  if (!source) return false;
  const stored = source.startsWith("supabase-storage:");
  if (!stored && !source.startsWith("data:")) return false; // Legacy links are checked during export.
  const inline = stored ? null : inlineVoice.exec(source);
  const mime = inline?.[1] || attachment.tikTokFileType || "";
  const fileName = attachment.tikTokFileName || (stored ? source : "");
  if (!/^(audio|video)\//i.test(mime) && !recordingExtension.test(fileName)) return false; // Keep order documents.

  let bytes: Buffer;
  if (stored) {
    const path = source.slice("supabase-storage:".length);
    if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) {
      throw new InvalidRecordingError("The recording path is invalid. Upload the recording again.");
    }
    const { data, error } = await db.storage.from("customisation-audio").download(path);
    if (error || !data) throw new InvalidRecordingError("The recording could not be retrieved. Upload it again.");
    if (data.size > maxAudioSourceBytes) throw new InvalidRecordingError("Choose a recording up to 50 MB.");
    bytes = await boundedAudioBytes(data.stream());
  } else {
    if (!inline || inline[2].length > Math.ceil(maxAudioSourceBytes / 3) * 4) {
      throw new InvalidRecordingError("The recording is invalid or exceeds 50 MB.");
    }
    bytes = Buffer.from(inline[2], "base64");
  }
  await convertAudioToMp3(bytes);
  return true;
}
