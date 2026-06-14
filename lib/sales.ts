import type { Order } from "./types";

export type SalesSummary = {
  gross: number;
  productDiscounted: number;
  shippingDiscounted: number;
  bankTransfer: number;
  collected: number;
};

const emptySummary: SalesSummary = {
  gross: 0,
  productDiscounted: 0,
  shippingDiscounted: 0,
  bankTransfer: 0,
  collected: 0,
};

export function summarizeSales(orders: Order[]): SalesSummary {
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
      };
    }

    return {
      gross: summary.gross + order.totalAmount + order.discountAmount,
      productDiscounted: summary.productDiscounted + order.productDiscountAmount,
      shippingDiscounted: summary.shippingDiscounted + order.shippingDiscountAmount,
      bankTransfer: summary.bankTransfer,
      collected: summary.collected + cashCollected,
    };
  }, emptySummary);
}

