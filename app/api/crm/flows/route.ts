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

const actionTypes = ["Send Message", "Send Image", "AI Reply", "Update Status", "Add Note"] as const;
const delayUnits = ["seconds", "minutes", "hours", "days"] as const;

type FlowStep = {
  type: typeof actionTypes[number];
  delayValue: string;
  delayUnit: typeof delayUnits[number];
  message: string;
  imageUrl?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function normalizeActionType(value: unknown): FlowStep["type"] {
  const text = stringValue(value).toLowerCase();
  return actionTypes.find((type) => type.toLowerCase() === text) || "Send Message";
}

function normalizeDelayUnit(value: unknown): FlowStep["delayUnit"] {
  const text = stringValue(value).toLowerCase();
  return delayUnits.find((unit) => unit === text) || "minutes";
}

function flowStepFromLegacyText(value: string): FlowStep | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const delayedMatch = trimmed.match(/^Wait\s+(\d+)\s+(seconds|minutes|hours|days),\s+then\s+([^:]+):\s*([\s\S]*)$/i);
  const immediateMatch = trimmed.match(/^Immediately,\s+then\s+([^:]+):\s*([\s\S]*)$/i);

  if (delayedMatch) {
    return {
      delayValue: delayedMatch[1],
      delayUnit: normalizeDelayUnit(delayedMatch[2]),
      type: normalizeActionType(delayedMatch[3]),
      message: delayedMatch[4].trim(),
    };
  }

  if (immediateMatch) {
    return {
      delayValue: "0",
      delayUnit: "minutes",
      type: normalizeActionType(immediateMatch[1]),
      message: immediateMatch[2].trim(),
    };
  }

  return {
    delayValue: "0",
    delayUnit: "minutes",
    type: "Send Message",
    message: trimmed,
  };
}

function normalizeFlowStep(value: unknown): FlowStep | null {
  if (typeof value === "string") return flowStepFromLegacyText(value);

  const step = recordValue(value);
  if (!Object.keys(step).length) return null;

  const type = normalizeActionType(step.type ?? step.actionType);
  const delay = Math.max(0, Number(step.delayValue ?? step.delay ?? 0) || 0);
  const message = stringValue(step.message ?? step.body ?? step.caption ?? step.text);
  const imageUrl = stringValue(step.imageUrl ?? step.mediaUrl ?? step.url);

  if (type === "Send Image" && !imageUrl) return null;
  if (type !== "Send Image" && !message) return null;

  return {
    type,
    delayValue: `${delay}`,
    delayUnit: normalizeDelayUnit(step.delayUnit ?? step.unit),
    message,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function stepsFromValue(value: unknown): FlowStep[] {
  if (Array.isArray(value)) {
    return value.map(normalizeFlowStep).filter((step): step is FlowStep => Boolean(step));
  }
  return stringValue(value)
    .split("\n")
    .map(flowStepFromLegacyText)
    .filter((step): step is FlowStep => Boolean(step));
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
    ? flow.messages.map(normalizeFlowStep).filter((step): step is FlowStep => Boolean(step))
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
