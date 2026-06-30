import assert from "node:assert/strict";
import test from "node:test";
import { applyTikTokDetailEntries, importShopifyData, importTikTokShopData, normalizePaymentProcessor, parseTikTokDetailsBlock, shopifyOrderToFulfilmentOrders, tikTokCertificateJson } from "./importer.ts";
import { summarizeSales } from "./sales.ts";
import type { Order } from "./types.ts";

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

test("converts Shopify API orders with Upload Lift metafield into fulfilment orders", () => {
  const uploadLift = [
    "Order Id: #1455",
    "Product: (T,20S) BUILD YOUR MEANINGFUL PLUSHIE",
    "Certificate Code: 14553997287",
    "Name: Lumpy",
    "Gender: Male",
    "Born On: 11 March 2006",
    "Birthplace: Whispering Forest",
    "Favourite Person: My Best Friend",
    "Belongs To: Aqil Rashya",
    "Meaningful Note: Dear my son Aqil, whenever you feel happy.",
    "Meaningful Message: https://upload.cloudlift.app/s/n1rdwf-40/WeFbWLC6XL.m4a",
  ].join("\n");
  const orders = shopifyOrderToFulfilmentOrders({
    name: "#1455",
    createdAt: "2026-06-28T10:00:00Z",
    email: "customer@example.com",
    currencyCode: "MYR",
    currentSubtotalPriceSet: { shopMoney: { amount: "135.00", currencyCode: "MYR" } },
    currentTotalPriceSet: { shopMoney: { amount: "135.00", currencyCode: "MYR" } },
    currentTotalDiscountsSet: { shopMoney: { amount: "8.00", currencyCode: "MYR" } },
    totalShippingPriceSet: { shopMoney: { amount: "8.00", currencyCode: "MYR" } },
    paymentGatewayNames: ["Stripe Card Payments"],
    tags: ["J&T: 632101879476"],
    shippingAddress: { name: "Aqil Rashya", phone: "0123456789", address1: "123 Road", city: "KL" },
    shippingLine: { title: "Standard" },
    lineItems: {
      nodes: [
        {
          name: "(T,20S) BUILD YOUR MEANINGFUL PLUSHIE - TOOTSIE / INCLUDED",
          title: "(T,20S) BUILD YOUR MEANINGFUL PLUSHIE",
          quantity: 1,
          originalUnitPriceSet: { shopMoney: { amount: "135.00", currencyCode: "MYR" } },
        },
      ],
    },
  }, uploadLift, []);

  assert.equal(orders.length, 1);
  assert.equal(orders[0]?.orderNumber, "1455");
  assert.equal(orders[0]?.salesChannel, "shopify");
  assert.equal(orders[0]?.character, "TOOTSIE");
  assert.equal(orders[0]?.voiceLength, 20);
  assert.equal(orders[0]?.plushName, "Lumpy");
  assert.equal(orders[0]?.certificateCode, "14553997287");
  assert.equal(orders[0]?.paymentProcessor, "Stripe");
  assert.equal(orders[0]?.courier, "J&T");
  assert.equal(orders[0]?.trackingNumber, "632101879476");
  assert.equal(orders[0]?.meaningfulMessage, "https://upload.cloudlift.app/s/n1rdwf-40/WeFbWLC6XL.m4a");
  assert.equal(orders[0]?.idWebsiteLink, "https://meaningfulplushies.com/pages/certificate/14553997287");
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

test("parses loose Malay TikTok plushie details into editable fields", () => {
  const parsed = parseTikTokDetailsBlock([
    "Nama Plushie - Mochi",
    " Jantina Plushie- Female",
    " Tarikh Lahir Plushie - 28/6/2025",
    " Tempat Lahir Plushie - Perak",
    " Orang Kegemaran Plushie - Panda shomel",
    " Mainan lembut itu milik… Ayangku",
    " Nota bermakna - Ayangku mochi ni adik pda oreo otey.Hope ayng suka ngn mochi ni lebiu mwah.",
  ].join("\n"));

  assert.deepEqual({
    plushName: parsed.plushName,
    gender: parsed.gender,
    birthDate: parsed.birthDate,
    birthPlace: parsed.birthPlace,
    favouritePerson: parsed.favouritePerson,
    belongsTo: parsed.belongsTo,
    meaningfulNote: parsed.meaningfulNote,
  }, {
    plushName: "Mochi",
    gender: "Female",
    birthDate: "28/6/2025",
    birthPlace: "Perak",
    favouritePerson: "Panda Shomel",
    belongsTo: "Ayangku",
    meaningfulNote: "Ayangku mochi ni adik pda oreo otey.Hope ayng suka ngn mochi ni lebiu mwah.",
  });
});

test("keeps blank TikTok detail rows blank instead of reading the next row", () => {
  const parsed = parseTikTokDetailsBlock([
    "Plushie's Name- danish",
    "Plushie's Gender- female",
    "Plushie's Birth Date- 22/11/02",
    "Plushie's Birth Place- ",
    "Plushie's Favourite Person- azleiyna",
    "Plushie Belongs to- ",
    "Meaningful Note- i love you baby",
  ].join("\n"));

  assert.deepEqual({
    plushName: parsed.plushName,
    gender: parsed.gender,
    birthDate: parsed.birthDate,
    birthPlace: parsed.birthPlace,
    favouritePerson: parsed.favouritePerson,
    belongsTo: parsed.belongsTo,
    meaningfulNote: parsed.meaningfulNote,
  }, {
    plushName: "danish",
    gender: "Female",
    birthDate: "22/11/02",
    birthPlace: "",
    favouritePerson: "Azleiyna",
    belongsTo: "",
    meaningfulNote: "i love you baby",
  });
});

test("updates existing TikTok orders from detail entries without a CSV", () => {
  const existing: Order = {
    id: "tiktok-584697260225955022",
    orderNumber: "TT1027 584697260225955022",
    salesChannel: "tiktok",
    orderDate: "2026-06-25",
    customerName: "old_username",
    phone: "",
    email: "",
    address: "",
    currency: "MYR",
    subtotalAmount: 123.3,
    shippingAmount: 5,
    totalAmount: 123.3,
    discountAmount: 0,
    productDiscountAmount: 0,
    shippingDiscountAmount: 0,
    refundedAmount: 0,
    outstandingBalance: 0,
    paymentProcessor: "Bank Transfer",
    product: "TikTok Shop",
    character: "Hunnie",
    setIndicator: "",
    idWebsiteLink: "https://meaningfulplushies.com/pages/certificate/10275022106",
    voiceLength: 20,
    plushName: "",
    certificateCode: "10275022106",
    meaningfulNote: "",
    meaningfulMessage: "",
    remark: "",
    voiceUploadStatus: "missing",
    courier: "",
    trackingNumber: "",
    status: "new_order",
    internalNotes: "",
    statusHistory: [],
    importedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  };

  const { orders, result } = applyTikTokDetailEntries([{
    identifier: "584697260225955022",
    details: "",
    parsed: {
      username: "mikayla200",
      plushName: "Baby",
      gender: "Girl",
      birthDate: "18/07",
      birthPlace: "hosp ampang",
      favouritePerson: "Kakak Kayla",
      belongsTo: "Mikayla",
      meaningfulNote: "happy birthday sayang mama",
    },
    fileDataUrl: "data:video/mp4;base64,abc123",
    fileName: "message.mp4",
    fileType: "video/mp4",
  }], [existing]);

  const updated = orders[0];
  assert.equal(result.updated, 1);
  assert.equal(updated.customerName, "mikayla200");
  assert.equal(updated.plushName, "Baby");
  assert.equal(updated.meaningfulNote, "happy birthday sayang mama");
  assert.equal(updated.voiceUploadStatus, "received");
  assert.equal(updated.tikTokFileName, "message.mp4");
  assert.equal(tikTokCertificateJson(updated).Name, "BABY");
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
