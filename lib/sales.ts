import type { CreatorProfile, ManualOrder, Order, PaymentProcessorSetting } from "./types";

export type SalesSummary = {
  gross: number;
  productDiscounted: number;
  shippingDiscounted: number;
  bankTransfer: number;
  stripeCollected: number;
  xenditCollected: number;
  totalCollected: number;
  collected: number;
  processingFees: number;
  shopifyFees: number;
  totalFees: number;
};

export type SalesReportRow = {
  orderNumber: string;
  orderDate: string;
  customerName: string;
  characters: string[];
  voiceLengths: number[];
  paymentProcessor: string;
  salePrice: number;
  productDiscount: number;
  shippingDiscount: number;
  totalDiscount: number;
  processingFee: number;
  shopifyFee: number;
  totalFees: number;
  cashAfterFees: number;
};

const emptySummary: SalesSummary = {
  gross: 0,
  productDiscounted: 0,
  shippingDiscounted: 0,
  bankTransfer: 0,
  stripeCollected: 0,
  xenditCollected: 0,
  totalCollected: 0,
  collected: 0,
  processingFees: 0,
  shopifyFees: 0,
  totalFees: 0,
};

function orderDiscountCodes(order: Order) {
  return [order.discountCodeUsed ?? "", ...(order.discountCodes ?? [])]
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

export function manualOrderFor(order: Order, manualOrders: ManualOrder[] = []) {
  const orderNumber = order.orderNumber.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const discountCodes = new Set(orderDiscountCodes(order));
  return manualOrders.find((manualOrder) => {
    const numbers = [manualOrder.shopifyOrderId, manualOrder.shopifyOrderName]
      .map((value) => value.replace(/[^a-z0-9]/gi, "").toUpperCase())
      .filter(Boolean);
    return numbers.includes(orderNumber)
      || discountCodes.has(manualOrder.productDiscountCode.trim().toUpperCase())
      || discountCodes.has(manualOrder.shippingDiscountCode.trim().toUpperCase());
  });
}

export function isCreatorFreeOrder(order: Order, creatorProfiles?: CreatorProfile[]) {
  const codes = orderDiscountCodes(order);
  // When the Creator Program has been loaded, only an exact program code can
  // mark a RM0 checkout as an influencer order. A generic FREE-* discount is
  // never enough on its own.
  if (creatorProfiles) {
    if (order.totalAmount > 0) return false;
    const creatorCodes = new Set(creatorProfiles.flatMap((profile) => {
      const code = profile.discountCode.trim().toUpperCase();
      return code ? [code, code.startsWith("FREE-") ? code : `FREE-${code}`] : [];
    }));
    return codes.some((code) => creatorCodes.has(code));
  }
  if (order.creatorFreeOrder) return true;
  return codes.some((code) => (
    code.startsWith("FREE-")
    || code.startsWith("CREATOR-FREE")
    || code.includes("INFLUENCER-FREE")
  ));
}

export function summarizeSales(orders: Order[], settings: PaymentProcessorSetting[] = [], shopifyPercentage = 0, manualOrders: ManualOrder[] = [], creatorProfiles?: CreatorProfile[]): SalesSummary {
  const rows = buildSalesReportRows(orders, settings, shopifyPercentage, manualOrders, creatorProfiles);
  return rows.reduce((summary, row) => ({
    gross: summary.gross + row.salePrice + row.totalDiscount,
    productDiscounted: summary.productDiscounted + row.productDiscount,
    shippingDiscounted: summary.shippingDiscounted + row.shippingDiscount,
    bankTransfer: summary.bankTransfer + (["Bank Transfer", "COD"].includes(row.paymentProcessor) ? row.salePrice : 0),
    stripeCollected: summary.stripeCollected + (row.paymentProcessor === "Stripe" ? row.salePrice : 0),
    xenditCollected: summary.xenditCollected + (row.paymentProcessor === "Xendit" ? row.salePrice : 0),
    totalCollected: summary.totalCollected + row.salePrice,
    collected: summary.collected + row.cashAfterFees,
    processingFees: summary.processingFees + row.processingFee,
    shopifyFees: summary.shopifyFees + row.shopifyFee,
    totalFees: summary.totalFees + row.totalFees,
  }), emptySummary);
}

export function buildSalesReportRows(orders: Order[], settings: PaymentProcessorSetting[] = [], shopifyPercentage = 0, manualOrders: ManualOrder[] = [], creatorProfiles?: CreatorProfile[]): SalesReportRow[] {
  const feesByProcessor = new Map(settings.map((setting) => [setting.processor.toLowerCase(), setting]));
  const groupedOrders = new Map<string, Order[]>();
  for (const order of orders) {
    groupedOrders.set(order.orderNumber, [...(groupedOrders.get(order.orderNumber) ?? []), order]);
  }

  return [...groupedOrders.values()].map((group) => {
    const order = group.reduce((current, candidate) => candidate.totalAmount > current.totalAmount ? candidate : current);
    const cashCollected = Math.max(
      0,
      order.totalAmount - order.refundedAmount - order.outstandingBalance,
    );
    const manualOrder = manualOrderFor(order, manualOrders);
    const creatorFreeOrder = isCreatorFreeOrder(order, creatorProfiles);
    const isManualOrder = Boolean(manualOrder) || (cashCollected === 0 && !creatorFreeOrder);
    const manualPrice = Math.max(0, order.subtotalAmount) + (manualOrder?.isCod ? 10 : 0);
    const salePrice = creatorFreeOrder ? 0 : isManualOrder ? manualPrice : cashCollected;
    const paymentProcessor = creatorFreeOrder ? "Influencer (RM0)" : isManualOrder ? (manualOrder?.isCod ? "COD" : "Bank Transfer") : order.paymentProcessor || "Unassigned";
    const processor = feesByProcessor.get(paymentProcessor.toLowerCase());
    const processingFee = !isManualOrder && !creatorFreeOrder && processor
      ? Math.min(salePrice, salePrice * Math.max(0, processor.percentage) / 100 + Math.max(0, processor.fixedAmount))
      : 0;
    const usesShopifyFee = paymentProcessor === "Stripe" || paymentProcessor === "Xendit";
    const shopifyFee = usesShopifyFee
      ? Math.min(salePrice, salePrice * Math.max(0, shopifyPercentage) / 100)
      : 0;
    const totalFees = processingFee + shopifyFee;
    return {
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      customerName: order.customerName,
      characters: [...new Set(group.map((item) => item.character).filter(Boolean))],
      voiceLengths: [...new Set(group.map((item) => item.voiceLength).filter(Boolean))].sort((a, b) => a - b),
      paymentProcessor,
      salePrice,
      productDiscount: creatorFreeOrder ? Math.max(order.productDiscountAmount, order.subtotalAmount) : isManualOrder ? 0 : order.productDiscountAmount,
      shippingDiscount: creatorFreeOrder ? Math.max(order.shippingDiscountAmount, order.shippingAmount) : isManualOrder ? order.shippingAmount : order.shippingDiscountAmount,
      totalDiscount: creatorFreeOrder ? Math.max(order.productDiscountAmount, order.subtotalAmount) + Math.max(order.shippingDiscountAmount, order.shippingAmount) : isManualOrder ? order.shippingAmount : order.discountAmount,
      processingFee,
      shopifyFee,
      totalFees,
      cashAfterFees: salePrice - totalFees,
    };
  });
}
