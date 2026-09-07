import assert from "node:assert/strict";
import test from "node:test";

import { mediaFileExtension, voiceBackupFileName } from "./voice-file-name.ts";

test("names Shopify voice files with the numeric order number and character", () => {
  assert.equal(voiceBackupFileName({ orderNumber: "#1120", character: "Billy", salesChannel: "shopify" }, "mp3"), "1120 BILLY.mp3");
});

test("names TikTok voice files with the TT order number and character", () => {
  assert.equal(voiceBackupFileName({ orderNumber: "TT1102 576812345", character: "Dragon Warrior", salesChannel: "tiktok" }, "m4a"), "TT1102 DRAGON WARRIOR.m4a");
});

test("keeps an audio extension when renaming a TikTok message", () => {
  assert.equal(mediaFileExtension("WhatsApp Ptt.ogg", "audio/ogg"), "ogg");
  assert.equal(voiceBackupFileName({ orderNumber: "TT1102 576812345", character: "Dragon Warrior", salesChannel: "tiktok" }, "ogg"), "TT1102 DRAGON WARRIOR.ogg");
});
