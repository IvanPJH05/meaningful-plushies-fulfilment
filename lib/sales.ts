import type { Order, PaymentProcessorSetting } from "./types";

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

export function isCreatorFreeOrder(order: Order) {
  if (order.creatorFreeOrder) return true;
  const codes = [
    order.discountCodeUsed ?? "",
    ...(order.discountCodes ?? []),
  ].map((code) => code.trim().toUpperCase()).filter(Boolean);
  return codes.some((code) => (
    code.startsWith("FREE-")
    || code.startsWith("CREATOR-FREE")
    || code.includes("INFLUENCER-FREE")
  ));
}

export function summarizeSales(orders: Order[], settings: PaymentProcessorSetting[] = [], shopifyPercentage = 0): SalesSummary {
  const rows = buildSalesReportRows(orders, settings, shopifyPercentage);
  return rows.reduce((summary, row) => ({
    gross: summary.gross + row.salePrice + row.totalDiscount,
    productDiscounted: summary.productDiscounted + row.productDiscount,
    shippingDiscounted: summary.shippingDiscounted + row.shippingDiscount,
    bankTransfer: summary.bankTransfer + (row.paymentProcessor === "Bank Transfer" ? row.salePrice : 0),
    stripeCollected: summary.stripeCollected + (row.paymentProcessor === "Stripe" ? row.salePrice : 0),
    xenditCollected: summary.xenditCollected + (row.paymentProcessor === "Xendit" ? row.salePrice : 0),
    totalCollected: summary.totalCollected + row.salePrice,
    collected: summary.collected + row.cashAfterFees,
    processingFees: summary.processingFees + row.processingFee,
    shopifyFees: summary.shopifyFees + row.shopifyFee,
    totalFees: summary.totalFees + row.totalFees,
  }), emptySummary);
}

export function buildSalesReportRows(orders: Order[], settings: PaymentProcessorSetting[] = [], shopifyPercentage = 0): SalesReportRow[] {
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
    const creatorFreeOrder = isCreatorFreeOrder(order);
    const isBankTransfer = cashCollected === 0 && !creatorFreeOrder;
    const salePrice = isBankTransfer ? order.subtotalAmount : cashCollected;
    const paymentProcessor = creatorFreeOrder ? "Creator Free Order" : isBankTransfer ? "Bank Transfer" : order.paymentProcessor || "Unassigned";
    const processor = feesByProcessor.get(paymentProcessor.toLowerCase());
    const processingFee = !isBankTransfer && processor
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
      productDiscount: creatorFreeOrder ? Math.max(order.productDiscountAmount, order.subtotalAmount) : isBankTransfer ? 0 : order.productDiscountAmount,
      shippingDiscount: creatorFreeOrder ? Math.max(order.shippingDiscountAmount, order.shippingAmount) : isBankTransfer ? order.shippingAmount : order.shippingDiscountAmount,
      totalDiscount: creatorFreeOrder ? Math.max(order.productDiscountAmount, order.subtotalAmount) + Math.max(order.shippingDiscountAmount, order.shippingAmount) : isBankTransfer ? order.shippingAmount : order.discountAmount,
      processingFee,
      shopifyFee,
      totalFees,
      cashAfterFees: salePrice - totalFees,
    };
  });
}
