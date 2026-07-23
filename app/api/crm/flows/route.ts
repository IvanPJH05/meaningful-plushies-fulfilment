import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";

type FlowPayload = {
  id?: unknown;
  name?: unknown;
  triggerType?: unknown;
  triggerMode?: unknown;
  triggerButtonLabel?: unknown;
  buttonLabel?: unknown;
  buttonName?: unknown;
  trigger?: unknown;
  triggerWords?: unknown;
  description?: unknown;
  notes?: unknown;
  status?: unknown;
  active?: unknown;
  steps?: unknown;
  messages?: unknown;
};

const actionTypes = ["Send Message", "Send Media", "Send Image", "Send Video", "AI Reply", "Update Status", "Add Note"] as const;
const delayUnits = ["seconds", "minutes", "hours", "days"] as const;
const mediaTypes = ["image", "video"] as const;

type TriggerType = "keywords" | "click";

type FlowMediaItem = {
  type: typeof mediaTypes[number];
  url: string;
  caption?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
};

type FlowStep = {
  type: typeof actionTypes[number];
  delayValue: string;
  delayUnit: typeof delayUnits[number];
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: FlowMediaItem[];
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
  if (["send media", "media", "media group", "send media group"].includes(text)) return "Send Media";
  return actionTypes.find((type) => type.toLowerCase() === text) || "Send Message";
}

function normalizeDelayUnit(value: unknown): FlowStep["delayUnit"] {
  const text = stringValue(value).toLowerCase();
  return delayUnits.find((unit) => unit === text) || "minutes";
}

function normalizeTriggerType(value: unknown, label: string): TriggerType {
  const text = stringValue(value).toLowerCase();
  if (text.includes("click") || text.includes("button") || label) return "click";
  return "keywords";
}

function inferMediaTypeFromUrl(url: string): FlowMediaItem["type"] {
  const cleanUrl = url.split("?")[0].toLowerCase();
  return cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".mov") || cleanUrl.endsWith(".webm") ? "video" : "image";
}

function normalizeMediaType(value: unknown, url: string): FlowMediaItem["type"] {
  const text = stringValue(value).toLowerCase();
  return mediaTypes.find((type) => type === text) || inferMediaTypeFromUrl(url);
}

function normalizeMediaItems(value: unknown, step: Record<string, unknown>, stepType: FlowStep["type"], message: string): FlowMediaItem[] {
  const items: FlowMediaItem[] = [];
  const addItem = (candidate: unknown) => {
    const record = recordValue(candidate);
    const url = typeof candidate === "string"
      ? stringValue(candidate)
      : stringValue(record.url ?? record.mediaUrl ?? record.imageUrl ?? record.videoUrl ?? record.link);
    if (!url) return;
    items.push({
      type: normalizeMediaType(record.type ?? record.mediaType, url),
      url,
      ...(stringValue(record.caption ?? record.message ?? record.text) ? {
        caption: stringValue(record.caption ?? record.message ?? record.text),
      } : {}),
      ...(stringValue(record.fileName ?? record.filename ?? record.name) ? {
        fileName: stringValue(record.fileName ?? record.filename ?? record.name),
      } : {}),
      ...(stringValue(record.contentType ?? record.mimeType) ? {
        contentType: stringValue(record.contentType ?? record.mimeType),
      } : {}),
      ...(typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes) ? {
        sizeBytes: Math.max(0, Math.round(record.sizeBytes)),
      } : {}),
    });
  };

  if (Array.isArray(value)) value.forEach(addItem);
  else if (value) addItem(value);

  const imageUrl = stringValue(step.imageUrl ?? (stepType === "Send Image" ? step.mediaUrl ?? step.url : ""));
  if (imageUrl) items.push({ type: "image", url: imageUrl, ...(message ? { caption: message } : {}) });

  const videoUrl = stringValue(step.videoUrl ?? (stepType === "Send Video" ? step.mediaUrl ?? step.url : ""));
  if (videoUrl) items.push({ type: "video", url: videoUrl, ...(message ? { caption: message } : {}) });

  if (!items.length && stepType === "Send Media") {
    const url = stringValue(step.mediaUrl ?? step.url ?? step.imageUrl ?? step.videoUrl);
    if (url) items.push({ type: normalizeMediaType(step.mediaType ?? step.type, url), url, ...(message ? { caption: message } : {}) });
  }

  return items;
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
  const mediaItems = normalizeMediaItems(step.mediaItems ?? step.media ?? step.attachments, step, type, message);
  const firstImage = mediaItems.find((item) => item.type === "image")?.url || "";
  const firstVideo = mediaItems.find((item) => item.type === "video")?.url || "";
  const mediaAction = type === "Send Image" || type === "Send Video" || type === "Send Media";

  if (mediaAction && !mediaItems.length) return null;
  if (!mediaAction && type !== "AI Reply" && !message) return null;

  return {
    type,
    delayValue: `${delay}`,
    delayUnit: normalizeDelayUnit(step.delayUnit ?? step.unit),
    message,
    ...(firstImage ? { imageUrl: firstImage } : {}),
    ...(firstVideo ? { videoUrl: firstVideo } : {}),
    ...(mediaItems.length ? { mediaItems } : {}),
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
  triggerType: string | null;
  triggerButtonLabel: string | null;
  triggerWords: string[];
  notes: string | null;
  active: boolean;
  messages: unknown;
  updatedAt: Date;
}) {
  const triggerType = normalizeTriggerType(flow.triggerType, flow.triggerButtonLabel || "");
  const messages = Array.isArray(flow.messages)
    ? flow.messages.map(normalizeFlowStep).filter((step): step is FlowStep => Boolean(step))
    : [];

  return {
    id: flow.id,
    name: flow.name,
    triggerType,
    triggerButtonLabel: flow.triggerButtonLabel || "",
    trigger: flow.triggerWords.join(", "),
    description: flow.notes || "",
    status: flow.active ? "Active" : "Draft",
    steps: messages,
    updatedAt: flow.updatedAt.toISOString(),
  };
}

function normalizePayload(payload: FlowPayload) {
  const name = stringValue(payload.name);
  const triggerButtonLabel = stringValue(payload.triggerButtonLabel ?? payload.buttonLabel ?? payload.buttonName);
  const triggerType = normalizeTriggerType(payload.triggerType ?? payload.triggerMode, triggerButtonLabel);
  const triggerWords = splitTriggerWords(payload.triggerWords ?? payload.trigger);
  const notes = stringValue(payload.notes ?? payload.description);
  const messages = stepsFromValue(payload.messages ?? payload.steps);
  const active = activeFromPayload(payload);

  return {
    name,
    triggerType,
    triggerButtonLabel: triggerType === "click" ? (triggerButtonLabel || name) : "",
    triggerWords: triggerType === "click" ? [] : triggerWords,
    notes,
    messages,
    active,
  };
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
        triggerType: normalized.triggerType,
        triggerButtonLabel: normalized.triggerButtonLabel,
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
        triggerType: normalized.triggerType,
        triggerButtonLabel: normalized.triggerButtonLabel,
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
