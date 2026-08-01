import { CRM_EXPORT_VERSION, buildChatExportRecord } from "@/lib/crm-chat-export";
import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function exportFileName(date = new Date()) {
  return `conversation-export-${date.toISOString().slice(0, 10)}.json`;
}

function dateFrom(value: string | null) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000+08:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const { searchParams } = new URL(request.url);
    const changedSince = dateFrom(searchParams.get("changed_since"));
    const generatedAt = new Date();
    const encoder = new TextEncoder();
    let offset = 0;
    let headerWritten = false;
    let conversationWritten = false;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const conversations = await prisma.conversation.findMany({
            where: {
              businessId: business.id,
              ...(changedSince ? { updatedAt: { gt: changedSince } } : {}),
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: offset,
            take: PAGE_SIZE,
            include: {
              contact: {
                select: {
                  id: true, displayName: true, phone: true, waId: true, tags: true, createdAt: true, updatedAt: true,
                  orders: {
                    select: {
                      id: true, source: true, externalOrderId: true, orderNumber: true, paymentStatus: true, placedAt: true, createdAt: true,
                      payments: { select: { id: true, provider: true, externalPaymentId: true, amount: true, currency: true, paidAt: true, createdAt: true } },
                    },
                  },
                },
              },
              leads: { select: { notes: true, manualOrderLinkSentAt: true, events: { select: { id: true, type: true, details: true, createdAt: true }, orderBy: { createdAt: "asc" } } } },
              messages: {
                select: {
                  id: true, body: true, direction: true, senderType: true, messageType: true, status: true, metadata: true, createdAt: true,
                  attachments: { select: { id: true, originalName: true, contentType: true, mediaMimeType: true, sizeBytes: true, mediaSizeBytes: true } },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              },
            },
          });

          if (!headerWritten) {
            controller.enqueue(encoder.encode(`{\n  "generated_at": ${JSON.stringify(generatedAt.toISOString())},\n  "crm_version": ${JSON.stringify(CRM_EXPORT_VERSION)},\n  "conversations": [\n`));
            headerWritten = true;
          }

          for (const conversation of conversations) {
            const record = buildChatExportRecord(conversation);
            controller.enqueue(encoder.encode(`${conversationWritten ? ",\n" : ""}${JSON.stringify(record)}`));
            conversationWritten = true;
          }
          offset += conversations.length;
          if (conversations.length < PAGE_SIZE) {
            controller.enqueue(encoder.encode("\n  ]\n}\n"));
            controller.close();
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(generatedAt)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("CRM AI export failed", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "AI export could not be created." }, { status: 500 });
  }
}
