import assert from "node:assert/strict";
import test from "node:test";
import { parseBankStatementText } from "./bank-statements.ts";

test("parses Maybank plus and minus statement lines", () => {
  const rows = parseBankStatementText(`
STATEMENT DATE 30/06/26
01/06 TRANSFER FR A/C 1,000.00- 3,211.56
IVAN PHANG JING HON*
Upgrades for June
02/06 TRANSFER TO A/C 840.01+ 4,051.57
XENDIT SDN. BHD. *
R2Xyub
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].transactionDate, "2026-06-01");
  assert.equal(rows[0].moneyOut, 1000);
  assert.equal(rows[0].moneyIn, 0);
  assert.match(rows[0].description, /Upgrades for June/);
  assert.equal(rows[1].moneyIn, 840.01);
  assert.equal(rows[1].suggestedAccount, "Xendit");
});

test("parses Public Bank debit and credit statement lines", () => {
  const rows = parseBankStatementText(`
Statement Date 26 Jun 2026
28/05 DUITNOW TRSF CR 096683 MP GIFT SHOP 1,000.00 1,942.86
ADS 28 MAY
29/05 DUITNOW TRSF DR 091063 35.00 1,388.98
IVAN PHANG JING HONG RAMEN
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].transactionDate, "2026-05-28");
  assert.equal(rows[0].moneyIn, 1000);
  assert.equal(rows[1].moneyOut, 35);
  assert.match(rows[1].description, /RAMEN/);
});
