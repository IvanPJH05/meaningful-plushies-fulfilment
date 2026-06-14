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
};

export function summarizeSales(orders: Order[], settings: PaymentProcessorSetting[] = []): SalesSummary {
  const rows = buildSalesReportRows(orders, settings);
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
  }), emptySummary);
}

export function buildSalesReportRows(orders: Order[], settings: PaymentProcessorSetting[] = []): SalesReportRow[] {
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
    const isBankTransfer = cashCollected === 0;
    const salePrice = isBankTransfer ? order.subtotalAmount : cashCollected;
    const paymentProcessor = isBankTransfer ? "Bank Transfer" : order.paymentProcessor || "Unassigned";
    const processor = feesByProcessor.get(paymentProcessor.toLowerCase());
    const processingFee = !isBankTransfer && processor
      ? Math.min(salePrice, salePrice * Math.max(0, processor.percentage) / 100 + Math.max(0, processor.fixedAmount))
      : 0;
    return {
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      customerName: order.customerName,
      characters: [...new Set(group.map((item) => item.character).filter(Boolean))],
      voiceLengths: [...new Set(group.map((item) => item.voiceLength).filter(Boolean))].sort((a, b) => a - b),
      paymentProcessor,
      salePrice,
      productDiscount: isBankTransfer ? 0 : order.productDiscountAmount,
      shippingDiscount: isBankTransfer ? order.shippingAmount : order.shippingDiscountAmount,
      totalDiscount: isBankTransfer ? order.shippingAmount : order.discountAmount,
      processingFee,
      cashAfterFees: salePrice - processingFee,
    };
  });
}
