import { manualOrderProducts } from "../../../lib/manual-order-products.ts";
import { manualOrderCharacters, normalizeManualOrderCharacter } from "../../../lib/manual-order-product-paths.ts";

export type PaidManualOrderInput = {
  customerName: string;
  phone: string;
  productKey: string;
  character?: string;
  shippingRegion?: "WEST" | "EAST";
  paidAmount?: number;
  paymentReference?: string;
  paidAt?: string;
  paymentConfirmed?: boolean;
  conversationId?: string;
  leadId?: string;
  aiRunId?: string;
};

export type PaidManualOrderCommandPayload = {
  customerName: string;
  phone: string;
  productKey: string;
  character: string;
  shippingRegion: "WEST" | "EAST";
  payment: {
    confirmed: true;
    amount?: number;
    reference?: string;
    paidAt?: string;
  };
};

export const paidManualOrderPhase2Policy = [
  "AI can collect customer details and payment instructions.",
  "AI must not create a manual order link before payment is confirmed.",
  "After payment confirmation, AI can call the manual-order command endpoint.",
  "The system creates the Shopify discount/manual order link and returns the WhatsApp message to send.",
  "The command is logged so the team can audit what happened.",
] as const;

export function normalizePaidManualOrderInput(input: PaidManualOrderInput): PaidManualOrderCommandPayload {
  const product = manualOrderProducts.find((item) => item.key === input.productKey);
  if (!product) throw new Error("Choose a valid manual order product.");

  const customerName = input.customerName.trim();
  if (!customerName) throw new Error("Customer name is required.");

  const phone = input.phone.trim();
  if (!phone) throw new Error("Customer phone is required.");

  const character = normalizeManualOrderCharacter(input.character);
  if (input.character && !character) throw new Error("Choose a valid character.");

  const paidAmount = typeof input.paidAmount === "number" && Number.isFinite(input.paidAmount)
    ? Math.max(0, input.paidAmount)
    : undefined;

  return {
    customerName,
    phone,
    productKey: product.key,
    character: character || manualOrderCharacters[0],
    shippingRegion: input.shippingRegion === "EAST" ? "EAST" : "WEST",
    payment: {
      confirmed: true,
      amount: paidAmount,
      reference: input.paymentReference?.trim() || undefined,
      paidAt: input.paidAt || new Date().toISOString(),
    },
  };
}

export function assertPaymentConfirmed(input: PaidManualOrderInput): void {
  if (input.paymentConfirmed !== true) {
    throw new Error("Payment must be confirmed before the AI can create a manual order link.");
  }
}

export function buildPaidManualOrderCommand(input: PaidManualOrderInput): PaidManualOrderCommandPayload {
  assertPaymentConfirmed(input);
  return normalizePaidManualOrderInput(input);
}

export function buildManualOrderReadyWhatsAppMessage(input: {
  customerName: string;
  checkoutUrl: string;
  discountCode: string;
}) {
  return [
    `Hi ${input.customerName}, payment received.`,
    "Here is your Meaningful Plushies checkout link:",
    input.checkoutUrl,
    "",
    `Discount code: ${input.discountCode}`,
    "Please fill in your plushie details there so we can start your order.",
  ].join("\n");
}
