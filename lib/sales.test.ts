import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSales } from "./sales.ts";
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
    paymentProcessor: "Shopify Payments",
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
    collected: 115,
    processingFees: 0,
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
    collected: 100,
    processingFees: 0,
  });
});

test("deducts percentage and fixed processor fees from cash collected", () => {
  const result = summarizeSales([order({ totalAmount: 100 })], [{
    processor: "Shopify Payments",
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
