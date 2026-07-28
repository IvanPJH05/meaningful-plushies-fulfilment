import { NextResponse } from "next/server";

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
      leadId: latestLead?.id || null,
      leadStage: latestLead?.stage || null,
      leadTemperature: latestLead?.temperature || null,
      requestedCharacter: latestLead?.requestedCharacter || null,
      requestedVoice: latestLead?.requestedVoice || null,
      paymentStatus: latestLead?.paymentStatus || null,
      messageCount: conversation._count.messages,
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

    if (typeof body.notes === "string") {
      const notes = body.notes.trim();
      const existingLead = await prisma.lead.findFirst({
        where: {
          businessId: business.id,
          OR: [
            { conversationId: conversation.id },
            { contactId: conversation.contactId },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (existingLead) {
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            notes,
            customerName: displayName || conversation.contact.displayName || conversation.contact.phone || conversation.contact.waId,
            phone: conversation.contact.phone || conversation.contact.waId,
            conversationId: conversation.id,
            contactId: conversation.contactId,
          },
        });
      } else {
        await prisma.lead.create({
          data: {
            businessId: business.id,
            contactId: conversation.contactId,
            conversationId: conversation.id,
            customerName: displayName || conversation.contact.displayName || conversation.contact.phone || conversation.contact.waId,
            phone: conversation.contact.phone || conversation.contact.waId,
            notes,
          },
        });
      }
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
