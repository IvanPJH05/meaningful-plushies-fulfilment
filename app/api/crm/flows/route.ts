import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureCrmWritePolicies, isRlsPolicyError } from "@/src/modules/crm/write-policies";
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
  triggerEvent?: unknown;
  triggerCategory?: unknown;
  triggerRules?: unknown;
  category?: unknown;
  trigger?: unknown;
  triggerWords?: unknown;
  description?: unknown;
  groupName?: unknown;
  group?: unknown;
  subgroupName?: unknown;
  subgroup?: unknown;
  notes?: unknown;
  status?: unknown;
  active?: unknown;
  steps?: unknown;
  messages?: unknown;
};

const actionTypes = ["Send Message", "Send Media", "Send Image", "Send Video", "Ask Selection", "AI Reply", "Update Status", "Add Note"] as const;
const delayUnits = ["seconds", "minutes", "hours", "days"] as const;
const mediaTypes = ["image", "video", "pdf"] as const;

type TriggerType = "keywords" | "click" | "first_message" | "selection_button";
type TriggerEvent = "message_received" | "message_sent";
type TriggerRule = {
  id: string;
  event: TriggerEvent;
  category: string;
  phrase: string;
};

type FlowMediaItem = {
  type: typeof mediaTypes[number];
  url: string;
  caption?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
};

type SelectionOption = {
  id: string;
  label: string;
  followUpMessage: string;
  targetFlowId: string;
  targetFlowName: string;
  actions?: FlowStep[];
};

type FlowStep = {
  type: typeof actionTypes[number];
  delayValue: string;
  delayUnit: typeof delayUnits[number];
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: FlowMediaItem[];
  options?: SelectionOption[];
};

type FlowTriggerConfig = {
  groupName: string;
  subgroupName: string;
  triggerEvent: TriggerEvent;
  triggerCategory: string;
  triggerRules: TriggerRule[];
};

