Exit code: 0
Wall time: 0.7 seconds
Output:
import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesReportRows, summarizeSales } from "./sales.ts";
import type { Order } from "./types";

function order(overrides: Partial<Order>): Order {
  return {
    id: "1",
    orderNumber: "1001",
    orderDate: "2026-06-14",
    customerName: "Customer",
    phone: "",
    email: "",
    address: "",
    currency: "MYR",
    subtotalAmount: 115,
    shippingAmount: 8,
    totalAmount: 0,
    discountAmount: 123,
    productDiscountAmount: 115,
    shippingDiscountAmount: 8,
    refundedAmount: 0,
    outstandingBalance: 0,
    paymentProcessor: "Stripe",
    product: "Plushie",
    character: "",
    setIndicator: "",
    idWebsiteLink: "",
    voiceLength: 0,
    plushName: "",
    certificateCode: "",
    meaningfulNote: "",
    meaningfulMessage: "",
    remark: "",
    voiceUploadStatus: "missing",
    courier: "",
    trackingNumber: "",
    status: "new_order",
    internalNotes: "",
    statusHistory: [],
    importedAt: "2026-06-14",
    updatedAt: "2026-06-14",
    ...overrides,
  };
}

test("reclassifies a zero-cash order as a bank transfer", () => {
  assert.deepEqual(summarizeSales([order({})]), {
    gross: 123,
    productDiscounted: 0,
    shippingDiscounted: 8,
    bankTransfer: 115,
    stripeCollected: 0,
    xenditCollected: 0,
    totalCollected: 115,
    collected: 115,
    processingFees: 0,
    shopifyFees: 0,
    totalFees: 0,
  });
});

test("keeps discounts when customer revenue is greater than zero", () => {
  const result = summarizeSales([order({
    totalAmount: 100,
    discountAmount: 23,
    productDiscountAmount: 15,
    shippingDiscountAmount: 8,
  })]);

  assert.deepEqual(result, {
    gross: 123,
    productDiscounted: 15,
    shippingDiscounted: 8,
    bankTransfer: 0,
    stripeCollected: 100,
    xenditCollected: 0,
    totalCollected: 100,
    collected: 100,
    processingFees: 0,
    shopifyFees: 0,
    totalFees: 0,
  });
});

test("deducts percentage and fixed processor fees from cash collected", () => {
  const result = summarizeSales([order({ totalAmount: 100 })], [{
    processor: "Stripe",
    percentage: 3,
    fixedAmount: 1,
  }]);

  assert.equal(result.processingFees, 4);
  assert.equal(result.collected, 96);
});

test("does not charge processing fees on zero-cash bank transfers", () => {
  const result = summarizeSales([order({})], [{
    processor: "Bank Transfer",
    percentage: 5,
    fixedAmount: 2,
  }]);

  assert.equal(result.processingFees, 0);
  assert.equal(result.collected, 115);
});

test("charges processor and Shopify percentages from collected cash after free shipping", () => {
  const result = summarizeSales([order({
    totalAmount: 115,
    shippingDiscountAmount: 8,
    discountAmount: 8,
    productDiscountAmount: 0,
  })], [{ processor: "Stripe", percentage: 3, fixedAmount: 0 }], 2);

  assert.equal(result.processingFees, 3.45);
  assert.equal(result.shopifyFees, 2.3);
  assert.equal(result.totalFees, 5.75);
  assert.equal(result.collected, 109.25);
});

test("builds one report row and charges one fee for a multi-item order", () => {
  const rows = buildSalesReportRows([
    order({ id: "1", orderNumber: "1005", character: "BILLY", voiceLength: 5, totalAmount: 100 }),
    order({ id: "2", orderNumber: "1005", character: "HUNNIE", voiceLength: 20, totalAmount: 0 }),
  ], [{ processor: "Stripe", percentage: 3, fixedAmount: 1 }]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].characters, ["BILLY", "HUNNIE"]);
  assert.deepEqual(rows[0].voiceLengths, [5, 20]);
  assert.equal(rows[0].processingFee, 4);
  assert.equal(rows[0].cashAfterFees, 96);
});

