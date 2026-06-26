import assert from "node:assert/strict";
import test from "node:test";
import { importShopifyData, importTikTokShopData, normalizePaymentProcessor, tikTokCertificateJson } from "./importer.ts";
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

  assert.equal(discounted?.paymentProcessor, "Stripe");
  assert.equal(bankTransfer?.paymentProcessor, "Bank Transfer");

  assert.deepEqual(summarizeSales(orders), {
    gross: 546,
    productDiscounted: 46,
    shippingDiscounted: 16,
    bankTransfer: 135,
    stripeCollected: 349,
    xenditCollected: 0,
    totalCollected: 484,
    collected: 484,
    processingFees: 0,
    shopifyFees: 0,
    totalFees: 0,
  });
});

test("normalizes Shopify gateway labels to actual processors", () => {
  assert.equal(normalizePaymentProcessor("Stripe Card Payments"), "Stripe");
  assert.equal(normalizePaymentProcessor("Xendit Payment Gateway (New)"), "Xendit");
  assert.equal(normalizePaymentProcessor("Stripe Card Payments + Xendit Payment Gateway (New)"), "Xendit");
  assert.equal(normalizePaymentProcessor("", true), "Bank Transfer");
});

test("auto-detects swapped order and metafield CSV inputs", () => {
  const metafields = [
    "Order GID,Order name,Order email,Metafield namespace,Metafield key,Metafield type,Metafield value",
    "gid://shopify/Order/1,#1403,test@example.com,custom,personalization,single_line_text_field,\"Product: Plushie\nCertificate Code: abc123\nName: Baba\nMeaningful Note: Hello\"",
  ].join("\n");
  const { orders, result } = importShopifyData(metafields, `${headers}\n${rows}`, []);
  const bankTransfer = orders.find((order) => order.orderNumber === "1403");

  assert.equal(result.imported, 4);
  assert.equal(bankTransfer?.plushName, "Baba");
  assert.equal(bankTransfer?.certificateCode, "abc123");
});

test("imports TikTok Shop orders with certificate JSON", () => {
  const tiktok = [
    "Order ID,Order Status,Order Substatus,SKU ID,Seller SKU,Product Name,Variation,Quantity,SKU Unit Original Price,SKU Subtotal Before Discount,SKU Platform Discount,SKU Seller Discount,SKU Subtotal After Discount,Shipping Fee After Discount,Original Shipping Fee,Payment platform discount,Order Amount,Order Refund Amount,Created Time,Paid Time,Tracking ID,Delivery Option,Shipping Provider Name,Buyer Message,Buyer Username,Recipient,Phone #,Country,State,Post Town,Detail Address,Additional address information,Payment Method",
    "584697260225955022\tTo ship\tAwaiting collection\t1735474415948891540\t\tMeaningful Plushies | Personalised Custom Plushie with Voice Message & NFC Birth Certificate | Perfect Gift\t\"Hunnie, Included, 20 seconds\"\t1\t130\t130\t11.7\t0\t118.3\t5\t5\t0\t123.3\t\t25/06/2026 13:03:57\t25/06/2026 13:04:31\t680076017503113\tStandard shipping\tJ&T Express\t\ti***mikayla200\tS******* s********\t(+60)172****54\tMalaysia\tSelangor\tCheras\tAddress\t\tInternet Banking",
  ].join("\n");
  const details = [{
    identifier: "584697260225955022",
    fileDataUrl: "data:application/pdf;base64,abc123",
    fileName: "tiktok-order.pdf",
    fileType: "application/pdf",
    details: [
      "Username- mikayla200",
      "Plushie's Name- Baby",
      "Plushie's Gender- girl",
      "Plushie's Birth Date- 18/07",
      "Plushie's Birth Place- hosp ampang",
      "Plushie's Favourite Person- kakak kayla",
      "Plushie Belongs to- Mikayla",
      "Meaningful Note- happy birthday sayang mama..moge yang baik2 tok kakak",
    ].join("\n"),
  }];
  const { orders, importedOrders } = importTikTokShopData(tiktok, details, []);
  const order = importedOrders[0];

  assert.equal(order.orderNumber, "TT1027 584697260225955022");
  assert.equal(order.salesChannel, "tiktok");
  assert.equal(order.certificateCode, "10275022106");
  assert.equal(order.idWebsiteLink, "https://meaningfulplushies.com/pages/certificate/10275022106");
  assert.equal(order.character, "Hunnie");
  assert.equal(order.voiceLength, 20);
  assert.equal(order.customerName, "mikayla200");
  assert.equal(order.tikTokFileName, "tiktok-order.pdf");
  assert.equal(order.tikTokFileDataUrl, "data:application/pdf;base64,abc123");
  assert.equal(order.paymentProcessor, "Bank Transfer");
  assert.equal(order.totalAmount, 123.3);
  assert.deepEqual(tikTokCertificateJson(order), {
    Code: "10275022106",
    "Order Number": "TT1027 584697260225955022",
    "Plush Details": "Hunnie 20S",
    "Id Picture": "Hunnie",
    Name: "BABY",
    Gender: "Girl",
    "Birth Date": "18/07",
    "Birth Place": "hosp ampang",
    "Favourite Person": "Kakak Kayla",
    "Belongs To": "Mikayla",
    "Meaningful Note": "happy birthday sayang mama..moge yang baik2 tok kakak",
  });
  assert.equal(summarizeSales(orders).bankTransfer, 123.3);
});
