import { NextResponse } from "next/server";
import { AiCommandStatus, AiCommandType, LeadStage, PaymentStatus, Prisma } from "@prisma/client";

import { createManualOrderDiscounts } from "@/lib/manual-orders";
import { saveManualOrder } from "@/lib/supabase";
import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import {
  buildManualOrderReadyWhatsAppMessage,
  buildPaidManualOrderCommand,
  type PaidManualOrderInput,
} from "@/src/modules/sales/paid-manual-order-flow";
import { sendWhatsAppTextMessage } from "@/src/modules/whatsapp/outbound";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function safeCreateCommand(input: {
  status: AiCommandStatus;
  payload: unknown;
  conversationId?: string;
  leadId?: string;
  aiRunId?: string;
  paymentConfirmedAt?: Date;
}) {
  try {
    const business = await ensureDefaultBusiness();
    return await prisma.aiCommand.create({
      data: {
        businessId: business.id,
        conversationId: input.conversationId,
        leadId: input.leadId,
        aiRunId: input.aiRunId,
        type: AiCommandType.CREATE_MANUAL_ORDER,
        status: input.status,
        requiresPaymentConfirmed: true,
        paymentConfirmedAt: input.paymentConfirmedAt,
        payload: jsonValue(input.payload),
      },
    });
  } catch {
    return null;
  }
}

async function safeUpdateCommand(commandId: string | undefined, input: {
  status: AiCommandStatus;
  result?: unknown;
  error?: string;
  executedAt?: Date;
}) {
  if (!commandId) return;
  try {
    await prisma.aiCommand.update({
      where: { id: commandId },
      data: {
        status: input.status,
        result: input.result === undefined ? undefined : jsonValue(input.result),
        error: input.error,
        executedAt: input.executedAt,
      },
    });
  } catch {
    // Manual order creation should not fail just because the CRM command log is temporarily unavailable.
  }
}

async function safeMarkLeadPaid(leadId: string | undefined, input: {
  paidAt: Date;
  paidAmount?: number;
  manualOrderId: string;
}) {
  if (!leadId) return;
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        stage: LeadStage.CHECKOUT_SENT,
        paymentStatus: PaymentStatus.PAID,
        paidAmount: input.paidAmount,
        paymentConfirmedAt: input.paidAt,
        manualOrderId: input.manualOrderId,
        manualOrderLinkSentAt: new Date(),
      },
    });
  } catch {
    // A missing lead should not stop a paid customer from receiving their checkout link.
  }
}

export async function POST(request: Request) {
  let body: PaidManualOrderInput;
  try {
    body = await request.json() as PaidManualOrderInput;
  } catch {
    return json(400, { ok: false, error: "Send a valid JSON body." });
  }

  if (body.paymentConfirmed !== true) {
    await safeCreateCommand({
      status: AiCommandStatus.PAYMENT_REQUIRED,
      payload: body,
      conversationId: body.conversationId,
      leadId: body.leadId,
      aiRunId: body.aiRunId,
    });
    return json(409, {
      ok: false,
      blocked: true,
      error: "Payment must be confirmed before the AI can create a manual order link.",
    });
  }

  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  const command = await safeCreateCommand({
    status: AiCommandStatus.READY,
    payload: body,
    conversationId: body.conversationId,
    leadId: body.leadId,
    aiRunId: body.aiRunId,
    paymentConfirmedAt: Number.isFinite(paidAt.getTime()) ? paidAt : new Date(),
  });

  try {
    const payload = buildPaidManualOrderCommand(body);
    const manualOrder = await createManualOrderDiscounts(payload);
    await saveManualOrder(manualOrder);

    const message = buildManualOrderReadyWhatsAppMessage({
      customerName: manualOrder.customerName,
      checkoutUrl: manualOrder.customerLink,
      discountCode: manualOrder.productDiscountCode,
    });
    const whatsAppDelivery = await sendWhatsAppTextMessage({
      to: manualOrder.phoneNormalized,
      body: message,
    });

    await safeMarkLeadPaid(body.leadId, {
      paidAt: Number.isFinite(paidAt.getTime()) ? paidAt : new Date(),
      paidAmount: payload.payment.amount,
      manualOrderId: manualOrder.id,
    });

    await safeUpdateCommand(command?.id, {
      status: AiCommandStatus.EXECUTED,
      result: {
        manualOrderId: manualOrder.id,
        productDiscountCode: manualOrder.productDiscountCode,
        customerLink: manualOrder.customerLink,
        whatsAppMessage: message,
        whatsAppDelivery,
      },
      executedAt: new Date(),
    });

    return json(200, {
      ok: true,
      commandId: command?.id ?? null,
      manualOrder,
      whatsapp: {
        message,
        ...whatsAppDelivery,
      },
    });
  } catch (error) {
    await safeUpdateCommand(command?.id, {
      status: AiCommandStatus.FAILED,
      error: errorMessage(error, "Manual order command failed."),
    });
    return json(500, { ok: false, commandId: command?.id ?? null, error: errorMessage(error, "Manual order command failed.") });
  }
}
