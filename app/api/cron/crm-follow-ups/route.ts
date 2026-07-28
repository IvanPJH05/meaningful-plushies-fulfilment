import { NextResponse } from "next/server";
import {
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
} from "@prisma/client";

import { prisma } from "@/src/infrastructure/database/prisma";
import { sendWhatsAppTextMessage } from "@/src/modules/whatsapp/outbound";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function deliveryAccepted(delivery: unknown) {
  if (!delivery || typeof delivery !== "object" || !("sent" in delivery)) return false;
  return Boolean((delivery as { sent?: unknown }).sent);
}

function deliveryMessageId(delivery: unknown) {
  if (!delivery || typeof delivery !== "object") return "";
  const response = "response" in delivery && delivery.response && typeof delivery.response === "object"
    ? delivery.response as Record<string, unknown>
    : {};
  const messages = Array.isArray(response.messages) ? response.messages : [];
  const firstMessage = messages[0];
  if (!firstMessage || typeof firstMessage !== "object" || !("id" in firstMessage)) return "";
  return typeof firstMessage.id === "string" ? firstMessage.id : "";
}

function requestIsAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!requestIsAuthorized(request)) return json(401, { ok: false, error: "Unauthorized." });

  try {
    const dueFollowUps = await prisma.followUp.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: 25,
      include: {
        business: true,
        lead: {
          include: {
            conversation: { include: { contact: true } },
            contact: true,
          },
        },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const followUp of dueFollowUps) {
      const conversation = followUp.lead.conversation;
      const contact = conversation?.contact || followUp.lead.contact;
      const recipient = contact?.waId || contact?.phone || followUp.lead.phone || "";

      if (!conversation || !recipient) {
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: { status: "FAILED" },
        });
        failed += 1;
        continue;
      }

      let delivery: unknown = null;
      let deliveryError = "";
      let status: MessageStatus = MessageStatus.QUEUED;

      try {
        delivery = await sendWhatsAppTextMessage({
          to: recipient,
          body: followUp.messageBody,
        });
        status = deliveryAccepted(delivery) ? MessageStatus.SENT : MessageStatus.FAILED;
        if (status === MessageStatus.FAILED) deliveryError = "WhatsApp did not accept the scheduled message.";
      } catch (error) {
        status = MessageStatus.FAILED;
        deliveryError = error instanceof Error ? error.message : "Scheduled WhatsApp message could not be sent.";
      }

      await prisma.message.create({
        data: {
          businessId: followUp.businessId,
          conversationId: conversation.id,
          externalMessageId: deliveryMessageId(delivery) || undefined,
          direction: MessageDirection.OUTBOUND,
          senderType: MessageSenderType.TEAM,
          messageType: MessageType.TEXT,
          body: followUp.messageBody,
          status,
          metadata: jsonValue({
            sentFromScheduledFollowUp: true,
            followUpId: followUp.id,
            delivery,
          }),
          sentAt: status === MessageStatus.SENT ? new Date() : undefined,
          failedReason: deliveryError || undefined,
        },
      });

      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          status: status === MessageStatus.SENT ? "SENT" : "FAILED",
          sentAt: status === MessageStatus.SENT ? new Date() : undefined,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: "WAITING_CUSTOMER",
          unreadCount: 0,
          lastMessageAt: new Date(),
        },
      });

      if (status === MessageStatus.SENT) sent += 1;
      else failed += 1;
    }

    return json(200, {
      ok: true,
      checked: dueFollowUps.length,
      sent,
      failed,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Scheduled follow-ups could not be processed.",
    });
  }
}
