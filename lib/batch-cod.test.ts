import test from "node:test";
import assert from "node:assert/strict";
import { batchCodOrders, codDetails, codPhone, isCodOrder } from "./batch-cod.ts";
import type { Order } from "./types";
const order = { id: "1", orderNumber: "123", paymentProcessor: "Cash on Delivery", customerName: "Full Customer Name", phone: "+60122260106", address: "12 Jalan Example\n43000 Kajang, Selangor, Malaysia", totalAmount: 129.9, outstandingBalance: 0, currency: "MYR" } as Order;
test("formats Malaysian phones without damaging foreign numbers", () => {
 for (const phone of ["+60122260106", "0060122260106", "012 226 0106"]) assert.equal(codPhone(phone), "012-2260106");
 assert.equal(codPhone("+60 11 1234 5678"), "011-12345678");
 assert.equal(codPhone("+65 9123 4567"), "+65 9123 4567");
});
test("copies exactly three complete lines with postcode and country", () => {
 assert.equal(codDetails(order).text, "Full Customer Name\n012-2260106\n12 Jalan Example, 43000 Kajang, Selangor, Malaysia");
 assert.equal(codDetails(order).complete, true);
 assert.equal(codDetails({...order, address: ""}).complete, false);
});
test("uses balance for partially paid orders and never adds a second COD fee", () => {
 assert.equal(codDetails(order).amount, 129.9);
 assert.equal(codDetails({...order, outstandingBalance: 49.9}).amount, 49.9);
 assert.equal(codDetails({...order, totalAmount: NaN}).amount, null);
 assert.equal(codDetails({...order, totalAmount: 0}).amount, 0);
});
test("recognizes COD and shows one total per multi-item order", () => {
 assert.equal(isCodOrder({paymentProcessor: "COD"}), true);
 assert.equal(isCodOrder({paymentProcessor: "cash-on-delivery"}), true);
 assert.equal(isCodOrder({paymentProcessor: "Stripe"}), false);
 assert.equal(batchCodOrders([order, {...order, id: "2"}, {...order, id:"3", paymentProcessor:"Stripe"}]).length, 1);
});
