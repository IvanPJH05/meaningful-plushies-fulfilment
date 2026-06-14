import assert from "node:assert/strict";
import test from "node:test";
import { importShopifyData } from "./importer.ts";
import { summarizeSales } from "./sales.ts";

const headers = [
  "Name", "Currency", "Subtotal", "Shipping", "Total", "Discount Amount", "Created at",
  "Lineitem quantity", "Lineitem name", "Lineitem price", "Shipping Name", "Lineitem discount",
  "Refunded Amount", "Outstanding Balance", "Payment Method",
].join(",");

const rows = [
  '#1398,MYR,184.00,30.00,214.00,46.00,2026-06-12,1,"(T,5S) PLUSHIE - TOOTSIE / INCLUDED",115.00,ROGER LEONG,46.00,0.00,0.00,Shopify Payments',
  '#1398,,,,,,,1,"(H,5S) PLUSHIE - HUNNIE / INCLUDED",115.00,,0.00,,',
  '#1402,MYR,135.00,8.00,135.00,8.00,2026-06-13,1,"(H,20S) PLUSHIE - HUNNIE / INCLUDED",135.00,NUR AIN,0.00,0.00,0.00,Shopify Payments',
  '#1403,MYR,0.00,8.00,0.00,143.00,2026-06-13,1,"(B,20S) PLUSHIE - BILLY / INCLUDED",135.00,SAYIDAH,0.00,0.00,0.00,Bank Transfer',
].join("\n");

test("imports real discounts and zero-total bank transfers correctly", () => {
  const { orders } = importShopifyData(`${headers}\n${rows}`, "", []);
  const discounted = orders.find((order) => order.orderNumber === "1398");
  const paid = orders.find((order) => order.orderNumber === "1402");
  const bankTransfer = orders.find((order) => order.orderNumber === "1403");

  assert.deepEqual({
    subtotal: discounted?.subtotalAmount,
    productDiscount: discounted?.productDiscountAmount,
    shippingDiscount: discounted?.shippingDiscountAmount,
    total: discounted?.totalAmount,
  }, { subtotal: 184, productDiscount: 46, shippingDiscount: 0, total: 214 });

  assert.deepEqual({
    subtotal: paid?.subtotalAmount,
    productDiscount: paid?.productDiscountAmount,
    shippingDiscount: paid?.shippingDiscountAmount,
    total: paid?.totalAmount,
  }, { subtotal: 135, productDiscount: 0, shippingDiscount: 8, total: 135 });

  assert.deepEqual({
    subtotal: bankTransfer?.subtotalAmount,
    productDiscount: bankTransfer?.productDiscountAmount,
    shippingDiscount: bankTransfer?.shippingDiscountAmount,
    total: bankTransfer?.totalAmount,
  }, { subtotal: 135, productDiscount: 0, shippingDiscount: 8, total: 0 });

  assert.equal(discounted?.paymentProcessor, "Shopify Payments");
  assert.equal(bankTransfer?.paymentProcessor, "Bank Transfer");

  assert.deepEqual(summarizeSales(orders), {
    gross: 546,
    productDiscounted: 46,
    shippingDiscounted: 16,
    bankTransfer: 135,
    collected: 484,
    processingFees: 0,
  });
});
