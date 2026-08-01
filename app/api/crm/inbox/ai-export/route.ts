import { randomUUID } from "node:crypto";

import { AI_EXPORT_V3, buildAiExportV3Conversation } from "@/lib/crm-ai-export-v3";
import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Scope = "ALL" | "DATE_RANGE" | "CHANGED_SINCE_LAST_EXPORT";
type DateMode = "ACTIVE_DURING_RANGE" | "CREATED_DURING_RANGE" | "UPDATED_DURING_RANGE" | "MESSAGES_DURING_RANGE";

function parseDate(value: string | null, timezone: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Malaysia has no DST; reject other zones until timezone-aware database filtering is available.
  if (timezone !== "Asia/Kuala_Lumpur") throw new Error("Only Asia/Kuala_Lumpur is currently supported for date-range exports.");
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}
function filename(scope: Scope, generatedAt: Date, start: string | null, end: string | null, timezone: string) {
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(generatedAt).replace(/[\/, :]/g, "").replace("", "");
  if (scope === "DATE_RANGE") return `conversation-export-${start}-to-${end}.json`;
  return scope === "CHANGED_SINCE_LAST_EXPORT" ? `conversation-export-changed-since-${stamp}.json` : `conversation-export-all-${stamp}.json`;
}

export async function GET(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const params = new URL(request.url).searchParams;
    const scope = (["ALL", "DATE_RANGE", "CHANGED_SINCE_LAST_EXPORT"] as const).includes(params.get("scope") as Scope) ? params.get("scope") as Scope : "ALL";
    const timezone = params.get("timezone") || "Asia/Kuala_Lumpur";
    const dateFilterMode = (["ACTIVE_DURING_RANGE", "CREATED_DURING_RANGE", "UPDATED_DURING_RANGE", "MESSAGES_DURING_RANGE"] as const).includes(params.get("date_filter_mode") as DateMode) ? params.get("date_filter_mode") as DateMode : "ACTIVE_DURING_RANGE";
    const messageHistoryMode = params.get("message_history_mode") === "DATE_RANGE_ONLY" ? "DATE_RANGE_ONLY" : "COMPLETE_CONVERSATION";
    const startDate = params.get("start_date"); const endDate = params.get("end_date");
    const from = scope === "DATE_RANGE" ? parseDate(startDate, timezone) : null;
    const to = scope === "DATE_RANGE" ? parseDate(endDate, timezone, true) : null;
    if (scope === "DATE_RANGE" && (!from || !to || from > to)) return Response.json({ ok: false, error: "Choose a valid inclusive start and end date." }, { status: 400 });
    const changedSince = scope === "CHANGED_SINCE_LAST_EXPORT" && params.get("changed_since") ? new Date(params.get("changed_since")!) : null;
    if (scope === "CHANGED_SINCE_LAST_EXPORT" && (!changedSince || Number.isNaN(changedSince.getTime()))) return Response.json({ ok: false, error: "Choose a previous AI export to compare against." }, { status: 400 });
    const includeArchived = params.get("include_archived") !== "false";
    const includeEmpty = params.get("include_without_messages") === "true";
    const includeRawMetadata = params.get("include_raw_metadata") !== "false";
    const redactSensitive = params.get("redact_sensitive") === "true";
    const where: Record<string, unknown> = { businessId: business.id, ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }), ...(includeEmpty ? {} : { messages: { some: {} } }) };
    if (scope === "CHANGED_SINCE_LAST_EXPORT") where.updatedAt = { gt: changedSince };
    if (scope === "DATE_RANGE") {
      if (dateFilterMode === "ACTIVE_DURING_RANGE" || dateFilterMode === "MESSAGES_DURING_RANGE") where.messages = { some: { createdAt: { gte: from!, lte: to! } } };
      if (dateFilterMode === "CREATED_DURING_RANGE") where.OR = [{ createdAt: { gte: from!, lte: to! } }, { contact: { is: { createdAt: { gte: from!, lte: to! } } } }];
      if (dateFilterMode === "UPDATED_DURING_RANGE") where.OR = [{ updatedAt: { gte: from!, lte: to! } }, { lastMessageAt: { gte: from!, lte: to! } }];
    }
    const [totalConversations, totalMessages] = await Promise.all([prisma.conversation.count({ where }), prisma.message.count({ where: { businessId: business.id, conversation: where } })]);
    const generatedAt = new Date(); const exportId = randomUUID(); const encoder = new TextEncoder(); let skip = 0; let written = false;
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) { try {
      const conversations = await prisma.conversation.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take: PAGE_SIZE, include: { contact: { select: { id: true, displayName: true, phone: true, waId: true, email: true, tags: true, source: true, createdAt: true, updatedAt: true, orders: { select: { id: true, source: true, externalOrderId: true, orderNumber: true, paymentStatus: true, totalAmount: true, currency: true, placedAt: true, createdAt: true, updatedAt: true, lines: { select: { description: true, quantity: true, unitPrice: true, totalAmount: true, metadata: true } }, payments: { select: { amount: true, paidAt: true } } } } } }, leads: { select: { notes: true, manualOrderLinkSentAt: true, events: { select: { id: true, type: true, details: true, createdAt: true } } } }, messages: { select: { id: true, body: true, direction: true, senderType: true, messageType: true, status: true, metadata: true, createdAt: true, attachments: { select: { id: true, originalName: true, contentType: true, mediaMimeType: true, sizeBytes: true, mediaSizeBytes: true, mediaSha256: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
      if (!written) { const meta = { export_id: exportId, generated_at: generatedAt.toISOString(), generated_timezone: timezone, crm_version: "meaningful-plushies-crm", export_version: AI_EXPORT_V3, export_scope: scope, date_filter_mode: scope === "DATE_RANGE" ? dateFilterMode : null, message_history_mode: scope === "DATE_RANGE" ? messageHistoryMode : "COMPLETE_CONVERSATION", start_date: scope === "DATE_RANGE" ? startDate : null, end_date: scope === "DATE_RANGE" ? endDate : null, comparison_export_id: params.get("comparison_export_id") || null, include_archived: includeArchived, include_raw_metadata: includeRawMetadata, total_conversations: totalConversations, total_messages: totalMessages, total_attachments: null, warnings: [] }; controller.enqueue(encoder.encode(`{\n  "export_metadata": ${JSON.stringify(meta)},\n  "conversations": [\n`)); written = true; }
      for (const conversation of conversations) { const record = buildAiExportV3Conversation(conversation, { messageFrom: from, messageTo: to, dateRangeOnly: scope === "DATE_RANGE" && (dateFilterMode === "MESSAGES_DURING_RANGE" || messageHistoryMode === "DATE_RANGE_ONLY"), changedSince, includeRawMetadata, redactSensitive, lastExportedAt: params.get("last_exported_at") }); controller.enqueue(encoder.encode(`${(skip > 0 || conversations.indexOf(conversation) > 0) ? ",\n" : ""}${JSON.stringify(record)}`)); }
      skip += conversations.length;
      if (conversations.length < PAGE_SIZE) { controller.enqueue(encoder.encode("\n  ]\n}\n")); controller.close(); }
    } catch (error) { controller.error(error); } } });
    return new Response(stream, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${filename(scope, generatedAt, startDate, endDate, timezone)}"`, "x-ai-export-id": exportId, "x-ai-export-generated-at": generatedAt.toISOString(), "cache-control": "no-store" } });
  } catch (error) { console.error("CRM AI export v3 failed", error instanceof Error ? error.message : "unknown error"); return Response.json({ ok: false, error: error instanceof Error ? error.message : "AI Export v3 could not be created." }, { status: 500 }); }
}
