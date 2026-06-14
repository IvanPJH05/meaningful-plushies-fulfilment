import type { Order, PaymentProcessorSetting } from "./types";

export type SalesSummary = {
  gross: number;
  productDiscounted: number;
  shippingDiscounted: number;
  bankTransfer: number;
  collected: number;
  processingFees: number;
};

const emptySummary: SalesSummary = {
  gross: 0,
  productDiscounted: 0,
  shippingDiscounted: 0,
  bankTransfer: 0,
  collected: 0,
  processingFees: 0,
};

export function summarizeSales(orders: Order[], settings: PaymentProcessorSetting[] = []): SalesSummary {
  const feesByProcessor = new Map(settings.map((setting) => [setting.processor.toLowerCase(), setting]));
  const uniqueOrders = new Map<string, Order>();
  for (const order of orders) {
    const current = uniqueOrders.get(order.orderNumber);
    if (!current || order.totalAmount > current.totalAmount) {
      uniqueOrders.set(order.orderNumber, order);
    }
  }

  return [...uniqueOrders.values()].reduce((summary, order) => {
    const cashCollected = Math.max(
      0,
      order.totalAmount - order.refundedAmount - order.outstandingBalance,
    );
    const isBankTransfer = cashCollected === 0;

    if (isBankTransfer) {
      return {
        gross: summary.gross + order.subtotalAmount + order.shippingAmount,
        productDiscounted: summary.productDiscounted,
        shippingDiscounted: summary.shippingDiscounted + order.shippingAmount,
        bankTransfer: summary.bankTransfer + order.subtotalAmount,
        collected: summary.collected + order.subtotalAmount,
        processingFees: summary.processingFees,
      };
    }

    const processor = feesByProcessor.get((order.paymentProcessor || "Unknown").toLowerCase());
    const processingFee = processor
      ? Math.min(cashCollected, cashCollected * Math.max(0, processor.percentage) / 100 + Math.max(0, processor.fixedAmount))
      : 0;

    return {
      gross: summary.gross + order.totalAmount + order.discountAmount,
      productDiscounted: summary.productDiscounted + order.productDiscountAmount,
      shippingDiscounted: summary.shippingDiscounted + order.shippingDiscountAmount,
      bankTransfer: summary.bankTransfer,
      collected: summary.collected + cashCollected - processingFee,
      processingFees: summary.processingFees + processingFee,
    };
  }, emptySummary);
}