const flowMetaPattern = /\n?\n?<!--crm-flow-meta:([\s\S]*?)-->\s*$/;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function makeSelectionKey() {
  return `sel_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function uniqueFlowName(businessId: string, requestedName: string, excludeId?: string) {
  const baseName = requestedName.trim() || "Untitled workflow";
  const existingFlows = await prisma.whatsAppFlow.findMany({
    where: {
      businessId,
      name: { startsWith: baseName, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });
  const usedNames = new Set(existingFlows.map((flow) => flow.name.trim().toLowerCase()));
  if (!usedNames.has(baseName.toLowerCase())) return baseName;

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!usedNames.has(candidate.toLowerCase())) return candidate;
  }

  return `${baseName} ${Date.now()}`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function splitTriggerWords(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }
  return stringValue(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeActionType(value: unknown): FlowStep["type"] {
  const text = stringValue(value).toLowerCase();
  if (["send media", "media", "media group", "send media group"].includes(text)) return "Send Media";
  if (["selection", "ask selection", "choose option", "buttons"].includes(text)) return "Ask Selection";
  return actionTypes.find((type) => type.toLowerCase() === text) || "Send Message";
}

function normalizeDelayUnit(value: unknown): FlowStep["delayUnit"] {
  const text = stringValue(value).toLowerCase();
  return delayUnits.find((unit) => unit === text) || "minutes";
}

function normalizeTriggerType(value: unknown, label: string): TriggerType {
  const text = stringValue(value).toLowerCase();
  if (text.includes("first")) return "first_message";
  if (text.includes("selection") || text.includes("press")) return "selection_button";
  if (text.includes("click") || text.includes("button")) return "click";
  if (!text && label) return "click";
  return "keywords";
}

function normalizeTriggerEvent(value: unknown): TriggerEvent {
  const text = stringValue(value).toLowerCase();
  return text === "message_sent" || text === "message sent" || text === "sent" ? "message_sent" : "message_received";
}

function normalizeTriggerRules(value: unknown, fallbackWords: string[], fallbackEvent: TriggerEvent, fallbackCategory: string): TriggerRule[] {
  const rows = Array.isArray(value) ? value : [];
  const rules = rows.map((item, index) => {
    const record = recordValue(item);
    return {
      id: stringValue(record.id) || `phrase_${index + 1}`,
      event: normalizeTriggerEvent(record.event ?? record.triggerEvent),
      category: stringValue(record.category ?? record.triggerCategory),
      phrase: stringValue(record.phrase ?? record.text ?? record.value),
    };
  }).filter((rule) => rule.phrase);
  if (rules.length) return rules;
  return fallbackWords.map((phrase, index) => ({
    id: `phrase_${index + 1}`,
    event: fallbackEvent,
    category: fallbackCategory,
    phrase,
  }));
}

function normalizeSelectionOptions(value: unknown): SelectionOption[] {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return rows.map((item, index) => {
    const record = recordValue(item);
    const label = stringValue(record.label ?? record.title ?? record.text ?? record.name);
    const rawId = stringValue(record.id) || `option_${index + 1}`;
    const id = seen.has(rawId) ? makeSelectionKey() : rawId;
    seen.add(id);
    return {
      id,
      label,
      followUpMessage: stringValue(record.followUpMessage ?? record.message ?? record.body ?? record.reply),
      targetFlowId: stringValue(record.targetFlowId ?? record.flowId ?? record.nextFlowId),
      targetFlowName: stringValue(record.targetFlowName ?? record.flowName ?? record.nextFlowName),
      actions: stepsFromValue(record.actions ?? record.steps),
    };
  }).filter((option) => option.label).slice(0, 3);
}

function inferMediaTypeFromUrl(url: string): FlowMediaItem["type"] {
  const cleanUrl = decodeURIComponent(url.toLowerCase());
  if (cleanUrl.includes(".pdf") || cleanUrl.includes("application/pdf")) return "pdf";
  return cleanUrl.includes(".mp4") || cleanUrl.includes(".mov") || cleanUrl.includes(".webm") || cleanUrl.includes("video/") ? "video" : "image";
}

function normalizeMediaType(value: unknown, url: string, contentType?: unknown, fileName?: unknown): FlowMediaItem["type"] {
  const normalizedContentType = stringValue(contentType).toLowerCase();
  const normalizedFileName = stringValue(fileName).toLowerCase();
  if (normalizedContentType.includes("pdf") || normalizedFileName.endsWith(".pdf")) return "pdf";
  if (normalizedContentType.startsWith("video/")) return "video";
  if (normalizedContentType.startsWith("image/")) return "image";
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
      type: normalizeMediaType(record.type ?? record.mediaType, url, record.contentType ?? record.mimeType, record.fileName ?? record.filename ?? record.name),
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
    if (url) items.push({ type: normalizeMediaType(step.mediaType ?? step.type, url, step.contentType ?? step.mimeType, step.fileName ?? step.filename ?? step.name), url, ...(message ? { caption: message } : {}) });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const options = normalizeSelectionOptions(step.options ?? step.buttons ?? step.choices);
  const firstImage = mediaItems.find((item) => item.type === "image")?.url || "";
  const firstVideo = mediaItems.find((item) => item.type === "video")?.url || "";
  const mediaAction = type === "Send Image" || type === "Send Video" || type === "Send Media";

  if (mediaAction && !mediaItems.length) return null;
  if (type === "Ask Selection" && (!message || !options.length)) return null;
  if (!mediaAction && type !== "AI Reply" && !message) return null;

  return {
    type,
    delayValue: `${delay}`,
    delayUnit: normalizeDelayUnit(step.delayUnit ?? step.unit),
    message,
    ...(firstImage ? { imageUrl: firstImage } : {}),
    ...(firstVideo ? { videoUrl: firstVideo } : {}),
    ...(mediaItems.length ? { mediaItems } : {}),
    ...(options.length ? { options } : {}),
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

function normalizeTriggerConfig(value: unknown): FlowTriggerConfig {
  const record = recordValue(value);
  const triggerEvent = normalizeTriggerEvent(record.triggerEvent ?? record.event);
  const triggerCategory = stringValue(record.triggerCategory ?? record.category);
  return {
    groupName: stringValue(record.groupName ?? record.group ?? record.folder),
    subgroupName: stringValue(record.subgroupName ?? record.subgroup ?? record.subflow),
    triggerEvent,
    triggerCategory,
    triggerRules: normalizeTriggerRules(record.triggerRules ?? record.rules, [], triggerEvent, triggerCategory),
  };
}

function splitNotesAndTriggerConfig(notes: string | null | undefined) {
  const value = notes || "";
  const match = value.match(flowMetaPattern);
  if (!match) {
    return { notes: value, triggerConfig: normalizeTriggerConfig(null) };
  }
  try {
    return {
      notes: value.slice(0, match.index).trimEnd(),
      triggerConfig: normalizeTriggerConfig(JSON.parse(match[1] || "{}")),
    };
  } catch {
    return { notes: value.replace(flowMetaPattern, "").trimEnd(), triggerConfig: normalizeTriggerConfig(null) };
  }
}

function notesWithTriggerConfig(notes: string, triggerConfig: FlowTriggerConfig) {
  const cleanedNotes = splitNotesAndTriggerConfig(notes).notes;
  const hasMeta = Boolean(
    triggerConfig.groupName
    || triggerConfig.subgroupName
    || triggerConfig.triggerCategory
    || triggerConfig.triggerEvent !== "message_received"
    || triggerConfig.triggerRules.length
  );
  return hasMeta
    ? `${cleanedNotes}${cleanedNotes ? "\n\n" : ""}<!--crm-flow-meta:${JSON.stringify(triggerConfig)}-->`
    : cleanedNotes;
}

function flowResponse(flow: {
  id: string;
  name: string;
  triggerType: string | null;
  triggerButtonLabel: string | null;
  triggerWords: string[];
  triggerConfig?: unknown;
  notes: string | null;
  active: boolean;
  messages: unknown;
  updatedAt: Date;
}) {
  const triggerType = normalizeTriggerType(flow.triggerType, flow.triggerButtonLabel || "");
  const notesMeta = splitNotesAndTriggerConfig(flow.notes);
  const triggerConfig = normalizeTriggerConfig(flow.triggerConfig ?? notesMeta.triggerConfig);
  const triggerRules = triggerConfig.triggerRules.length
    ? triggerConfig.triggerRules
    : normalizeTriggerRules(null, flow.triggerWords, triggerConfig.triggerEvent, triggerConfig.triggerCategory);
  const messages = Array.isArray(flow.messages)
    ? flow.messages.map(normalizeFlowStep).filter((step): step is FlowStep => Boolean(step))
    : [];

  return {
    id: flow.id,
    name: flow.name,
    triggerType,
    triggerButtonLabel: flow.triggerButtonLabel || "",
    trigger: flow.triggerWords.join(", "),
    groupName: triggerConfig.groupName,
    subgroupName: triggerConfig.subgroupName,
    triggerEvent: triggerConfig.triggerEvent,
    triggerCategory: triggerConfig.triggerCategory,
    triggerRules,
    description: notesMeta.notes,
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
  const groupName = stringValue(payload.groupName ?? payload.group);
  const subgroupName = stringValue(payload.subgroupName ?? payload.subgroup);
  const triggerEvent = normalizeTriggerEvent(payload.triggerEvent);
  const triggerCategory = stringValue(payload.triggerCategory ?? payload.category);
  const triggerRules = normalizeTriggerRules(payload.triggerRules, triggerWords, triggerEvent, triggerCategory);
  const messages = stepsFromValue(payload.messages ?? payload.steps);
  const active = activeFromPayload(payload);

  return {
    name,
    triggerType,
    triggerButtonLabel: triggerType === "selection_button"
      ? (triggerButtonLabel || makeSelectionKey())
      : triggerType === "click" ? (triggerButtonLabel || name) : "",
    triggerWords: triggerType === "keywords" ? (triggerRules.length ? triggerRules.map((rule) => rule.phrase) : triggerWords) : [],
    triggerConfig: { groupName, subgroupName, triggerEvent, triggerCategory, triggerRules },
    notes: notesWithTriggerConfig(notes, { groupName, subgroupName, triggerEvent, triggerCategory, triggerRules }),
    messages,
    active,
  };
}

async function activeSelectionKeyConflict(args: {
  businessId: string;
  key: string;
  excludeId?: string;
}) {
  const key = args.key.trim();
  if (!key) return null;
  return prisma.whatsAppFlow.findFirst({
    where: {
      businessId: args.businessId,
      active: true,
      triggerType: "selection_button",
      triggerButtonLabel: { equals: key, mode: "insensitive" },
      ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
}

export async function GET() {
  try {
    await ensureCrmWritePolicies();
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
    await ensureCrmWritePolicies();
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as FlowPayload;
    const normalized = normalizePayload(payload);

    if (!normalized.name || (normalized.active && !normalized.messages.length)) {
      return json(400, { ok: false, error: normalized.active ? "Publish needs at least one action." : "Flow name is required." });
    }
    if (normalized.active && normalized.triggerType === "selection_button") {
      const conflict = await activeSelectionKeyConflict({
        businessId: business.id,
        key: normalized.triggerButtonLabel,
      });
      if (conflict) {
        return json(409, { ok: false, error: `Selection key "${normalized.triggerButtonLabel}" is already active on "${conflict.name}". Generate a new key before saving.` });
      }
    }

    const name = await uniqueFlowName(business.id, normalized.name);
    const flow = await prisma.whatsAppFlow.create({
      data: {
        businessId: business.id,
        name,
        triggerType: normalized.triggerType,
        triggerButtonLabel: normalized.triggerButtonLabel,
        triggerWords: normalized.triggerWords,
        notes: normalized.notes,
        messages: normalized.messages,
        active: normalized.active,
      },
    });
    return json(201, { ok: true, flow: flowResponse({ ...flow, triggerConfig: normalized.triggerConfig }) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: isRlsPolicyError(error)
        ? "WhatsApp flow could not be saved because Supabase is blocking CRM flow writes. Run the latest schema setup or check the crm_whatsapp_flows RLS policies."
        : error instanceof Error ? error.message : "WhatsApp flow could not be saved.",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCrmWritePolicies();
    const business = await ensureDefaultBusiness();
    const payload = (await request.json().catch(() => ({}))) as FlowPayload;
    const id = stringValue(payload.id);
    const normalized = normalizePayload(payload);

    if (!id) return json(400, { ok: false, error: "Flow ID is required." });
    if (!normalized.name || (normalized.active && !normalized.messages.length)) {
      return json(400, { ok: false, error: normalized.active ? "Publish needs at least one action." : "Flow name is required." });
    }

    const existingFlow = await prisma.whatsAppFlow.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });

    if (!existingFlow) return json(404, { ok: false, error: "Flow could not be found." });
    if (normalized.active && normalized.triggerType === "selection_button") {
      const conflict = await activeSelectionKeyConflict({
        businessId: business.id,
        key: normalized.triggerButtonLabel,
        excludeId: existingFlow.id,
      });
      if (conflict) {
        return json(409, { ok: false, error: `Selection key "${normalized.triggerButtonLabel}" is already active on "${conflict.name}". Generate a new key before saving.` });
      }
    }

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
    return json(200, { ok: true, flow: flowResponse({ ...flow, triggerConfig: normalized.triggerConfig }) });
  } catch (error) {
    return json(500, {
      ok: false,
      error: isRlsPolicyError(error)
        ? "WhatsApp flow could not be updated because Supabase is blocking CRM flow writes. Run the latest schema setup or check the crm_whatsapp_flows RLS policies."
        : error instanceof Error ? error.message : "WhatsApp flow could not be updated.",
    });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCrmWritePolicies();
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
      error: isRlsPolicyError(error)
        ? "WhatsApp flow could not be deleted because Supabase is blocking CRM flow writes. Run the latest schema setup or check the crm_whatsapp_flows RLS policies."
        : error instanceof Error ? error.message : "WhatsApp flow could not be deleted.",
    });
  }
}
