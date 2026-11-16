import test from "node:test";
import assert from "node:assert/strict";
import { setVoiceReviewReason, voiceReviewReason, withoutTikTokAttachment } from "./voice-review.ts";

test("a recording flag can be replaced or cleared without changing staff notes", () => {
  const notes = "Keep the parcel on hold.\nCustomer asked for a gift bag.";
  const flagged = setVoiceReviewReason(notes, "Video has no audio track.");
  assert.equal(voiceReviewReason(flagged), "Video has no audio track.");
  const replaced = setVoiceReviewReason(flagged, "Recording is silent.");
  assert.equal(voiceReviewReason(replaced), "Recording is silent.");
  assert.equal(setVoiceReviewReason(replaced, ""), notes);
});

test("dropping a rejected attachment preserves other edits", () => {
  const patch = { plushName: "CIKI", tikTokFileDataUrl: "data:video/mp4;base64,AA==", tikTokFileName: "recording.mp4", tikTokFileType: "video/mp4" };
  assert.deepEqual(withoutTikTokAttachment(patch), { plushName: "CIKI" });
  assert.equal(patch.tikTokFileName, "recording.mp4");
});
