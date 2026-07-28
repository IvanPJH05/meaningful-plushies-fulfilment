import { NextResponse } from "next/server";
import {
  LeadStage,
  LeadTemperature,
  PaymentStatus,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomerStatus(value: unknown) {
  const text = stringValue(value).toLowerCase();
  if (text === "cold") return "Cold";
  if (text === "warm") return "Warm";
  if (text === "paid") return "Paid";
  if (text === "unpaid") return "Unpaid";
  return "";
}

function customerStatusFromLead(lead: {
  temperature?: LeadTemperature | null;
  paymentStatus?: PaymentStatus | null;
  stage?: LeadStage | null;
} | null) {
  if (!lead) return "Cold";
  if (lead.paymentStatus === PaymentStatus.PAID || lead.stage === LeadStage.PAID) return "Paid";
  if (lead.stage === LeadStage.NEW || lead.temperature === LeadTemperature.COLD) return "Cold";
  if (lead.paymentStatus === PaymentStatus.UNPAID) return "Unpaid";
  return "Warm";
}

function statusPatch(customerStatus: string) {
  if (customerStatus === "Paid") {
    return {
      temperature: LeadTemperature.HOT,
      paymentStatus: PaymentStatus.PAID,
      stage: LeadStage.PAID,
    };
  }
  if (customerStatus === "Unpaid") {
    return {
      temperature: LeadTemperature.WARM,
      paymentStatus: PaymentStatus.UNPAID,
      stage: LeadStage.READY_TO_ORDER,
    };
  }
  if (customerStatus === "Cold") {
    return {
      temperature: LeadTemperature.COLD,
      paymentStatus: PaymentStatus.UNPAID,
      stage: LeadStage.NEW,
    };
  }
  if (customerStatus === "Warm") {
    return {
      temperature: LeadTemperature.WARM,
      paymentStatus: PaymentStatus.UNPAID,
      stage: LeadStage.QUALIFYING,
    };
  }
  return {};
}

async function ensureCustomerLead(args: {
  businessId: string;
  conversationId: string;
  displayName?: string;
  notes?: string;
  customerStatus?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { businessId: args.businessId, id: args.conversationId },
    include: { contact: true },
  });
  if (!conversation) return null;

  const existingLead = await prisma.lead.findFirst({
    where: {
      businessId: args.businessId,
      OR: [
        { conversationId: conversation.id },
        { contactId: conversation.contactId },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const displayName = args.displayName
    || conversation.contact.displayName
    || conversation.contact.phone
    || conversation.contact.waId
    || "WhatsApp customer";
  const sharedData = {
    customerName: displayName,
    phone: conversation.contact.phone || conversation.contact.waId,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    ...(args.notes !== undefined ? { notes: args.notes } : {}),
    ...statusPatch(args.customerStatus || "Cold"),
  };

  if (existingLead) {
    return prisma.lead.update({
      where: { id: existingLead.id },
      data: sharedData,
    });
  }

  return prisma.lead.create({
    data: {
      businessId: args.businessId,
      ...sharedData,
    },
  });
}

async function customerResponse(businessId: string, conversationId?: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      businessId,
      ...(conversationId ? { id: conversationId } : {}),
    },
    orderBy: [
      { lastMessageAt: "desc" },
      { updatedAt: "desc" },
    ],
    select: {
      id: true,
      status: true,
      aiMode: true,
      unreadCount: true,
      lastMessageAt: true,
      updatedAt: true,
      createdAt: true,
      contact: {
        select: {
          id: true,
          waId: true,
          phone: true,
          displayName: true,
          email: true,
          source: true,
          tags: true,
        },
      },
      leads: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          stage: true,
          temperature: true,
          notes: true,
          customerName: true,
          phone: true,
          requestedCharacter: true,
          requestedVoice: true,
          paymentStatus: true,
          updatedAt: true,
          followUps: {
            where: { status: "SCHEDULED" },
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              scheduledAt: true,
              messageBody: true,
              status: true,
            },
            take: 1,
          },
        },
        take: 5,
      },
      messages: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          direction: true,
          senderType: true,
          status: true,
          createdAt: true,
        },
        take: 1,
      },
      _count: {
        select: { messages: true },
      },
    },
  });

  const conversationIds = conversations.map((conversation) => conversation.id);
  const [firstMessages, lastTextedMessages] = conversationIds.length
    ? await Promise.all([
      prisma.message.groupBy({
        by: ["conversationId"],
        where: { businessId, conversationId: { in: conversationIds } },
        _min: { createdAt: true },
      }),
      prisma.message.groupBy({
        by: ["conversationId"],
        where: { businessId, conversationId: { in: conversationIds }, direction: "OUTBOUND" },
        _max: { createdAt: true },
      }),
    ])
    : [[], []];
  const firstMessageAtByConversation = new Map(firstMessages.map((message) => [message.conversationId, message._min.createdAt]));
  const lastTextedAtByConversation = new Map(lastTextedMessages.map((message) => [message.conversationId, message._max.createdAt]));

  return conversations.map((conversation) => {
    const latestLead = conversation.leads[0] || null;
    const lastMessage = conversation.messages[0] || null;
    const displayName = conversation.contact.displayName
      || latestLead?.customerName
      || conversation.contact.phone
      || conversation.contact.waId
      || "WhatsApp customer";

    return {
      id: conversation.contact.id,
      conversationId: conversation.id,
      displayName,
      phone: conversation.contact.phone,
      waId: conversation.contact.waId,
      email: conversation.contact.email,
      source: conversation.contact.source || "Whatsapp",
      tags: conversation.contact.tags,
      status: conversation.status,
      aiMode: conversation.aiMode,
      unreadCount: conversation.unreadCount,
      notes: latestLead?.notes || "",
      customerStatus: customerStatusFromLead(latestLead),
      leadId: latestLead?.id || null,
      leadStage: latestLead?.stage || null,
      leadTemperature: latestLead?.temperature || null,
      requestedCharacter: latestLead?.requestedCharacter || null,
      requestedVoice: latestLead?.requestedVoice || null,
      paymentStatus: latestLead?.paymentStatus || null,
      messageCount: conversation._count.messages,
      firstMessageAt: serializeDate(firstMessageAtByConversation.get(conversation.id)),
      lastTextedAt: serializeDate(lastTextedAtByConversation.get(conversation.id)),
      nextScheduledMessage: latestLead?.followUps[0]
        ? {
          id: latestLead.followUps[0].id,
          scheduledAt: serializeDate(latestLead.followUps[0].scheduledAt),
          messageBody: latestLead.followUps[0].messageBody,
          status: latestLead.followUps[0].status,
        }
        : null,
      lastMessage: lastMessage
        ? {
          id: lastMessage.id,
          preview: (lastMessage.body || "").replace(/\s+/g, " ").trim().slice(0, 120),
          direction: lastMessage.direction,
          senderType: lastMessage.senderType,
          status: lastMessage.status,
          createdAt: serializeDate(lastMessage.createdAt),
        }
        : null,
      lastMessageAt: serializeDate(conversation.lastMessageAt || conversation.updatedAt),
      createdAt: serializeDate(conversation.createdAt),
      updatedAt: serializeDate(conversation.updatedAt),
      leads: conversation.leads.map((lead) => ({
        id: lead.id,
        stage: lead.stage,
        temperature: lead.temperature,
        notes: lead.notes || "",
        customerName: lead.customerName,
        phone: lead.phone,
        requestedCharacter: lead.requestedCharacter,
        requestedVoice: lead.requestedVoice,
        paymentStatus: lead.paymentStatus,
        nextScheduledMessage: lead.followUps[0]
          ? {
            id: lead.followUps[0].id,
            scheduledAt: serializeDate(lead.followUps[0].scheduledAt),
            messageBody: lead.followUps[0].messageBody,
            status: lead.followUps[0].status,
          }
          : null,
        updatedAt: serializeDate(lead.updatedAt),
      })),
    };
  });
}

