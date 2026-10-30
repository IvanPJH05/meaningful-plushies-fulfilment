import { test } from "node:test";
import assert from "node:assert/strict";
import { bankRowStatus, contraRows } from "./monthly-journal-contra.ts";

const outgoing = { id: "out", bank: "Maybank", status: "reconciled", journal_entry_id: "entry", money_in: 0, money_out: 300 };
const incoming = { id: "in", bank: "Public Bank", status: "posted", journal_entry_id: "entry", money_in: 300, money_out: 0 };
test("both sides of a shortcut transfer display as contra", () => {
  for (const row of [outgoing, incoming]) assert.equal(bankRowStatus(row, [outgoing, incoming]), "contra");
});
test("manually posted contra pairs display as contra too", () => {
  const rows = [{ ...outgoing, status: "posted" }, incoming];
  assert.equal(bankRowStatus(rows[0], rows), "contra");
});
test("unrelated or unequal posted rows are not contra", () => {
  assert.equal(bankRowStatus(incoming, [incoming]), "posted");
  assert.deepEqual(contraRows(incoming, [{ ...outgoing, money_out: 301 }, incoming]), []);
  assert.deepEqual(contraRows(incoming, [{ ...outgoing, journal_entry_id: "other" }, incoming]), []);
});
test("an undone transfer returns to unposted", () => {
  assert.equal(bankRowStatus({ ...outgoing, status: "unposted", journal_entry_id: null }, []), "unposted");
});
