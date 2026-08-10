import assert from "node:assert/strict";
import test from "node:test";

import { crmFlowPhraseMatchesMessage } from "./crm-flow-trigger.ts";

test("CRM flow phrase matches a phrase within a customer sentence", () => {
  assert.equal(crmFlowPhraseMatchesMessage("customise a plushie", "Hi, I want to customise a plushie please 😊"), true);
});

test("CRM flow phrase tolerates WhatsApp punctuation and casing", () => {
  assert.equal(crmFlowPhraseMatchesMessage("What are the prices", "WHAT are the prices for a plushie?"), true);
});

test("CRM flow phrase does not match inside another word", () => {
  assert.equal(crmFlowPhraseMatchesMessage("paid", "I have not unpaid yet"), false);
});