export async function GET() {
  try {
    const business = await ensureDefaultBusiness();
    return json(200, { ok: true, customers: await customerResponse(business.id) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Customer data could not be loaded.",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const body = await request.json().catch(() => ({})) as {
      conversationId?: unknown;
      displayName?: unknown;
      notes?: unknown;
      customerStatus?: unknown;
    };
    const conversationId = stringValue(body.conversationId);

    if (!conversationId) return json(400, { ok: false, error: "conversationId is required." });

    const conversation = await prisma.conversation.findFirst({
      where: { businessId: business.id, id: conversationId },
      include: { contact: true },
    });
    if (!conversation) return json(404, { ok: false, error: "Customer conversation was not found." });

    const displayName = stringValue(body.displayName);
    if (displayName) {
      await prisma.contact.update({
        where: { id: conversation.contactId },
        data: { displayName },
      });
    }

    const customerStatus = normalizeCustomerStatus(body.customerStatus);
    if (typeof body.notes === "string" || customerStatus) {
      await ensureCustomerLead({
        businessId: business.id,
        conversationId: conversation.id,
        displayName,
        notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
        customerStatus,
      });
    }

    const customers = await customerResponse(business.id, conversation.id);
    return json(200, { ok: true, customer: customers[0] || null });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Customer data could not be saved.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      conversationId?: unknown;
      displayName?: unknown;
      notes?: unknown;
      customerStatus?: unknown;
      scheduledAt?: unknown;
      messageBody?: unknown;
    };
    const action = stringValue(body.action).toLowerCase();
    const conversationId = stringValue(body.conversationId);
    const messageBody = stringValue(body.messageBody);
    const scheduledAtText = stringValue(body.scheduledAt);
    const scheduledAt = scheduledAtText ? new Date(scheduledAtText) : null;

    if (action !== "schedule_message") return json(400, { ok: false, error: "Choose a valid customer action." });
    if (!conversationId) return json(400, { ok: false, error: "conversationId is required." });
    if (!messageBody) return json(400, { ok: false, error: "Type the scheduled message first." });
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return json(400, { ok: false, error: "Choose a future date and time." });
    }

    const lead = await ensureCustomerLead({
      businessId: business.id,
      conversationId,
      displayName: stringValue(body.displayName),
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
      customerStatus: normalizeCustomerStatus(body.customerStatus),
    });
    if (!lead) return json(404, { ok: false, error: "Customer conversation was not found." });

    await prisma.followUp.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        scheduledAt,
        messageBody,
        templateKey: "crm_customer_row",
      },
    });

    const customers = await customerResponse(business.id, conversationId);
    return json(201, { ok: true, customer: customers[0] || null });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Scheduled message could not be saved.",
    });
  }
}
