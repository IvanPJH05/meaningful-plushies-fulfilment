import assert from "node:assert/strict";
import test from "node:test";
import { parseBankStatementCsv, parseBankStatementText } from "./bank-statements.ts";

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
  assert.equal(rows[0].suggestedEvent, "internal_transfer");
  assert.equal(rows[1].moneyIn, 840.01);
  assert.equal(rows[1].suggestedAccount, "Xendit");
});

test("parses Maybank PDF text when spaces are missing", () => {
  const rows = parseBankStatementText(`
STATEMENT DATE 30/06/26
01/06TRANSFER FR A/C1,000.00-3,211.56
IVAN PHANG JING HON*
Upgrades for June
02/06TRANSFER TO A/C840.01+4,051.57
XENDIT SDN. BHD. *
R2Xyub
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].transactionDate, "2026-06-01");
  assert.equal(rows[0].moneyOut, 1000);
  assert.equal(rows[0].suggestedEvent, "internal_transfer");
  assert.match(rows[0].description, /IVAN PHANG/);
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
  assert.equal(rows[0].suggestedEvent, "internal_transfer");
  assert.equal(rows[1].moneyOut, 35);
  assert.match(rows[1].description, /RAMEN/);
});

test("parses Public Bank PDF text when amount and balance come before description", () => {
  const rows = parseBankStatementText(`
Statement Date26 Jun 2026
28/051,000.001,942.86DUITNOW TRSF CR 096683 MP GIFT SHOP
ADS 28 MAY
29/0535.001,388.98DUITNOW TRSF DR 091063
IVAN PHANG JING HONG RAMEN
02/069.401,192.07PB DEBIT CARD DR
`);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].transactionDate, "2026-05-28");
  assert.equal(rows[0].moneyIn, 1000);
  assert.equal(rows[0].suggestedEvent, "internal_transfer");
  assert.equal(rows[1].moneyOut, 35);
  assert.match(rows[1].description, /RAMEN/);
  assert.equal(rows[2].moneyOut, 9.4);
});

test("parses Public Bank repeated same-date transaction rows", () => {
  const rows = parseBankStatementText(`
Statement Date26 Jun 2026
27/055.701,340.00DUITNOW QR RPP DR 600681
ARTTOWN STATIONERY 600681
QR REF NO: 38797825
10.501,329.50DUITNOW QR RPP DR 118667 KK MART TKP
118667 QR REF NO: 39534348
193.321,136.18PB DEBIT CARD DR
VISA4848100097406355 FACEBK Z2FNEN9NB2 IE
250526 FB.ME/ADS 0000193.32
`);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].transactionDate, "2026-05-27");
  assert.equal(rows[1].transactionDate, "2026-05-27");
  assert.equal(rows[1].moneyOut, 10.5);
  assert.equal(rows[2].moneyOut, 193.32);
  assert.equal(rows[2].suggestedEvent, "marketing_expense");
  assert.equal(rows[2].suggestedAccount, "Meta Ads");
});

test("parses CSV bank direction into only one money column", () => {
  const rows = parseBankStatementCsv(`bank_date,bank_description,bank_amount,bank_direction,amount
2026-07-01,DUITNOW TRSF DR | FOOD,30,money_out,30
2026-07-02,DUITNOW TRSF CR | CUSTOMER,115,money_in,115
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].moneyIn, 0);
  assert.equal(rows[0].moneyOut, 30);
  assert.equal(rows[1].moneyIn, 115);
  assert.equal(rows[1].moneyOut, 0);
});
