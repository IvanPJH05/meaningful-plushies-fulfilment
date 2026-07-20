import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

type FlowPayload = {
  id?: unknown;
  name?: unknown;
  trigger?: unknown;
  triggerWords?: unknown;
  description?: unknown;
  notes?: unknown;
  status?: unknown;
  active?: unknown;
  steps?: unknown;
  messages?: unknown;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitTriggerWords(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }
  return stringValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stepsFromValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }
  return stringValue(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function activeFromPayload(payload: FlowPayload) {
  if (typeof payload.active === "boolean") return payload.active;
  return stringValue(payload.status).toLowerCase() === "active";
}

function flowResponse(flow: {
  id: string;
  name: string;
  triggerWords: string[];
  notes: string | null;
  active: boolean;
  messages: unknown;
  updatedAt: Date;
}) {
  const messages = Array.isArray(flow.messages)
    ? flow.messages.map((message) => stringValue(message)).filter(Boolean)
    : [];

  return {
    id: flow.id,
    name: flow.name,
    trigger: flow.triggerWords.join(", "),
    description: flow.notes || "",
    status: flow.active ? "Active" : "Draft",
    steps: messages,
    updatedAt: flow.updatedAt.toISOString(),
  };
}

function normalizePayload(payload: FlowPayload) {
  const name = stringValue(payload.name);
  const triggerWords = splitTriggerWords(payload.triggerWords ?? payload.trigger);
  const notes = stringValue(payload.notes ?? payload.description);
  const messages = stepsFromValue(payload.messages ?? payload.steps);
  const active = activeFromPayload(payload);

  return { name, triggerWords, notes, messages, active };
}

export async function GET() {
  try {
    const business = await ensureDefaultBusiness();
    const flows = await prisma.whatsAppFlow.findMany({
      where: { businessId: business.id },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    });

    return json(200, { ok: true, flows: flows.map(flowResponse) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp flows could not be loaded.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as FlowPayload;
    const normalized = normalizePayload(payload);

    if (!normalized.name || !normalized.messages.length) {
      return json(400, { ok: false, error: "Flow name and at least one message are required." });
    }

    const flow = await prisma.whatsAppFlow.create({
      data: {
        businessId: business.id,
        name: normalized.name,
        triggerWords: normalized.triggerWords,
        notes: normalized.notes,
        messages: normalized.messages,
        active: normalized.active,
      },
    });

    return json(201, { ok: true, flow: flowResponse(flow) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp flow could not be saved.",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as FlowPayload;
    const id = stringValue(payload.id);
    const normalized = normalizePayload(payload);

    if (!id) return json(400, { ok: false, error: "Flow ID is required." });
    if (!normalized.name || !normalized.messages.length) {
      return json(400, { ok: false, error: "Flow name and at least one message are required." });
    }

    const existingFlow = await prisma.whatsAppFlow.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });

    if (!existingFlow) return json(404, { ok: false, error: "Flow could not be found." });

    const flow = await prisma.whatsAppFlow.update({
      where: { id: existingFlow.id },
      data: {
        name: normalized.name,
        triggerWords: normalized.triggerWords,
        notes: normalized.notes,
        messages: normalized.messages,
        active: normalized.active,
      },
    });

    return json(200, { ok: true, flow: flowResponse(flow) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp flow could not be updated.",
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as FlowPayload;
    const id = stringValue(payload.id);

    if (!id) return json(400, { ok: false, error: "Flow ID is required." });

    const existingFlow = await prisma.whatsAppFlow.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });

    if (!existingFlow) return json(404, { ok: false, error: "Flow could not be found." });

    await prisma.whatsAppFlow.delete({
      where: { id: existingFlow.id },
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp flow could not be deleted.",
    });
  }
}
