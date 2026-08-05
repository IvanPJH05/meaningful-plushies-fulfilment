"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

import styles from "./whatsapp-flows.module.css";

type WhatsAppFlow = {
  id: string;
  name: string;
  triggerType?: TriggerType;
  triggerButtonLabel?: string;
  triggerEvent?: TriggerEvent;
  triggerCategory?: string;
  triggerRules?: TriggerRule[];
  trigger: string;
  groupName?: string;
  subgroupName?: string;
  description: string;
  status: "Draft" | "Active";
  steps: FlowStep[];
  updatedAt: string;
};

type TriggerType = "keywords" | "click" | "first_message" | "selection_button";
type TriggerEvent = "message_received" | "message_sent";
type TriggerRule = {
  id?: string;
  event: TriggerEvent;
  phrase: string;
};
type MediaType = "image" | "video" | "pdf";
type ActionType = "Send Message" | "Send Media" | "Ask Selection" | "AI Reply" | "Update Status" | "Add Note" | "Create Manual Order Link";
type ActionSelectValue = ActionType | "Ask Selection (2)" | "Ask Selection (3)";
type StoredActionType = ActionType | "Send Image" | "Send Video";
type DelayUnit = "seconds" | "minutes" | "hours" | "days";

type SelectionOption = {
  id?: string;
  label: string;
  followUpMessage: string;
  targetFlowId?: string;
  targetFlowName?: string;
  actions?: FlowAction[];
};

type FlowMediaItem = {
  id?: string;
  type: MediaType;
  url: string;
  caption?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
};

type FlowStep = {
  type: StoredActionType;
  delayValue: string;
  delayUnit: DelayUnit;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: FlowMediaItem[];
  options?: Array<{
    id?: string;
    label: string;
    followUpMessage: string;
    targetFlowId?: string;
    targetFlowName?: string;
    actions?: FlowStep[];
  }>;
};

type FlowAction = {
  id: string;
  type: ActionType;
  delayValue: string;
  delayUnit: DelayUnit;
  message: string;
  mediaItems: FlowMediaItem[];
  options: SelectionOption[];
};

type FlowForm = {
  name: string;
  triggerType: TriggerType;
  triggerButtonLabel: string;
  triggerEvent: TriggerEvent;
  triggerCategory: string;
  triggerRules: TriggerRule[];
  trigger: string;
  groupName: string;
  subgroupName: string;
  description: string;
  status: "Draft" | "Active";
  actions: FlowAction[];
};

const actionTypes: ActionType[] = ["Send Message", "Send Media", "Ask Selection", "AI Reply", "Update Status", "Add Note", "Create Manual Order Link"];
const customerStatuses = ["Cold", "Warm", "Unpaid", "Paid"] as const;
const actionSelectOptions: { label: string; value: ActionSelectValue }[] = [
  { label: "Send Message", value: "Send Message" },
  { label: "Send Media", value: "Send Media" },
  { label: "Ask Selection (2)", value: "Ask Selection (2)" },
  { label: "Ask Selection (3)", value: "Ask Selection (3)" },
  { label: "AI Reply", value: "AI Reply" },
  { label: "Update Status", value: "Update Status" },
  { label: "Add Note", value: "Add Note" },
  { label: "Create Manual Order Link", value: "Create Manual Order Link" },
];
const manualOrderCharacters = ["Billy", "Tootsie", "Hunnie", "Dragon Warrior"] as const;
const manualOrderSpeakers = ["5", "10", "20"] as const;

function manualOrderSettings(value: string) {
  const [character = "Billy", speaker = "5"] = value.split("|");
  return {
    character: manualOrderCharacters.includes(character as typeof manualOrderCharacters[number]) ? character : "Billy",
    speaker: manualOrderSpeakers.includes(speaker as typeof manualOrderSpeakers[number]) ? speaker : "5",
  };
}

function manualOrderSettingsValue(character: string, speaker: string) {
  return `${character}|${speaker}`;
}
const FLOW_BUILDER_CACHE_KEY = "crm-whatsapp-flow-builder-cache-v1";
const MAX_BROWSER_IMAGE_BYTES = 3.8 * 1024 * 1024;
const MAX_WHATSAPP_VIDEO_BYTES = 16 * 1024 * 1024;
const MAX_WHATSAPP_DOCUMENT_BYTES = 100 * 1024 * 1024;
const MAX_FLOW_IMAGE_EDGE = 1800;
const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const JOURNEY_STAGES = ["Start", "Intro", "Product choices", "Speaker", "Shipping", "Order summary", "Follow-up"];

type FlowBuilderCache = {
  flows: WhatsAppFlow[];
  form: FlowForm;
  editingId: string;
  savedAt: number;
};

type SelectionFlowLink = {
  targetFlowId: string;
  sourceFlowId: string;
  sourceFlowName: string;
  optionLabel: string;
  optionKey: string;
};

type FlowGroup = {
  name: string;
  flows: WhatsAppFlow[];
  subgroups: FlowSubfolder[];
};

type FlowSubfolder = {
  name: string;
  path: string;
  flows: WhatsAppFlow[];
  subgroups: FlowSubfolder[];
};

type FlowFolder = {
  name: string;
  subfolders: string[];
};

type LibraryView = "chart" | "list";
type FlowScreenMode = "library" | "builder";
type FlowBranch = {
  label: string;
  destinationId: string;
  destinationName: string;
  status: "linked" | "unlinked" | "missing";
};
type FlowAnalysis = {
  displayName: string;
  suggestedName: string;
  language: "EN" | "MS" | "Any";
  stage: string;
  purpose: string;
  variant: string;
  triggerSummary: string;
  breadcrumb: string;
  actionsSummary: string;
  branches: FlowBranch[];
  counterpartId: string;
  flags: string[];
};
type PendingSelectionRemoval = {
  actionId: string;
  options: SelectionOption[];
};

let flowBuilderMemoryCache: FlowBuilderCache | null = null;
const FLOW_FOLDER_STORAGE_KEY = "crm-whatsapp-flow-folders-v1";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeSelectionKey() {
  const randomValue = typeof crypto !== "undefined" && "getRandomValues" in crypto
    ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    : Math.random().toString(36).slice(2);
  return `sel_${Date.now().toString(36)}_${randomValue.slice(0, 6)}`;
}

function isSelectionKey(value?: string) {
  return Boolean((value || "").trim().match(/^sel_[a-z0-9]+_[a-z0-9]+$/i));
}

function flowGroupName(flow: Pick<WhatsAppFlow, "groupName">) {
  return (flow.groupName || "").trim() || "Ungrouped";
}

function flowSubgroupName(flow: Pick<WhatsAppFlow, "subgroupName">) {
  return (flow.subgroupName || "").trim();
}

function folderPathParts(path: string) {
  return path.split("/").map((part) => part.trim()).filter(Boolean);
}

function childFolderPath(parentPath: string, name: string) {
  return [...folderPathParts(parentPath), name.trim()].filter(Boolean).join("/");
}

function makeMediaItem(media?: Partial<FlowMediaItem>): FlowMediaItem {
  return {
    id: makeId(),
    type: media?.type === "video" ? "video" : media?.type === "pdf" ? "pdf" : "image",
    url: media?.url || "",
    caption: media?.caption || "",
    fileName: media?.fileName || "",
    contentType: media?.contentType || "",
    sizeBytes: media?.sizeBytes,
  };
}

function makeSelectionOption(option?: Partial<SelectionOption>): SelectionOption {
  return {
    id: isSelectionKey(option?.id) ? option?.id : makeSelectionKey(),
    label: option?.label || "",
    followUpMessage: option?.followUpMessage || "",
    targetFlowId: option?.targetFlowId || "",
    targetFlowName: option?.targetFlowName || "",
    actions: Array.isArray(option?.actions) ? option.actions.map((action) => makeAction(action)) : [],
  };
}

function triggerPhrasesFromText(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

function normaliseTriggerEvent(value?: string): TriggerEvent {
  const normalised = (value || "").trim().toLowerCase();
  return normalised === "message_sent" || normalised === "sent" || normalised === "message sent"
    ? "message_sent"
    : "message_received";
}

function makeTriggerRule(rule?: Partial<TriggerRule>): TriggerRule {
  return {
    id: rule?.id || makeId(),
    event: normaliseTriggerEvent(rule?.event),
    phrase: rule?.phrase || "",
  };
}

function triggerRulesFromLegacy(trigger: string, triggerEvent: TriggerEvent) {
  return triggerPhrasesFromText(trigger).map((phrase) => makeTriggerRule({
    event: triggerEvent,
    phrase,
  }));
}

function usableTriggerRules(form: Pick<FlowForm, "trigger" | "triggerEvent" | "triggerCategory" | "triggerRules">) {
  const rules = form.triggerRules.length
    ? form.triggerRules
    : triggerRulesFromLegacy(form.trigger, form.triggerEvent);
  return rules.map(makeTriggerRule).filter((rule) => rule.phrase.trim());
}

function makeUniqueSelectionOptions(options: Partial<SelectionOption>[]) {
  const seen = new Set<string>();
  return options.map((option) => {
    const next = makeSelectionOption(option);
    const id = next.id || makeSelectionKey();
    if (seen.has(id)) {
      next.id = makeSelectionKey();
    } else {
      next.id = id;
    }
    seen.add(next.id || "");
    return next;
  });
}

function selectionOptionsForCount(options: SelectionOption[], count: 2 | 3) {
  const defaultLabels = ["English", "Malay", "Option 3"];
  return Array.from({ length: count }, (_, index) => makeSelectionOption({
    ...(options[index] || {}),
    label: options[index]?.label || defaultLabels[index],
  }));
}

function actionSelectValue(action: Pick<FlowAction, "type" | "options">): ActionSelectValue {
  if (action.type === "Ask Selection") return action.options.length >= 3 ? "Ask Selection (3)" : "Ask Selection (2)";
  return action.type;
}

function actionPatchFromSelect(action: FlowAction, value: ActionSelectValue): Partial<FlowAction> {
  if (value === "Ask Selection (2)" || value === "Ask Selection (3)") {
    return {
      type: "Ask Selection",
      message: action.message || "Which option would you like?",
      options: selectionOptionsForCount(action.options, value === "Ask Selection (3)" ? 3 : 2),
    };
  }

  return {
    type: value,
    message: value === "Create Manual Order Link" ? (action.message || "Billy|5") : action.message,
    mediaItems: value === "Send Media" && !action.mediaItems.length ? [makeMediaItem()] : action.mediaItems,
    options: action.options,
  };
}

function makeAction(action?: Partial<FlowAction>): FlowAction {
  const type = action?.type || "Send Message";
  return {
    id: makeId(),
    type,
    delayValue: delayValueInSeconds(action?.delayValue, action?.delayUnit),
    delayUnit: "seconds",
    message: action?.message || (type === "Ask Selection" ? "Which option would you like?" : type === "Create Manual Order Link" ? "Billy|5" : ""),
    mediaItems: action?.mediaItems?.length ? action.mediaItems.map(makeMediaItem) : (type === "Send Media" ? [makeMediaItem()] : []),
    options: action?.options?.length
      ? makeUniqueSelectionOptions(action.options.slice(0, 3))
      : (type === "Ask Selection" ? [
        makeSelectionOption({ label: "English" }),
        makeSelectionOption({ label: "Malay" }),
      ] : []),
  };
}

function emptyFlowForm(): FlowForm {
  return {
    name: "",
    triggerType: "click",
    triggerButtonLabel: "",
    triggerEvent: "message_received",
    triggerCategory: "",
    triggerRules: [],
    trigger: "",
    groupName: "",
    subgroupName: "",
    description: "",
    status: "Draft",
    actions: [makeAction()],
  };
}

function formWithTriggerType(form: FlowForm, triggerType: TriggerType): FlowForm {
  if (triggerType === "selection_button") {
    return {
      ...form,
      triggerType,
      triggerButtonLabel: isSelectionKey(form.triggerButtonLabel) ? form.triggerButtonLabel : makeSelectionKey(),
      triggerEvent: "message_received",
      trigger: "",
    };
  }
  if (triggerType === "click") {
    return { ...form, triggerType, triggerEvent: "message_received", trigger: "" };
  }
  if (triggerType === "keywords") {
    return { ...form, triggerType, triggerButtonLabel: "", triggerEvent: form.triggerEvent || "message_received" };
  }
  return { ...form, triggerType, triggerButtonLabel: "", triggerEvent: "message_received", trigger: "" };
}

function normalizeFlowForm(value: unknown): FlowForm | null {
  const form = value as Partial<FlowForm> | null;
  if (!form || typeof form !== "object") return null;

  const triggerType = normaliseTriggerType(form.triggerType, "click");
  const status = form.status === "Active" ? "Active" : "Draft";
  const actions = Array.isArray(form.actions)
    ? form.actions.map((action) => makeAction(action as Partial<FlowAction>)).filter(Boolean)
    : [];

  return {
    name: typeof form.name === "string" ? form.name : "",
    triggerType,
    triggerButtonLabel: typeof form.triggerButtonLabel === "string" ? form.triggerButtonLabel : "",
    triggerEvent: normaliseTriggerEvent(form.triggerEvent),
    triggerCategory: typeof form.triggerCategory === "string" ? form.triggerCategory : "",
    triggerRules: Array.isArray(form.triggerRules) ? form.triggerRules.map((rule) => makeTriggerRule(rule as Partial<TriggerRule>)) : [],
    trigger: typeof form.trigger === "string" ? form.trigger : "",
    groupName: typeof form.groupName === "string" ? form.groupName : "",
    subgroupName: typeof form.subgroupName === "string" ? form.subgroupName : "",
    description: typeof form.description === "string" ? form.description : "",
    status,
    actions: actions.length ? actions : [makeAction()],
  };
}

function normalizeFlowBuilderCache(value: unknown): FlowBuilderCache | null {
  const cache = value as Partial<FlowBuilderCache> | null;
  if (!cache || typeof cache !== "object") return null;
  const form = normalizeFlowForm(cache.form);
  if (!form || !Array.isArray(cache.flows)) return null;

  return {
    flows: cache.flows.filter((flow): flow is WhatsAppFlow => Boolean(flow?.id && flow?.name && Array.isArray(flow?.steps))),
    form,
    editingId: typeof cache.editingId === "string" ? cache.editingId : "",
    savedAt: typeof cache.savedAt === "number" ? cache.savedAt : Date.now(),
  };
}

function readFlowBuilderCache() {
  if (flowBuilderMemoryCache) return flowBuilderMemoryCache;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(FLOW_BUILDER_CACHE_KEY);
    const cache = raw ? normalizeFlowBuilderCache(JSON.parse(raw)) : null;
    flowBuilderMemoryCache = cache;
    return cache;
  } catch {
    return null;
  }
}

function writeFlowBuilderCache(cache: FlowBuilderCache) {
  flowBuilderMemoryCache = cache;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLOW_BUILDER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The in-memory cache still keeps the current tab fast if storage is full.
  }
}

function normalizeFlowFolders(value: unknown): FlowFolder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((folder) => {
      const record = folder && typeof folder === "object" && !Array.isArray(folder) ? folder as Partial<FlowFolder> : {};
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const subfolders = Array.isArray(record.subfolders)
        ? Array.from(new Set(record.subfolders.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)))
        : [];
      return { name, subfolders };
    })
    .filter((folder) => {
      if (!folder.name || seen.has(folder.name.toLowerCase())) return false;
      seen.add(folder.name.toLowerCase());
      return true;
    });
}

function readFlowFolders() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FLOW_FOLDER_STORAGE_KEY);
    return normalizeFlowFolders(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function writeFlowFolders(folders: FlowFolder[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLOW_FOLDER_STORAGE_KEY, JSON.stringify(folders));
  } catch {
    // Folder creation is still reflected in memory even if local storage is full.
  }
}

const starterTemplates: FlowForm[] = [
  {
    name: "New customer details",
    triggerType: "click",
    triggerButtonLabel: "Ask details",
    triggerEvent: "message_received",
    triggerCategory: "",
    triggerRules: [],
    trigger: "interested, price, details",
    groupName: "",
    subgroupName: "",
    description: "Ask for plushie details after a customer shows interest.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: [
          "Hi! Can I get the plushie details?",
          "Name:",
          "Gender:",
          "Birth date:",
          "Birth place:",
          "Favourite person:",
          "Belongs to:",
          "Meaningful note:",
        ].join("\n"),
      }),
      makeAction({
        delayValue: "20",
        delayUnit: "minutes",
        message: "Just checking in. Once you send the details, I can prepare the next step for your plushie.",
      }),
    ],
  },
  {
    name: "Payment received",
    triggerType: "click",
    triggerButtonLabel: "Payment received",
    triggerEvent: "message_received",
    triggerCategory: "",
    triggerRules: [],
    trigger: "paid, payment done, transfer",
    groupName: "",
    subgroupName: "",
    description: "Confirm payment and tell the customer the Shopify details link is coming.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: "Payment received, thank you! I will send the Shopify link for you to fill in the plushie details.",
      }),
    ],
  },
  {
    name: "Checking order",
    triggerType: "click",
    triggerButtonLabel: "Checking order",
    triggerEvent: "message_received",
    triggerCategory: "",
    triggerRules: [],
    trigger: "tracking, order, update",
    groupName: "",
    subgroupName: "",
    description: "Use this when you need time to check an order.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: "I am checking this for you now. I will update you here once I have confirmed it.",
      }),
      makeAction({
        delayValue: "30",
        delayUnit: "minutes",
        message: "If there is no update yet, remind the team to check this order manually.",
        type: "Add Note",
      }),
    ],
  },
];

function normaliseTriggerType(value?: string, fallback: TriggerType = "click"): TriggerType {
  const normalised = (value || "").trim().toLowerCase();
  if (normalised === "click" || normalised === "button") return "click";
  if (normalised === "first_message" || normalised === "first message" || normalised === "first-message") return "first_message";
  if (normalised === "selection_button" || normalised === "selection button" || normalised === "button press") return "selection_button";
  if (normalised === "keywords" || normalised === "words") return "keywords";
  return fallback;
}

function normaliseActionType(value: string): ActionType {
  const normalised = value.trim().toLowerCase();
  if (normalised === "send image" || normalised === "send video") return "Send Media";
  if (normalised === "selection" || normalised === "ask selection" || normalised === "choose option") return "Ask Selection";
  return actionTypes.find((type) => type.toLowerCase() === normalised) || "Send Message";
}

function normaliseDelayUnit(value: string): DelayUnit {
  return (["seconds", "minutes", "hours", "days"] as DelayUnit[]).find((unit) => unit === value.toLowerCase()) || "seconds";
}

function delayValueInSeconds(value?: string, unit?: DelayUnit) {
  const amount = Math.max(0, Number(value) || 0);
  const multiplier: Record<DelayUnit, number> = {
    seconds: 1,
    minutes: 60,
    hours: 60 * 60,
    days: 24 * 60 * 60,
  };
  return `${amount * multiplier[unit || "seconds"]}`;
}

function mediaItemsFromStep(step: FlowStep): FlowMediaItem[] {
  const items = Array.isArray(step.mediaItems) ? step.mediaItems : [];
  const seen = new Set<string>();
  const mediaItems = items
    .map((item) => makeMediaItem({
      type: mediaTypeFromSavedItem(item),
      url: item.url || "",
      caption: item.caption || "",
      fileName: item.fileName || "",
      contentType: item.contentType || "",
      sizeBytes: item.sizeBytes,
    }))
    .filter((item) => {
      const key = `${item.type}:${item.url.trim()}`;
      if (!item.url.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (mediaItems.length) return mediaItems;
  if (step.imageUrl) return [makeMediaItem({ type: "image", url: step.imageUrl, caption: step.message || "" })];
  if (step.videoUrl) return [makeMediaItem({ type: "video", url: step.videoUrl, caption: step.message || "" })];
  return [];
}

function mediaTypeFromSavedItem(item: Partial<FlowMediaItem>): MediaType {
  const contentType = (item.contentType || "").toLowerCase();
  const fileName = (item.fileName || "").toLowerCase();
  const url = decodeURIComponent((item.url || "").toLowerCase());
  if (item.type === "pdf" || contentType.includes("pdf") || fileName.endsWith(".pdf") || url.includes(".pdf") || url.includes("application/pdf")) return "pdf";
  if (item.type === "video" || contentType.startsWith("video/")) return "video";
  return "image";
}

function actionFromStep(step: FlowStep | string): FlowAction {
  if (typeof step !== "string") {
    const type = normaliseActionType(step.type);
    return makeAction({
      type,
      delayValue: step.delayValue ?? "0",
      delayUnit: normaliseDelayUnit(step.delayUnit),
      message: step.message || "",
      mediaItems: type === "Send Media" ? mediaItemsFromStep(step) : [],
      options: type === "Ask Selection" && Array.isArray(step.options)
        ? step.options.map((option) => makeSelectionOption({
          ...option,
          actions: Array.isArray(option.actions) ? option.actions.map(actionFromStep) : [],
        }))
        : [],
    });
  }

  const trimmed = step.trim();
  const delayedMatch = trimmed.match(/^Wait\s+(\d+)\s+(seconds|minutes|hours|days),\s+then\s+([^:]+):\s*([\s\S]*)$/i);
  const immediateMatch = trimmed.match(/^Immediately,\s+then\s+([^:]+):\s*([\s\S]*)$/i);

  if (delayedMatch) {
    return makeAction({
      delayValue: delayedMatch[1],
      delayUnit: normaliseDelayUnit(delayedMatch[2]),
      type: normaliseActionType(delayedMatch[3]),
      message: delayedMatch[4].trim(),
    });
  }

  if (immediateMatch) {
    return makeAction({
      delayValue: "0",
      delayUnit: "minutes",
      type: normaliseActionType(immediateMatch[1]),
      message: immediateMatch[2].trim(),
    });
  }

  return makeAction({ message: trimmed });
}

function formFromFlow(flow: WhatsAppFlow): FlowForm {
  return {
    name: flow.name,
    triggerType: normaliseTriggerType(flow.triggerType, "click"),
    triggerButtonLabel: flow.triggerButtonLabel || "",
    triggerEvent: normaliseTriggerEvent(flow.triggerEvent),
    triggerCategory: flow.triggerCategory || "",
    triggerRules: Array.isArray(flow.triggerRules) && flow.triggerRules.length
      ? flow.triggerRules.map(makeTriggerRule)
      : triggerRulesFromLegacy(flow.trigger, normaliseTriggerEvent(flow.triggerEvent)),
    trigger: flow.trigger,
    groupName: flow.groupName || "",
    subgroupName: flow.subgroupName || "",
    description: flow.description,
    status: flow.status,
    actions: flow.steps.length ? flow.steps.map(actionFromStep) : [makeAction()],
  };
}

function formatActionStep(action: FlowAction): FlowStep | null {
  const message = action.message.trim();
  const seenMedia = new Set<string>();
  const mediaItems: FlowMediaItem[] = action.mediaItems
    .map((item) => ({
      type: item.type,
      url: item.url.trim(),
      caption: (item.caption || "").trim(),
      fileName: (item.fileName || "").trim(),
      contentType: (item.contentType || "").trim(),
      sizeBytes: item.sizeBytes,
    }))
    .filter((item) => {
      const key = `${item.type}:${item.url}`;
      if (!item.url || seenMedia.has(key)) return false;
      seenMedia.add(key);
      return true;
    });

  const options = action.options
    .map((option) => ({
      id: option.id || makeId(),
      label: option.label.trim(),
      followUpMessage: option.followUpMessage.trim(),
      targetFlowId: (option.targetFlowId || "").trim(),
      targetFlowName: (option.targetFlowName || "").trim(),
      actions: (option.actions || []).map(formatActionStep).filter((step): step is FlowStep => Boolean(step)),
    }))
    .filter((option) => option.label)
    .slice(0, 3);

  if (action.type === "Ask Selection" && (!message || !options.length)) return null;
  if (action.type === "Send Media" && !mediaItems.length) return null;
  if (action.type !== "Send Media" && action.type !== "AI Reply" && action.type !== "Create Manual Order Link" && !message) return null;
  return {
    type: action.type,
    delayValue: `${Math.max(0, Number(action.delayValue) || 0)}`,
    delayUnit: action.delayUnit,
    message,
    ...(mediaItems.length ? { mediaItems } : {}),
    ...(options.length ? { options } : {}),
  };
}

function flowPayloadFromForm(form: FlowForm, id?: string) {
  const triggerRules = usableTriggerRules(form);
  return {
    id,
    name: form.name.trim(),
    triggerType: form.triggerType,
    triggerButtonLabel: form.triggerButtonLabel.trim(),
    triggerEvent: triggerRules[0]?.event || form.triggerEvent,
    triggerCategory: "",
    triggerRules: triggerRules.map((rule) => ({
      id: rule.id,
      event: rule.event,
      category: "",
      phrase: rule.phrase.trim(),
    })),
    trigger: triggerRules.length ? triggerRules.map((rule) => rule.phrase.trim()).join("\n") : form.trigger.trim(),
    groupName: form.groupName.trim(),
    subgroupName: form.subgroupName.trim(),
    description: form.description.trim(),
    status: form.status,
    steps: form.actions.map(formatActionStep).filter((step): step is FlowStep => Boolean(step)),
  };
}

function cloneTemplate(template: FlowForm): FlowForm {
  return {
    ...template,
    actions: template.actions.map((action) => makeAction(action)),
  };
}

function duplicateFormWithFreshKeys(flow: WhatsAppFlow, overrides: Partial<Pick<FlowForm, "name" | "groupName" | "subgroupName">> = {}): FlowForm {
  const source = formFromFlow(flow);
  return {
    ...source,
    name: overrides.name ?? `${flow.name} Copy`,
    groupName: overrides.groupName ?? source.groupName,
    subgroupName: overrides.subgroupName ?? source.subgroupName,
    status: source.status,
    triggerButtonLabel: source.triggerType === "selection_button" ? makeSelectionKey() : source.triggerButtonLabel,
    actions: source.actions.map((action) => ({
      ...makeAction(action),
      options: action.options.map((option) => ({
        ...makeSelectionOption(option),
        id: makeSelectionKey(),
      })),
    })),
  };
}

function uniqueCopyName(name: string, usedNames: Set<string>) {
  const baseName = `${name} Copy`;
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate.trim().toLowerCase())) {
    candidate = `${baseName} ${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate.trim().toLowerCase());
  return candidate;
}

function flattenSubfolderPaths(subfolders: FlowSubfolder[]): string[] {
  return subfolders.flatMap((subfolder) => [
    subfolder.path,
    ...flattenSubfolderPaths(subfolder.subgroups),
  ]);
}

function subfolderTreeFromMap(subgroupMap: Map<string, WhatsAppFlow[]>): FlowSubfolder[] {
  const roots: FlowSubfolder[] = [];
  const nodeMap = new Map<string, FlowSubfolder>();
  const paths = Array.from(subgroupMap.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b));

  for (const path of paths) {
    const parts = folderPathParts(path);
    let currentPath = "";
    let siblings = roots;
    for (const part of parts) {
      currentPath = childFolderPath(currentPath, part);
      let node = nodeMap.get(currentPath);
      if (!node) {
        node = { name: part, path: currentPath, flows: [], subgroups: [] };
        nodeMap.set(currentPath, node);
        siblings.push(node);
      }
      siblings = node.subgroups;
    }
  }

  for (const [path, subgroupFlows] of subgroupMap.entries()) {
    if (!path) continue;
    const node = nodeMap.get(path);
    if (node) node.flows = subgroupFlows;
  }

  return roots;
}

function groupedFlowLibrary(flows: WhatsAppFlow[], folders: FlowFolder[]): FlowGroup[] {
  const groupMap = new Map<string, Map<string, WhatsAppFlow[]>>();
  for (const folder of folders) {
    const groupName = folder.name.trim();
    if (!groupName) continue;
    if (!groupMap.has(groupName)) groupMap.set(groupName, new Map());
    const subgroupMap = groupMap.get(groupName);
    if (!subgroupMap) continue;
    if (!subgroupMap.has("")) subgroupMap.set("", []);
    for (const subfolder of folder.subfolders) {
      const subgroupName = subfolder.trim();
      if (subgroupName && !subgroupMap.has(subgroupName)) subgroupMap.set(subgroupName, []);
    }
  }

  for (const flow of flows) {
    const groupName = flowGroupName(flow);
    const subgroupName = flowSubgroupName(flow);
    if (!groupMap.has(groupName)) groupMap.set(groupName, new Map());
    const subgroupMap = groupMap.get(groupName);
    if (!subgroupMap) continue;
    if (!subgroupMap.has(subgroupName)) subgroupMap.set(subgroupName, []);
    subgroupMap.get(subgroupName)?.push(flow);
  }

  return Array.from(groupMap.entries()).map(([name, subgroupMap]) => {
    const directFlows = subgroupMap.get("") || [];
    const subgroups = subfolderTreeFromMap(subgroupMap);
    return { name, flows: directFlows, subgroups };
  });
}

function selectionLinksFromFlow(flow: Pick<WhatsAppFlow, "id" | "name" | "steps">): SelectionFlowLink[] {
  return flow.steps.flatMap((step) => {
    const action = actionFromStep(step);
    if (action.type !== "Ask Selection") return [];
    return action.options
      .filter((option) => option.targetFlowId)
      .map((option) => ({
        targetFlowId: option.targetFlowId || "",
        sourceFlowId: flow.id,
        sourceFlowName: flow.name,
        optionLabel: option.label || "Selection option",
        optionKey: option.id || "",
      }));
  });
}

function selectionLinksFromDraft(form: FlowForm, editingId: string): SelectionFlowLink[] {
  if (!editingId) return [];
  return form.actions.flatMap((action) => {
    if (action.type !== "Ask Selection") return [];
    return action.options
      .filter((option) => option.targetFlowId)
      .map((option) => ({
        targetFlowId: option.targetFlowId || "",
        sourceFlowId: editingId,
        sourceFlowName: form.name || "Unsaved flow",
        optionLabel: option.label || "Selection option",
        optionKey: option.id || "",
      }));
  });
}

function selectionPairingIssue(option: SelectionOption, flows: WhatsAppFlow[]) {
  if (!option.targetFlowId) return "";
  const targetFlow = flows.find((flow) => flow.id === option.targetFlowId);
  if (!targetFlow) return "Target flow could not be found.";
  if (targetFlow.status !== "Active") return "Target flow is not active yet.";
  return "";
}

function cleanCopySuffix(value: string) {
  return value.replace(/\s+copy(?:\s+\d+)?$/i, "").trim();
}

function titleCaseLabel(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detectLanguage(flow: WhatsAppFlow): FlowAnalysis["language"] {
  const haystack = `${flow.name} ${flow.groupName || ""} ${flow.subgroupName || ""}`.toLowerCase();
  if (/\b(ms|bm|malay|melayu)\b/.test(haystack)) return "MS";
  if (/\b(en|eng|english)\b/.test(haystack)) return "EN";
  return "Any";
}

function detectStage(flow: WhatsAppFlow) {
  const text = `${flow.name} ${flow.groupName || ""} ${flow.subgroupName || ""} ${flow.description || ""}`.toLowerCase();
  const hasSelection = flow.steps.some((step) => normaliseActionType(step.type) === "Ask Selection");
  if (flow.name.toLowerCase().includes("language selection")) return { stage: "Start", purpose: "Language selection" };
  if (text.includes("intro") || text.includes("welcome")) return { stage: "Intro", purpose: "Welcome" };
  if (text.includes("shipping")) return { stage: "Shipping", purpose: "Choose quantity" };
  if (text.includes("order summary")) return { stage: "Order summary", purpose: "Summary" };
  if (text.includes("speaker")) return { stage: "Speaker", purpose: "Choose speaker" };
  if (text.includes("plushie") || text.includes("character")) return { stage: "Product choices", purpose: "Choose character" };
  if (text.includes("buy later") || text.includes("follow")) return { stage: "Follow-up", purpose: "Buy later" };
  if (hasSelection) return { stage: "Decision", purpose: "Ask selection" };
  return { stage: "Message", purpose: "Automation" };
}

function detectVariant(flow: WhatsAppFlow) {
  const text = `${flow.name} ${flow.subgroupName || ""}`.toUpperCase();
  const variants = [text.match(/\b(5S|10S|20S)\b/)?.[1], text.match(/\b(EM|WM)\b/)?.[1]]
    .filter(Boolean);
  return variants.join(" - ");
}

function flowBreadcrumb(flow: WhatsAppFlow) {
  return [flow.groupName?.trim() || "Ungrouped", flow.subgroupName?.trim()].filter(Boolean).join(" / ");
}

function triggerSummary(flow: WhatsAppFlow) {
  const triggerType = normaliseTriggerType(flow.triggerType);
  if (triggerType === "first_message") return "First customer message";
  if (triggerType === "selection_button") return "Selection button press";
  if (triggerType === "click") return `Inbox button: ${flow.triggerButtonLabel || flow.name}`;
  const phrases = triggerPhrasesFromText(flow.trigger);
  const eventLabel = normaliseTriggerEvent(flow.triggerEvent) === "message_sent" ? "sent" : "received";
  return phrases.length ? `${phrases.length} exact phrase${phrases.length === 1 ? "" : "s"} on message ${eventLabel}` : "No trigger phrase";
}

function actionTypeSummary(flow: WhatsAppFlow) {
  const counts = flow.steps.reduce<Record<string, number>>((memo, step) => {
    const type = normaliseActionType(step.type);
    memo[type] = (memo[type] || 0) + 1;
    return memo;
  }, {});
  const parts = Object.entries(counts).map(([type, count]) => `${count} ${type.replace("Send ", "")}`);
  return parts.length ? parts.join(" - ") : "No actions";
}

function findBranchDestination(option: SelectionOption, flows: WhatsAppFlow[]): FlowBranch {
  const destination = option.targetFlowId
    ? flows.find((flow) => flow.id === option.targetFlowId)
    : flows.find((flow) => normaliseTriggerType(flow.triggerType) === "selection_button" && flow.triggerButtonLabel === option.id);
  if (destination) {
    return {
      label: option.label || "Option",
      destinationId: destination.id,
      destinationName: destination.name,
      status: "linked",
    };
  }
  return {
    label: option.label || "Option",
    destinationId: option.targetFlowId || "",
    destinationName: option.targetFlowName || "",
    status: option.targetFlowId ? "missing" : "unlinked",
  };
}

function flowBranches(flow: WhatsAppFlow, flows: WhatsAppFlow[]) {
  return flow.steps.flatMap((step) => {
    const action = actionFromStep(step);
    if (action.type !== "Ask Selection") return [];
    return action.options
      .filter((option) => option.label.trim())
      .map((option) => findBranchDestination(option, flows));
  });
}

function suggestedFlowName(flow: WhatsAppFlow, language: FlowAnalysis["language"], stage: string, purpose: string, variant: string) {
  return [language, stage, purpose, variant].filter(Boolean).join(" - ");
}

function normalisedDisplayName(flow: WhatsAppFlow) {
  return cleanCopySuffix(flow.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function analyseFlows(flows: WhatsAppFlow[]) {
  const duplicateNameCounts = flows.reduce<Record<string, number>>((memo, flow) => {
    const key = normalisedDisplayName(flow);
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});
  const analyses = new Map<string, FlowAnalysis>();

  for (const flow of flows) {
    const language = detectLanguage(flow);
    const { stage, purpose } = detectStage(flow);
    const variant = detectVariant(flow);
    const displayName = titleCaseLabel(cleanCopySuffix(flow.name));
    const suggestedName = suggestedFlowName(flow, language, stage, purpose, variant);
    const branches = flowBranches(flow, flows);
    const flags = [
      !flow.description.trim() ? "No notes" : "",
      flow.name.toLowerCase().includes("copy") ? "Copied name" : "",
      duplicateNameCounts[normalisedDisplayName(flow)] > 1 ? "Duplicate candidate" : "",
      branches.some((branch) => branch.status === "missing") ? "Missing destination" : "",
      branches.some((branch) => branch.status === "unlinked") ? "Unlinked option" : "",
    ].filter(Boolean);

    analyses.set(flow.id, {
      displayName,
      suggestedName,
      language,
      stage,
      purpose,
      variant,
      triggerSummary: triggerSummary(flow),
      breadcrumb: flowBreadcrumb(flow),
      actionsSummary: actionTypeSummary(flow),
      branches,
      counterpartId: "",
      flags,
    });
  }

  for (const flow of flows) {
    const current = analyses.get(flow.id);
    if (!current || current.language === "Any") continue;
    const counterpartLanguage = current.language === "EN" ? "MS" : "EN";
    const counterpart = flows.find((candidate) => {
      const candidateAnalysis = analyses.get(candidate.id);
      return candidate.id !== flow.id
        && candidateAnalysis?.language === counterpartLanguage
        && candidateAnalysis.stage === current.stage
        && candidateAnalysis.purpose === current.purpose
        && candidateAnalysis.variant === current.variant;
    });
    if (counterpart) current.counterpartId = counterpart.id;
  }

  return analyses;
}

function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes) return "";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function mediaTypeFromFile(file: File): MediaType {
  if (file.type.startsWith("video/")) return "video";
  if (isPdfFile(file)) return "pdf";
  return "image";
}

function contentTypeFromFile(file: File) {
  if (isPdfFile(file)) return "application/pdf";
  return file.type || "application/octet-stream";
}

function safeStorageFilename(value: string) {
  return value.replace(/[^\w.\- ]+/g, "_").trim() || "flow-media";
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function compressImageForUpload(file: File) {
  if (!file.type.startsWith("image/") || file.size <= MAX_BROWSER_IMAGE_BYTES) return file;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`${file.name} could not be prepared for upload.`));
    });
    image.src = imageUrl;
    await loaded;

    const scale = Math.min(1, MAX_FLOW_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (blob.size <= MAX_BROWSER_IMAGE_BYTES || quality === 0.52) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "flow-image";
        return new File([blob], `${baseName}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }

    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function prepareMediaFileForUpload(file: File) {
  if (file.type.startsWith("image/")) {
    const preparedFile = await compressImageForUpload(file);
    if (preparedFile.size > MAX_BROWSER_IMAGE_BYTES) {
      throw new Error(`${file.name} is too large. Try a smaller image.`);
    }
    return preparedFile;
  }

  if (file.type.startsWith("video/") && file.size > MAX_WHATSAPP_VIDEO_BYTES) {
    throw new Error(`${file.name} is ${formatFileSize(file.size)}. WhatsApp video messages must be ${Math.floor(MAX_WHATSAPP_VIDEO_BYTES / 1024 / 1024)} MB or smaller.`);
  }

  if (isPdfFile(file) && file.size > MAX_WHATSAPP_DOCUMENT_BYTES) {
    throw new Error(`${file.name} is ${formatFileSize(file.size)}. WhatsApp documents must be 100 MB or smaller, so this PDF needs to be compressed or split before it can be sent.`);
  }

  return file;
}

export default function WhatsAppFlowsClient() {
  const [initialCache] = useState(() => readFlowBuilderCache());
  const [flows, setFlows] = useState<WhatsAppFlow[]>(() => initialCache?.flows || []);
  const [form, setForm] = useState<FlowForm>(() => initialCache?.form || emptyFlowForm());
  const [editingId, setEditingId] = useState<string>(() => initialCache?.editingId || "");
  const [loading, setLoading] = useState(() => !initialCache);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [folders, setFolders] = useState<FlowFolder[]>(() => readFlowFolders());
  const [uploadingMediaId, setUploadingMediaId] = useState("");
  const [draggingMediaId, setDraggingMediaId] = useState("");
  const [draggingFlowId, setDraggingFlowId] = useState("");
  const [dropTargetKey, setDropTargetKey] = useState("");
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [libraryView, setLibraryView] = useState<LibraryView>("chart");
  const [searchTerm, setSearchTerm] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [openedGroupName, setOpenedGroupName] = useState("");
  const [selectedGroupTarget, setSelectedGroupTarget] = useState("Ungrouped");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [expandedFlowIds, setExpandedFlowIds] = useState<string[]>([]);
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<string[]>([]);
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState("trigger");
  const [screenMode, setScreenMode] = useState<FlowScreenMode>(() => initialCache?.editingId ? "builder" : "library");
  const [pendingSelectionRemoval, setPendingSelectionRemoval] = useState<PendingSelectionRemoval | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFlows() {
      if (!initialCache) setLoading(true);
      try {
        const response = await fetch("/api/crm/flows", { cache: "no-store" });
        const result = (await response.json()) as { ok?: boolean; flows?: WhatsAppFlow[]; error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || "Flows could not be loaded.");
        if (!cancelled) setFlows(result.flows || []);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Flows could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFlows();

    return () => {
      cancelled = true;
    };
  }, [initialCache]);

  useEffect(() => {
    writeFlowBuilderCache({
      flows,
      form,
      editingId,
      savedAt: Date.now(),
    });
  }, [editingId, flows, form]);

  const activeCount = useMemo(() => flows.filter((flow) => flow.status === "Active").length, [flows]);
  const flowGroups = useMemo(() => groupedFlowLibrary(flows, folders), [flows, folders]);
  const flowAnalysis = useMemo(() => analyseFlows(flows), [flows]);
  const filteredFlows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return flows.filter((flow) => {
      const analysis = flowAnalysis.get(flow.id);
      if (!analysis) return false;
      const haystack = [
        flow.name,
        analysis.displayName,
        analysis.suggestedName,
        analysis.breadcrumb,
        analysis.triggerSummary,
        analysis.stage,
        analysis.purpose,
        ...analysis.branches.map((branch) => `${branch.label} ${branch.destinationName}`),
        ...analysis.flags,
      ].join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (languageFilter === "all" || analysis.language === languageFilter)
        && (statusFilter === "all" || flow.status === statusFilter)
        && (triggerFilter === "all" || normaliseTriggerType(flow.triggerType) === triggerFilter)
        && (groupFilter === "all" || flowBreadcrumb(flow).startsWith(groupFilter))
        && (!needsAttentionOnly || analysis.flags.length > 0);
    });
  }, [flowAnalysis, flows, groupFilter, languageFilter, needsAttentionOnly, searchTerm, statusFilter, triggerFilter]);
  const filteredFlowIds = useMemo(() => new Set(filteredFlows.map((flow) => flow.id)), [filteredFlows]);
  const healthSummary = useMemo(() => {
    let unlinked = 0;
    let duplicateCandidates = 0;
    let withoutNotes = 0;
    let missingDestination = 0;
    for (const flow of flows) {
      const analysis = flowAnalysis.get(flow.id);
      if (!analysis) continue;
      if (analysis.flags.includes("Unlinked option")) unlinked += 1;
      if (analysis.flags.includes("Duplicate candidate") || analysis.flags.includes("Copied name")) duplicateCandidates += 1;
      if (analysis.flags.includes("No notes")) withoutNotes += 1;
      if (analysis.flags.includes("Missing destination")) missingDestination += 1;
    }
    return {
      total: flows.length,
      active: flows.filter((flow) => flow.status === "Active").length,
      draft: flows.filter((flow) => flow.status !== "Active").length,
      unlinked,
      duplicateCandidates,
      withoutNotes,
      missingDestination,
    };
  }, [flowAnalysis, flows]);
  const groupOptions = useMemo(() => (
    Array.from(new Set([
      ...flowGroups.map((group) => group.name),
      ...flows.map((flow) => flowBreadcrumb(flow).split(" / ")[0] || "Ungrouped"),
    ])).filter((group) => group !== "Ungrouped").sort()
  ), [flowGroups, flows]);

  useEffect(() => {
    if (!flowGroups.length || expandedFolderKeys.length) return;
    setExpandedFolderKeys(flowGroups.map((group) => `group:${group.name}`));
  }, [expandedFolderKeys.length, flowGroups]);
  const selectionLinks = useMemo(() => {
    const savedLinks = flows.flatMap(selectionLinksFromFlow);
    const draftLinks = selectionLinksFromDraft(form, editingId);
    return [
      ...savedLinks.filter((link) => link.sourceFlowId !== editingId),
      ...draftLinks,
    ];
  }, [editingId, flows, form]);
  const editingSelectionLinks = useMemo(() => (
    editingId ? selectionLinks.filter((link) => link.targetFlowId === editingId) : []
  ), [editingId, selectionLinks]);
  const hasUsableAction = useMemo(() => form.actions.some((action) => (
    action.type === "Send Media"
      ? action.mediaItems.some((item) => item.url.trim())
      : action.type === "AI Reply" || action.message.trim()
  )), [form.actions]);
  const flowEndsWithBranch = useMemo(() => {
    const lastAction = form.actions.at(-1);
    return Boolean(lastAction?.type === "Ask Selection" && lastAction.options.some((option) => option.label.trim()));
  }, [form.actions]);

  useEffect(() => {
    if (selectedCanvasNodeId === "trigger") return;
    if (!form.actions.some((action) => action.id === selectedCanvasNodeId)) setSelectedCanvasNodeId("trigger");
  }, [form.actions, selectedCanvasNodeId]);

  async function repairSelectionTargetKeys(sourceForm: FlowForm) {
    const desiredKeysByTargetId = new Map<string, Set<string>>();
    for (const action of sourceForm.actions) {
      if (action.type !== "Ask Selection") continue;
      for (const option of action.options) {
        if (!option.targetFlowId || !option.id) continue;
        const keys = desiredKeysByTargetId.get(option.targetFlowId) || new Set<string>();
        keys.add(option.id);
        desiredKeysByTargetId.set(option.targetFlowId, keys);
      }
    }

    const patchedFlows: WhatsAppFlow[] = [];
    for (const [targetFlowId, optionKeys] of desiredKeysByTargetId.entries()) {
      if (optionKeys.size !== 1) continue;
      const [optionKey] = Array.from(optionKeys);
      const targetFlow = flows.find((candidate) => candidate.id === targetFlowId);
      if (!targetFlow) continue;
      if (normaliseTriggerType(targetFlow.triggerType) === "selection_button" && targetFlow.triggerButtonLabel === optionKey) continue;
      patchedFlows.push(await saveFlowPatch({
        ...targetFlow,
        triggerType: "selection_button",
        triggerButtonLabel: optionKey,
      }));
    }
    return patchedFlows;
  }

  async function persistFlow(options: { publish?: boolean; status?: FlowForm["status"]; exitToLibrary?: boolean } = {}) {
    if (!form.name.trim() || (options.publish && !hasUsableAction)) return null;
    const sourceForm: FlowForm = {
      ...form,
      status: options.publish ? "Active" : (options.status || form.status),
    };
    if (sourceForm.status === "Active" && sourceForm.triggerType === "selection_button") {
      const key = form.triggerButtonLabel.trim().toLowerCase();
      const duplicate = flows.find((flow) => (
        flow.id !== editingId
        && flow.status === "Active"
        && normaliseTriggerType(flow.triggerType) === "selection_button"
        && (flow.triggerButtonLabel || "").trim().toLowerCase() === key
      ));
      if (duplicate) {
        const message = `Selection key "${form.triggerButtonLabel}" is already active on "${duplicate.name}". Generate a new key before saving.`;
        window.alert(message);
        setNotice(message);
        return null;
      }
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/flows", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(flowPayloadFromForm(sourceForm, editingId || undefined)),
      });
      const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
      if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be saved.");
      const repairedFlows = await repairSelectionTargetKeys(sourceForm);
      const repairedFlowMap = new Map(repairedFlows.map((flow) => [flow.id, flow]));
      setFlows((current) => {
        const withSource = editingId
          ? current.map((flow) => (flow.id === editingId ? (result.flow as WhatsAppFlow) : flow))
          : [result.flow as WhatsAppFlow, ...current];
        return withSource.map((flow) => repairedFlowMap.get(flow.id) || flow);
      });
      setEditingId(result.flow.id);
      setForm((current) => ({ ...current, status: result.flow?.status || sourceForm.status }));
      if (options.exitToLibrary) {
        setForm(emptyFlowForm());
        setEditingId("");
        setScreenMode("library");
      }
      setNotice(options.publish ? "Workflow published." : "Draft saved.");
      return result.flow;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveFlow() {
    return persistFlow({ status: "Draft", exitToLibrary: true });
  }

  async function publishFlow() {
    return persistFlow({ publish: true });
  }

  async function exitBuilder() {
    if (!form.name.trim()) {
      setNotice("Add a workflow name before leaving so this draft can be saved.");
      return;
    }
    await persistFlow({ exitToLibrary: true });
  }

  function editFlow(flow: WhatsAppFlow) {
    setEditingId(flow.id);
    setForm(formFromFlow(flow));
    setSelectedCanvasNodeId("trigger");
    setScreenMode("builder");
  }

  async function duplicateFlow(flow: WhatsAppFlow) {
    setSaving(true);
    setNotice("");
    try {
      const usedNames = new Set(flows.map((candidate) => candidate.name.trim().toLowerCase()));
      const duplicateForm = duplicateFormWithFreshKeys(flow, {
        name: uniqueCopyName(flow.name, usedNames),
      });
      const response = await fetch("/api/crm/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(flowPayloadFromForm(duplicateForm)),
      });
      const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
      if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be duplicated.");
      setFlows((current) => [result.flow as WhatsAppFlow, ...current]);
      setEditingId(result.flow.id);
      setForm(formFromFlow(result.flow));
      setSelectedCanvasNodeId("trigger");
      setScreenMode("builder");
      setNotice(`Duplicated "${flow.name}" as ${result.flow.status.toLowerCase()}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be duplicated.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCopiedFlows(flowIds: string[]) {
    await Promise.allSettled(flowIds.map((id) => fetch("/api/crm/flows", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    })));
  }

  async function duplicateFlowSet(
    sourceFlows: WhatsAppFlow[],
    label: string,
    overridesForFlow: (flow: WhatsAppFlow) => Partial<Pick<FlowForm, "groupName" | "subgroupName">>,
    afterSuccess?: (createdFlows: WhatsAppFlow[]) => void
  ) {
    if (!sourceFlows.length) {
      afterSuccess?.([]);
      setNotice(`Duplicated ${label}.`);
      return;
    }
    setSaving(true);
    setNotice("");
    const createdPairs: Array<{ source: WhatsAppFlow; created: WhatsAppFlow }> = [];
    try {
      const usedNames = new Set(flows.map((flow) => flow.name.trim().toLowerCase()));
      for (const sourceFlow of sourceFlows) {
        const duplicateForm = duplicateFormWithFreshKeys(sourceFlow, {
          name: uniqueCopyName(sourceFlow.name, usedNames),
          ...overridesForFlow(sourceFlow),
        });
        const response = await fetch("/api/crm/flows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(flowPayloadFromForm(duplicateForm)),
        });
        const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
        if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || `Could not duplicate ${sourceFlow.name}.`);
        createdPairs.push({ source: sourceFlow, created: result.flow });
      }

      const idMap = new Map(createdPairs.map((pair) => [pair.source.id, pair.created.id]));
      const nameMap = new Map(createdPairs.map((pair) => [pair.source.id, pair.created.name]));
      const formsToPatch = createdPairs.map((pair) => ({
        pair,
        form: formFromFlow(pair.created),
        changed: false,
      }));
      const desiredTriggerKeyByFlowId = new Map<string, string>();

      for (const item of formsToPatch) {
        item.form.actions = item.form.actions.map((action) => ({
          ...action,
          options: action.options.map((option) => {
            const mappedTargetId = option.targetFlowId ? idMap.get(option.targetFlowId) : "";
            if (!mappedTargetId) return option;
            item.changed = true;
            if (option.id) desiredTriggerKeyByFlowId.set(mappedTargetId, option.id);
            return {
              ...option,
              targetFlowId: mappedTargetId,
              targetFlowName: nameMap.get(option.targetFlowId || "") || option.targetFlowName,
            };
          }),
        }));
      }

      for (const item of formsToPatch) {
        const desiredTriggerKey = desiredTriggerKeyByFlowId.get(item.pair.created.id);
        if (desiredTriggerKey && item.form.triggerType === "selection_button" && item.form.triggerButtonLabel !== desiredTriggerKey) {
          item.form.triggerButtonLabel = desiredTriggerKey;
          item.changed = true;
        }
      }

      const patchedFlows: WhatsAppFlow[] = [];
      for (const item of formsToPatch) {
        if (!item.changed) {
          patchedFlows.push(item.pair.created);
          continue;
        }
        const response = await fetch("/api/crm/flows", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(flowPayloadFromForm(item.form, item.pair.created.id)),
        });
        const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
        if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || `Could not reconnect ${item.pair.created.name}.`);
        patchedFlows.push(result.flow);
      }

      setFlows((current) => [...patchedFlows, ...current]);
      afterSuccess?.(patchedFlows);
      if (patchedFlows[0]) {
        setEditingId(patchedFlows[0].id);
        setForm(formFromFlow(patchedFlows[0]));
      }
      setNotice(`Duplicated ${label}.`);
    } catch (error) {
      const createdIds = createdPairs.map((pair) => pair.created.id);
      if (createdIds.length) {
        await deleteCopiedFlows(createdIds);
        setFlows((current) => current.filter((flow) => !createdIds.includes(flow.id)));
      }
      setNotice(error instanceof Error ? error.message : `${label} could not be duplicated.`);
    } finally {
      setSaving(false);
    }
  }

  function duplicateGroup(group: FlowGroup) {
    const usedGroupNames = new Set(flowGroups.map((candidate) => candidate.name.trim().toLowerCase()));
    const nextGroupName = uniqueCopyName(group.name, usedGroupNames);
    const sourceFlows = [...group.flows, ...group.subgroups.flatMap(subfolderFlows)];
    const sourceSubfolders = flattenSubfolderPaths(group.subgroups);
    return duplicateFlowSet(sourceFlows, `group "${group.name}"`, (flow) => ({
      groupName: nextGroupName,
      subgroupName: flow.subgroupName || "",
    }), () => {
      saveFolders([
        ...folders.filter((folder) => folder.name.toLowerCase() !== nextGroupName.toLowerCase()),
        { name: nextGroupName, subfolders: sourceSubfolders },
      ]);
    });
  }

  function subfolderFlows(subfolder: FlowSubfolder): WhatsAppFlow[] {
    return [...subfolder.flows, ...subfolder.subgroups.flatMap(subfolderFlows)];
  }

  function duplicateSubgroup(groupName: string, subgroup: FlowSubfolder) {
    const group = flowGroups.find((candidate) => candidate.name === groupName);
    const usedSubfolderPaths = new Set((group ? flattenSubfolderPaths(group.subgroups) : []).map((path) => path.trim().toLowerCase()));
    const parentPath = folderPathParts(subgroup.path).slice(0, -1).join("/");
    const nextSubgroupName = uniqueCopyName(subgroup.name, new Set(
      Array.from(usedSubfolderPaths)
        .filter((path) => folderPathParts(path).slice(0, -1).join("/").toLowerCase() === parentPath.toLowerCase())
        .map((path) => folderPathParts(path).at(-1)?.toLowerCase() || "")
        .filter(Boolean)
    ));
    const nextRootPath = childFolderPath(parentPath, nextSubgroupName);
    const copiedSubfolderPaths = [subgroup.path, ...flattenSubfolderPaths(subgroup.subgroups)].map((path) => (
      path === subgroup.path || path.startsWith(`${subgroup.path}/`)
        ? `${nextRootPath}${path.slice(subgroup.path.length)}`
        : nextRootPath
    ));
    return duplicateFlowSet(subfolderFlows(subgroup), `subfolder "${subgroup.name}"`, (flow) => ({
      groupName: groupName === "Ungrouped" ? "" : groupName,
      subgroupName: flow.subgroupName === subgroup.path || flow.subgroupName?.startsWith(`${subgroup.path}/`)
        ? `${nextRootPath}${flow.subgroupName.slice(subgroup.path.length)}`
        : nextRootPath,
    }), () => {
      const nextFolders = [...folders];
      const existingIndex = nextFolders.findIndex((folder) => folder.name.toLowerCase() === groupName.toLowerCase());
      const folder = existingIndex >= 0
        ? nextFolders[existingIndex]
        : { name: groupName, subfolders: [] };
      const existingPaths = new Set(folder.subfolders.map((path) => path.toLowerCase()));
      const nextFolder = {
        ...folder,
        subfolders: [
          ...folder.subfolders,
          ...copiedSubfolderPaths.filter((path) => !existingPaths.has(path.toLowerCase())),
        ],
      };
      if (existingIndex >= 0) nextFolders[existingIndex] = nextFolder;
      else nextFolders.push(nextFolder);
      saveFolders(nextFolders);
    });
  }

  async function moveFlowsToFolder(flowIds: string[], groupName: string, subgroupName = "") {
    const uniqueFlowIds = Array.from(new Set(flowIds)).filter(Boolean);
    const movingFlows = flows.filter((candidate) => uniqueFlowIds.includes(candidate.id));
    if (!movingFlows.length) return;
    const nextGroupName = groupName === "Ungrouped" ? "" : groupName;
    const previous = flows;
    const movingIdSet = new Set(movingFlows.map((flow) => flow.id));
    const nextFlows = movingFlows.map((flow) => ({ ...flow, groupName: nextGroupName, subgroupName }));
    const nextFlowMap = new Map(nextFlows.map((flow) => [flow.id, flow]));
    setFlows((current) => current.map((candidate) => nextFlowMap.get(candidate.id) || candidate));
    if (editingId && movingIdSet.has(editingId)) {
      setForm((current) => ({ ...current, groupName: nextGroupName, subgroupName }));
    }
    const targetName = subgroupName ? `${nextGroupName || "Ungrouped"} / ${subgroupName}` : (nextGroupName || "Ungrouped");
    setNotice(`Moved ${movingFlows.length} flow${movingFlows.length === 1 ? "" : "s"} to ${targetName}.`);
    setSaving(true);
    try {
      const savedFlows = await Promise.all(nextFlows.map(async (nextFlow) => {
        const response = await fetch("/api/crm/flows", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(flowPayloadFromForm(formFromFlow(nextFlow), nextFlow.id)),
        });
        const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
        if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be moved.");
        return result.flow;
      }));
      const savedFlowMap = new Map(savedFlows.map((flow) => [flow.id, flow]));
      setFlows((current) => current.map((candidate) => savedFlowMap.get(candidate.id) || candidate));
      setSelectedFlowIds((current) => current.filter((flowId) => !movingIdSet.has(flowId)));
    } catch (error) {
      setFlows(previous);
      const editedPreviousFlow = previous.find((flow) => flow.id === editingId);
      if (editedPreviousFlow) setForm(formFromFlow(editedPreviousFlow));
      setNotice(error instanceof Error ? error.message : "Flows could not be moved.");
    } finally {
      setSaving(false);
    }
  }

  function saveFolders(nextFolders: FlowFolder[]) {
    setFolders(nextFolders);
    writeFlowFolders(nextFolders);
  }

  function createFolder() {
    const name = window.prompt("Folder name");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (folders.some((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())) {
      setNotice(`Folder "${trimmed}" already exists.`);
      return;
    }
    saveFolders([...folders, { name: trimmed, subfolders: [] }]);
    setNotice(`Created folder "${trimmed}".`);
  }

  function createSubfolder(groupName: string, parentPath = "") {
    const name = window.prompt(`Subfolder name for ${parentPath || groupName}`);
    const trimmed = name?.trim();
    if (!trimmed) return;
    const nextPath = childFolderPath(parentPath, trimmed);
    const nextFolders = [...folders];
    const existingIndex = nextFolders.findIndex((folder) => folder.name.toLowerCase() === groupName.toLowerCase());
    const folder = existingIndex >= 0
      ? nextFolders[existingIndex]
      : { name: groupName, subfolders: [] };
    if (folder.subfolders.some((subfolder) => subfolder.toLowerCase() === nextPath.toLowerCase())) {
      setNotice(`Subfolder "${nextPath}" already exists in "${groupName}".`);
      return;
    }
    const nextFolder = { ...folder, subfolders: [...folder.subfolders, nextPath] };
    if (existingIndex >= 0) nextFolders[existingIndex] = nextFolder;
    else nextFolders.push(nextFolder);
    saveFolders(nextFolders);
    setNotice(`Created subfolder "${nextPath}".`);
  }

  async function saveFlowPatch(nextFlow: WhatsAppFlow) {
    const response = await fetch("/api/crm/flows", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(flowPayloadFromForm(formFromFlow(nextFlow), nextFlow.id)),
    });
    const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
    if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be saved.");
    return result.flow;
  }

  async function renameFlow(flow: WhatsAppFlow) {
    const name = window.prompt("Flow name", flow.name);
    const trimmed = name?.trim();
    if (!trimmed || trimmed === flow.name) return;
    if (flows.some((candidate) => candidate.id !== flow.id && candidate.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setNotice(`Flow "${trimmed}" already exists.`);
      return;
    }
    const previous = flows;
    const nextFlow = { ...flow, name: trimmed };
    setFlows((current) => current.map((candidate) => (candidate.id === flow.id ? nextFlow : candidate)));
    if (editingId === flow.id) setForm((current) => ({ ...current, name: trimmed }));
    setSaving(true);
    setNotice("");
    try {
      const savedFlow = await saveFlowPatch(nextFlow);
      setFlows((current) => current.map((candidate) => (candidate.id === flow.id ? savedFlow : candidate)));
      if (editingId === flow.id) setForm(formFromFlow(savedFlow));
      setNotice(`Renamed flow to "${savedFlow.name}".`);
    } catch (error) {
      setFlows(previous);
      if (editingId === flow.id) setForm(formFromFlow(flow));
      setNotice(error instanceof Error ? error.message : "Flow could not be renamed.");
    } finally {
      setSaving(false);
    }
  }

  async function renameGroup(group: FlowGroup) {
    const name = window.prompt("Folder name", group.name);
    const trimmed = name?.trim();
    if (!trimmed || trimmed === group.name) return;
    if (flowGroups.some((candidate) => candidate.name !== group.name && candidate.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setNotice(`Folder "${trimmed}" already exists.`);
      return;
    }
    const previousFlows = flows;
    const previousFolders = folders;
    const nextGroupName = trimmed === "Ungrouped" ? "" : trimmed;
    const affectedIds = new Set([...group.flows, ...group.subgroups.flatMap(subfolderFlows)].map((flow) => flow.id));
    const nextFlows = flows.map((flow) => (
      affectedIds.has(flow.id) ? { ...flow, groupName: nextGroupName } : flow
    ));
    const existingFolder = folders.find((folder) => folder.name.toLowerCase() === group.name.toLowerCase());
    const nextFolders = [
      ...folders.filter((folder) => folder.name.toLowerCase() !== group.name.toLowerCase()),
      { name: trimmed, subfolders: existingFolder?.subfolders || flattenSubfolderPaths(group.subgroups) },
    ];
    setFlows(nextFlows);
    saveFolders(nextFolders);
    if (editingId && affectedIds.has(editingId)) setForm((current) => ({ ...current, groupName: nextGroupName }));
    setSaving(true);
    setNotice("");
    try {
      const savedFlows = await Promise.all(nextFlows.filter((flow) => affectedIds.has(flow.id)).map(saveFlowPatch));
      const savedMap = new Map(savedFlows.map((flow) => [flow.id, flow]));
      setFlows((current) => current.map((flow) => savedMap.get(flow.id) || flow));
      const editedFlow = savedMap.get(editingId);
      if (editedFlow) setForm(formFromFlow(editedFlow));
      setNotice(`Renamed folder to "${trimmed}".`);
    } catch (error) {
      setFlows(previousFlows);
      saveFolders(previousFolders);
      const editedPreviousFlow = previousFlows.find((flow) => flow.id === editingId);
      if (editedPreviousFlow) setForm(formFromFlow(editedPreviousFlow));
      setNotice(error instanceof Error ? error.message : "Folder could not be renamed.");
    } finally {
      setSaving(false);
    }
  }

  async function renameSubfolder(groupName: string, subfolder: FlowSubfolder) {
    const name = window.prompt("Subfolder name", subfolder.name);
    const trimmed = name?.trim();
    if (!trimmed || trimmed === subfolder.name) return;
    const parentPath = folderPathParts(subfolder.path).slice(0, -1).join("/");
    const nextPath = childFolderPath(parentPath, trimmed);
    const group = flowGroups.find((candidate) => candidate.name === groupName);
    if (group && flattenSubfolderPaths(group.subgroups).some((path) => path !== subfolder.path && path.toLowerCase() === nextPath.toLowerCase())) {
      setNotice(`Subfolder "${nextPath}" already exists in "${groupName}".`);
      return;
    }
    const previousFlows = flows;
    const previousFolders = folders;
    const affectedFlows = subfolderFlows(subfolder);
    const affectedIds = new Set(affectedFlows.map((flow) => flow.id));
    const nextFlows = flows.map((flow) => {
      if (!affectedIds.has(flow.id)) return flow;
      const subgroupName = flow.subgroupName === subfolder.path || flow.subgroupName?.startsWith(`${subfolder.path}/`)
        ? `${nextPath}${flow.subgroupName.slice(subfolder.path.length)}`
        : nextPath;
      return { ...flow, subgroupName };
    });
    const nextFolders = folders.map((folder) => {
      if (folder.name.toLowerCase() !== groupName.toLowerCase()) return folder;
      return {
        ...folder,
        subfolders: folder.subfolders.map((path) => (
          path === subfolder.path || path.startsWith(`${subfolder.path}/`)
            ? `${nextPath}${path.slice(subfolder.path.length)}`
            : path
        )),
      };
    });
    setFlows(nextFlows);
    saveFolders(nextFolders);
    if (editingId && affectedIds.has(editingId)) {
      const editedFlow = nextFlows.find((flow) => flow.id === editingId);
      if (editedFlow) setForm(formFromFlow(editedFlow));
    }
    setSaving(true);
    setNotice("");
    try {
      const savedFlows = await Promise.all(nextFlows.filter((flow) => affectedIds.has(flow.id)).map(saveFlowPatch));
      const savedMap = new Map(savedFlows.map((flow) => [flow.id, flow]));
      setFlows((current) => current.map((flow) => savedMap.get(flow.id) || flow));
      const editedFlow = savedMap.get(editingId);
      if (editedFlow) setForm(formFromFlow(editedFlow));
      setNotice(`Renamed subfolder to "${trimmed}".`);
    } catch (error) {
      setFlows(previousFlows);
      saveFolders(previousFolders);
      const editedPreviousFlow = previousFlows.find((flow) => flow.id === editingId);
      if (editedPreviousFlow) setForm(formFromFlow(editedPreviousFlow));
      setNotice(error instanceof Error ? error.message : "Subfolder could not be renamed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFlow(flowIdToDelete: string) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/flows", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: flowIdToDelete }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Flow could not be deleted.");
      setFlows((current) => current.filter((flow) => flow.id !== flowIdToDelete));
      if (editingId === flowIdToDelete) {
        setEditingId("");
        setForm(emptyFlowForm());
      }
      setNotice("Flow deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function updateAction(actionId: string, patch: Partial<FlowAction>) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => (action.id === actionId ? { ...action, ...patch } : action)),
    }));
  }

  function updateMediaItem(actionId: string, mediaId: string | undefined, patch: Partial<FlowMediaItem>) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.id !== actionId) return action;
        return {
          ...action,
          mediaItems: action.mediaItems.map((item) => (item.id === mediaId ? { ...item, ...patch } : item)),
        };
      }),
    }));
  }

  function isEmptyMediaSlot(item?: FlowMediaItem) {
    return Boolean(item && !item.url.trim() && !(item.fileName || "").trim());
  }

  function applyUploadedMediaItems(actionId: string, mediaId: string | undefined, uploadedItems: FlowMediaItem[]) {
    if (!uploadedItems.length) return;
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.id !== actionId) return action;
        const targetIndex = action.mediaItems.findIndex((item) => item.id === mediaId);
        if (targetIndex < 0) return { ...action, mediaItems: [...action.mediaItems, ...uploadedItems] };

        const nextItems = [...action.mediaItems];
        const currentItem = nextItems[targetIndex];
        if (!isEmptyMediaSlot(currentItem)) {
          return { ...action, mediaItems: [...nextItems, ...uploadedItems] };
        }
        nextItems.splice(targetIndex, 1, { ...uploadedItems[0], caption: currentItem.caption || uploadedItems[0].caption }, ...uploadedItems.slice(1));
        return { ...action, mediaItems: nextItems };
      }),
    }));
  }

  function addMediaItem(actionId: string, type: MediaType) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => (
        action.id === actionId
          ? { ...action, mediaItems: [...action.mediaItems, makeMediaItem({ type })] }
          : action
      )),
    }));
  }

  function removeMediaItem(actionId: string, mediaId: string | undefined) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.id !== actionId) return action;
        const mediaItems = action.mediaItems.filter((item) => item.id !== mediaId);
        return { ...action, mediaItems: mediaItems.length ? mediaItems : [makeMediaItem()] };
      }),
    }));
  }

  function updateBranchOptionActions(actionId: string, optionId: string | undefined, updater: (actions: FlowAction[]) => FlowAction[]) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.id !== actionId) return action;
        return {
          ...action,
          options: action.options.map((option) => (
            option.id === optionId ? { ...option, actions: updater(option.actions || []) } : option
          )),
        };
      }),
    }));
  }

  function addActionBelowOption(actionId: string, option: SelectionOption) {
    updateBranchOptionActions(actionId, option.id, (actions) => [
      ...actions,
      makeAction({
        delayValue: actions.length ? "5" : "0",
        delayUnit: "seconds",
        message: "New action. Replace this message before publishing.",
      }),
    ]);
  }

  function copyOptionActions(actionId: string, sourceOption: SelectionOption, targetOptionId: string) {
    if (!targetOptionId || sourceOption.id === targetOptionId) return;
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (action.id !== actionId) return action;
        return {
          ...action,
          options: action.options.map((option) => (
            option.id === targetOptionId ? { ...option, actions: (sourceOption.actions || []).map((sourceAction) => makeAction(sourceAction)) } : option
          )),
        };
      }),
    }));
    const targetOption = form.actions.find((action) => action.id === actionId)?.options.find((option) => option.id === targetOptionId);
    setNotice(`Copied actions from ${sourceOption.label || "this option"} to ${targetOption?.label || "the other option"}.`);
  }

  function updateBranchAction(actionId: string, optionId: string | undefined, branchActionId: string, patch: Partial<FlowAction>) {
    updateBranchOptionActions(actionId, optionId, (actions) => actions.map((branchAction) => {
      if (branchAction.id !== branchActionId) return branchAction;
      const nextType = patch.type || branchAction.type;
      return {
        ...branchAction,
        ...patch,
        mediaItems: nextType === "Send Media" && !branchAction.mediaItems.length ? [makeMediaItem()] : (patch.mediaItems || branchAction.mediaItems),
        options: nextType === "Ask Selection" && !branchAction.options.length ? [
          makeSelectionOption({ label: "Option 1" }),
          makeSelectionOption({ label: "Option 2" }),
        ] : (patch.options || branchAction.options),
      };
    }));
  }

  function removeBranchAction(actionId: string, optionId: string | undefined, branchActionId: string) {
    updateBranchOptionActions(actionId, optionId, (actions) => actions.filter((branchAction) => branchAction.id !== branchActionId));
  }

  function updateBranchMediaItem(actionId: string, optionId: string | undefined, branchActionId: string, mediaId: string | undefined, patch: Partial<FlowMediaItem>) {
    updateBranchAction(actionId, optionId, branchActionId, {
      mediaItems: ((form.actions
        .find((action) => action.id === actionId)?.options
        .find((option) => option.id === optionId)?.actions || [])
        .find((branchAction) => branchAction.id === branchActionId)?.mediaItems || [])
        .map((item) => (item.id === mediaId ? { ...item, ...patch } : item)),
    });
  }

  function applyUploadedBranchMediaItems(actionId: string, optionId: string | undefined, branchActionId: string, mediaId: string | undefined, uploadedItems: FlowMediaItem[]) {
    if (!uploadedItems.length) return;
    updateBranchOptionActions(actionId, optionId, (actions) => actions.map((branchAction) => {
      if (branchAction.id !== branchActionId) return branchAction;
      const targetIndex = branchAction.mediaItems.findIndex((item) => item.id === mediaId);
      if (targetIndex < 0) return { ...branchAction, mediaItems: [...branchAction.mediaItems, ...uploadedItems] };
      const nextItems = [...branchAction.mediaItems];
      const currentItem = nextItems[targetIndex];
      if (!isEmptyMediaSlot(currentItem)) {
        return { ...branchAction, mediaItems: [...nextItems, ...uploadedItems] };
      }
      nextItems.splice(targetIndex, 1, { ...uploadedItems[0], caption: currentItem.caption || uploadedItems[0].caption }, ...uploadedItems.slice(1));
      return { ...branchAction, mediaItems: nextItems };
    }));
  }

  function addBranchMediaItem(actionId: string, optionId: string | undefined, branchActionId: string, type: MediaType) {
    updateBranchOptionActions(actionId, optionId, (actions) => actions.map((branchAction) => (
      branchAction.id === branchActionId
        ? { ...branchAction, mediaItems: [...branchAction.mediaItems, makeMediaItem({ type })] }
        : branchAction
    )));
  }

  function removeBranchMediaItem(actionId: string, optionId: string | undefined, branchActionId: string, mediaId: string | undefined) {
    updateBranchOptionActions(actionId, optionId, (actions) => actions.map((branchAction) => {
      if (branchAction.id !== branchActionId) return branchAction;
      const mediaItems = branchAction.mediaItems.filter((item) => item.id !== mediaId);
      return { ...branchAction, mediaItems: mediaItems.length ? mediaItems : [makeMediaItem()] };
    }));
  }

  async function uploadMediaFileDirectly(file: File) {
    if (!supabase) {
      throw new Error("Direct media upload is not configured.");
    }

    const uploadFile = await prepareMediaFileForUpload(file);
    const contentType = contentTypeFromFile(uploadFile);
    const storagePath = [
      "flow-uploads",
      new Date().toISOString().slice(0, 10),
      `${makeId()}-${safeStorageFilename(uploadFile.name || file.name)}`,
    ].join("/");
    const { error } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(storagePath, uploadFile, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) {
      throw new Error(error.message || `${file.name} could not be uploaded to media storage.`);
    }

    const mediaUrl = `${window.location.origin}/media-assets/direct?path=${encodeURIComponent(storagePath)}&filename=${encodeURIComponent(uploadFile.name || file.name)}&contentType=${encodeURIComponent(contentType)}`;
    return makeMediaItem({
      type: mediaTypeFromFile(uploadFile),
      url: mediaUrl,
      fileName: uploadFile.name || file.name,
      contentType,
      sizeBytes: uploadFile.size || file.size,
    });
  }

  async function uploadSingleMediaFile(file: File) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

    try {
      const uploadFile = await prepareMediaFileForUpload(file);
      const data = new FormData();
      data.append("file", uploadFile);
      const response = await fetch("/api/crm/media-assets", {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      const text = await response.text();
      let result: {
        ok?: boolean;
        asset?: { originalUrl?: string; fileName?: string; contentType?: string; sizeBytes?: number; mediaType?: string };
        error?: string;
      } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = {};
      }

      if (!response.ok || !result.ok || !result.asset?.originalUrl) {
        if (response.status === 413 || result.error?.includes("Media files must be")) {
          return uploadMediaFileDirectly(file);
        }
        throw new Error(result.error || `Media could not be uploaded. (${response.status})`);
      }

      return makeMediaItem({
        type: result.asset.mediaType === "video" ? "video" : result.asset.mediaType === "pdf" ? "pdf" : "image",
        url: result.asset.originalUrl,
        fileName: result.asset.fileName || uploadFile.name || file.name,
        contentType: result.asset.contentType || uploadFile.type || file.type,
        sizeBytes: result.asset.sizeBytes || uploadFile.size || file.size,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${file.name} took too long to upload. Try a smaller file or upload it again.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function uploadMediaFiles(actionId: string, item: FlowMediaItem, files: FileList | File[] | null) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/") && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
    if (invalidFile) {
      setNotice("Choose an image, video, or PDF file for this media item.");
      return;
    }

    const mediaId = item.id || "";
    setUploadingMediaId(mediaId);
    setNotice("");
    try {
      const uploadedItems: FlowMediaItem[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        try {
          const uploadedItem = await uploadSingleMediaFile(file);
          uploadedItems.push(uploadedItem);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `${file.name} could not be uploaded.`);
        }
      }

      if (!uploadedItems.length) {
        throw new Error(failures[0] || "Media could not be uploaded.");
      }
      applyUploadedMediaItems(actionId, mediaId, uploadedItems);
      setNotice(failures.length
        ? `${uploadedItems.length} uploaded. ${failures[0]}`
        : `${uploadedItems.length} media ${uploadedItems.length === 1 ? "file" : "files"} uploaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Media could not be uploaded.");
    } finally {
      setUploadingMediaId("");
      setDraggingMediaId("");
    }
  }

  async function uploadBranchMediaFiles(actionId: string, optionId: string | undefined, branchActionId: string, item: FlowMediaItem, files: FileList | File[] | null) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/") && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
    if (invalidFile) {
      setNotice("Choose an image, video, or PDF file for this media item.");
      return;
    }

    const mediaId = item.id || "";
    setUploadingMediaId(mediaId);
    setNotice("");
    try {
      const uploadedItems: FlowMediaItem[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        try {
          const uploadedItem = await uploadSingleMediaFile(file);
          uploadedItems.push(uploadedItem);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `${file.name} could not be uploaded.`);
        }
      }

      if (!uploadedItems.length) {
        throw new Error(failures[0] || "Media could not be uploaded.");
      }
      applyUploadedBranchMediaItems(actionId, optionId, branchActionId, mediaId, uploadedItems);
      setNotice(failures.length
        ? `${uploadedItems.length} uploaded. ${failures[0]}`
        : `${uploadedItems.length} media ${uploadedItems.length === 1 ? "file" : "files"} uploaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Media could not be uploaded.");
    } finally {
      setUploadingMediaId("");
      setDraggingMediaId("");
    }
  }

  function handleMediaDrag(event: DragEvent<HTMLLabelElement>, mediaId: string | undefined) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDraggingMediaId(mediaId || "");
  }

  function handleMediaDrop(event: DragEvent<HTMLLabelElement>, actionId: string, item: FlowMediaItem) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingMediaId("");
    void uploadMediaFiles(actionId, item, event.dataTransfer.files);
  }

  function handleBranchMediaDrop(event: DragEvent<HTMLLabelElement>, actionId: string, optionId: string | undefined, branchActionId: string, item: FlowMediaItem) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingMediaId("");
    void uploadBranchMediaFiles(actionId, optionId, branchActionId, item, event.dataTransfer.files);
  }

  function mediaAccept() {
    return "image/*,video/*,application/pdf,.pdf";
  }

  function mediaDropText(type: MediaType) {
    if (type === "video") return "one or more HD videos";
    if (type === "pdf") return "one or more PDFs";
    return "one or more images";
  }

  function removeAction(actionId: string) {
    const action = form.actions.find((candidate) => candidate.id === actionId);
    if (action?.type === "Ask Selection" && action.options.length) {
      setPendingSelectionRemoval({ actionId, options: action.options });
      return;
    }
    setForm((current) => {
      if (current.actions.length === 1) return current;
      return { ...current, actions: current.actions.filter((action) => action.id !== actionId) };
    });
  }

  function preserveSelectionOption(optionId: string) {
    const pending = pendingSelectionRemoval;
    if (!pending) return;
    const option = pending.options.find((candidate) => candidate.id === optionId);
    const preservedActions = (option?.actions || []).map((action) => makeAction(action));
    if (!preservedActions.length) {
      setNotice(`"${option?.label || "This option"}" has no inline actions to preserve.`);
      return;
    }
    setForm((current) => {
      const index = current.actions.findIndex((action) => action.id === pending.actionId);
      if (index < 0) return current;
      const actions = [...current.actions];
      actions.splice(index, 1, ...preservedActions);
      return { ...current, actions };
    });
    setSelectedCanvasNodeId(preservedActions[0].id);
    setPendingSelectionRemoval(null);
    setNotice(`Removed Ask Selection and kept the ${option?.label || "selected"} path.`);
  }

  function moveAction(actionId: string, direction: -1 | 1) {
    setForm((current) => {
      const index = current.actions.findIndex((action) => action.id === actionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.actions.length) return current;
      const actions = [...current.actions];
      const [action] = actions.splice(index, 1);
      actions.splice(nextIndex, 0, action);
      return { ...current, actions };
    });
  }

  function addAction() {
    setForm((current) => ({ ...current, actions: [...current.actions, makeAction({ delayValue: "5" })] }));
  }

  function createWorkflow() {
    setEditingId("");
    const usedNames = new Set(flows.map((flow) => flow.name.trim().toLowerCase()));
    let name = "Untitled workflow";
    for (let index = 2; usedNames.has(name.toLowerCase()); index += 1) {
      name = `Untitled workflow ${index}`;
    }
    setForm({ ...emptyFlowForm(), name, triggerButtonLabel: "Inbox button" });
    setSelectedCanvasNodeId("trigger");
    setScreenMode("builder");
  }

  function loadTemplate(template: FlowForm) {
    setEditingId("");
    setForm(cloneTemplate(template));
    setSelectedCanvasNodeId("trigger");
    setScreenMode("builder");
  }

  function toggleFlowSelection(flowId: string) {
    setSelectedFlowIds((current) => (
      current.includes(flowId)
        ? current.filter((selectedId) => selectedId !== flowId)
        : [...current, flowId]
    ));
  }

  function toggleExpandedFlow(flowId: string) {
    setExpandedFlowIds((current) => (
      current.includes(flowId)
        ? current.filter((selectedId) => selectedId !== flowId)
        : [...current, flowId]
    ));
  }

  function toggleFolder(folderKey: string) {
    setExpandedFolderKeys((current) => (
      current.includes(folderKey)
        ? current.filter((selectedKey) => selectedKey !== folderKey)
        : [...current, folderKey]
    ));
  }

  function dropZoneHandlers(targetKey: string, groupName: string, subgroupName = "") {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!draggingFlowId) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropTargetKey(targetKey);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        event.stopPropagation();
        const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDropTargetKey((current) => (current === targetKey ? "" : current));
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rawFlowIds = event.dataTransfer.getData("application/json");
        const fallbackFlowId = event.dataTransfer.getData("text/plain") || draggingFlowId;
        let flowIds = fallbackFlowId ? [fallbackFlowId] : [];
        try {
          const parsed = rawFlowIds ? JSON.parse(rawFlowIds) : [];
          if (Array.isArray(parsed)) flowIds = parsed.filter((item): item is string => typeof item === "string");
        } catch {
          flowIds = fallbackFlowId ? [fallbackFlowId] : [];
        }
        setDropTargetKey("");
        setDraggingFlowId("");
        if (flowIds.length) void moveFlowsToFolder(flowIds, groupName, subgroupName);
      },
    };
  }

  function actionNodeSummary(action: FlowAction) {
    if (action.type === "Update Status") return action.message ? `Set status to ${action.message}` : "Choose a customer status";
    if (action.type === "Send Media") {
      const count = action.mediaItems.filter((item) => item.url.trim()).length;
      return `${count} media item${count === 1 ? "" : "s"}`;
    }
    if (action.type === "Ask Selection") {
      const count = action.options.filter((option) => option.label.trim()).length;
      return `${count} outcome${count === 1 ? "" : "s"}`;
    }
    return action.message || "No message yet";
  }

  function triggerRuleRows() {
    const rules = form.triggerRules.length
      ? form.triggerRules
      : triggerRulesFromLegacy(form.trigger, form.triggerEvent);
    return rules.length ? rules : [makeTriggerRule({ event: "message_received" })];
  }

  function updateTriggerRule(ruleId: string | undefined, patch: Partial<TriggerRule>) {
    setForm((current) => {
      const currentRules = current.triggerRules.length
        ? current.triggerRules
        : triggerRulesFromLegacy(current.trigger, current.triggerEvent);
      const rules = currentRules.length ? currentRules : [makeTriggerRule({ event: "message_received" })];
      const nextRules = rules.map((rule) => (rule.id === ruleId ? makeTriggerRule({ ...rule, ...patch }) : rule));
      return {
        ...current,
        triggerRules: nextRules,
        trigger: nextRules.map((rule) => rule.phrase).join("\n"),
        triggerEvent: nextRules[0]?.event || current.triggerEvent,
        triggerCategory: "",
      };
    });
  }

  function addTriggerPhrase() {
    setForm((current) => {
      const currentRules = current.triggerRules.length
        ? current.triggerRules
        : triggerRulesFromLegacy(current.trigger, current.triggerEvent);
      const nextRules = [...currentRules, makeTriggerRule({ event: "message_received" })];
      return { ...current, triggerRules: nextRules, trigger: nextRules.map((rule) => rule.phrase).join("\n") };
    });
  }

  function removeTriggerRule(ruleId: string | undefined) {
    setForm((current) => {
      const currentRules = current.triggerRules.length
        ? current.triggerRules
        : triggerRulesFromLegacy(current.trigger, current.triggerEvent);
      const nextRules = currentRules.filter((rule) => rule.id !== ruleId);
      return { ...current, triggerRules: nextRules, trigger: nextRules.map((rule) => rule.phrase).join("\n") };
    });
  }

  function renderExactPhraseTriggerEditor() {
    const phraseRows = triggerRuleRows();
    return (
      <div className={styles.exactPhraseEditor}>
        <div className={styles.phraseRows}>
          {phraseRows.map((rule, index) => (
            <div className={styles.phraseRow} key={rule.id || `trigger-phrase-${index}`}>
              <select
                value={rule.event}
                onChange={(event) => updateTriggerRule(rule.id, { event: event.target.value as TriggerEvent })}
              >
                <option value="message_received">Message received</option>
                <option value="message_sent">Message sent</option>
              </select>
              <input
                value={rule.phrase}
                onChange={(event) => updateTriggerRule(rule.id, { phrase: event.target.value })}
                placeholder={`Exact phrase ${index + 1}`}
              />
              <button
                className={styles.textButton}
                disabled={phraseRows.length <= 1}
                onClick={() => removeTriggerRule(rule.id)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className={styles.secondaryButton} onClick={addTriggerPhrase} type="button">
          Add phrase
        </button>
      </div>
    );
  }

  function triggerCanvasSummary() {
    if (form.triggerType === "first_message") return "Customer sends first message";
    if (form.triggerType === "selection_button") {
      return editingSelectionLinks.length
        ? editingSelectionLinks.map((link) => `${link.sourceFlowName} / ${link.optionLabel}`).join(", ")
        : "Linked from another selection";
    }
    if (form.triggerType === "keywords") {
      const count = triggerPhrasesFromText(form.trigger).length;
      const eventLabel = form.triggerEvent === "message_sent" ? "sent" : "received";
      return count ? `${count} exact phrase${count === 1 ? "" : "s"} when message is ${eventLabel}` : "No exact phrases yet";
    }
    return form.triggerButtonLabel || form.name || "Inbox button";
  }

  function renderBranchActionCard(action: FlowAction, option: SelectionOption, branchAction: FlowAction, branchIndex: number) {
    return (
      <div className={styles.outcomeSubflowAction} key={`${option.id}-${branchAction.id}`}>
        <div className={styles.branchActionHeader}>
          <span className={styles.compactActionDelay}>
            Action {branchIndex + 1} (Delay
            <input
              aria-label={`Delay for branch action ${branchIndex + 1} in seconds`}
              min="0"
              onChange={(event) => updateBranchAction(action.id, option.id, branchAction.id, { delayValue: event.target.value, delayUnit: "seconds" })}
              type="number"
              value={branchAction.delayValue}
            />
            seconds)
          </span>
          <button
            className={styles.textButton}
            onClick={() => removeBranchAction(action.id, option.id, branchAction.id)}
            type="button"
          >
            Remove
          </button>
        </div>
        <select
          className={styles.canvasNodeSelect}
          value={actionSelectValue(branchAction)}
          onChange={(event) => updateBranchAction(action.id, option.id, branchAction.id, actionPatchFromSelect(branchAction, event.target.value as ActionSelectValue))}
        >
          {actionSelectOptions.map((choice) => (
            <option key={`${option.id}-${branchAction.id}-${choice.value}`} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        {branchAction.type === "Send Media" ? (
          <div className={styles.branchMediaList}>
            <textarea
              className={styles.canvasNodeInput}
              value={branchAction.message}
              onChange={(event) => updateBranchAction(action.id, option.id, branchAction.id, { message: event.target.value })}
              placeholder="Optional caption or instruction"
              rows={2}
            />
            {branchAction.mediaItems.map((item, mediaIndex) => (
              <div className={styles.branchMediaItem} key={item.id || `${branchAction.id}-${mediaIndex}`}>
                <select
                  className={styles.canvasNodeSelect}
                  value={item.type}
                  onChange={(event) => updateBranchMediaItem(action.id, option.id, branchAction.id, item.id, { type: event.target.value as MediaType })}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                </select>
                <label
                  className={`${styles.fileUpload} ${draggingMediaId === item.id ? styles.fileUploadDragging : ""}`}
                  onDragEnter={(event) => handleMediaDrag(event, item.id)}
                  onDragOver={(event) => handleMediaDrag(event, item.id)}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDraggingMediaId("");
                  }}
                  onDrop={(event) => handleBranchMediaDrop(event, action.id, option.id, branchAction.id, item)}
                >
                  <input
                    accept={mediaAccept()}
                    multiple
                    type="file"
                    onChange={(event) => {
                      void uploadBranchMediaFiles(action.id, option.id, branchAction.id, item, event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <strong>{uploadingMediaId === item.id ? "Uploading..." : item.url ? "Add more files" : "Upload media"}</strong>
                  <small>{item.fileName || (item.url ? "Drop or choose more files" : `Drop or choose ${mediaDropText(item.type)}`)}</small>
                </label>
                <input
                  className={styles.canvasNodeInput}
                  value={item.caption || ""}
                  onChange={(event) => updateBranchMediaItem(action.id, option.id, branchAction.id, item.id, { caption: event.target.value })}
                  placeholder="Optional caption"
                />
                {item.url && (
                  <span
                    className={styles.mediaPreview}
                    style={item.type === "image" ? { backgroundImage: `url("${item.url}")` } : undefined}
                  >
                    {item.type === "video" ? "HD video ready" : item.type === "pdf" ? "PDF ready" : ""}
                  </span>
                )}
                <button className={styles.textButton} type="button" onClick={() => removeBranchMediaItem(action.id, option.id, branchAction.id, item.id)}>
                  Remove media
                </button>
              </div>
            ))}
            <div className={styles.mediaButtons}>
              <button className={styles.secondaryButton} type="button" onClick={() => addBranchMediaItem(action.id, option.id, branchAction.id, "image")}>
                Add image
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => addBranchMediaItem(action.id, option.id, branchAction.id, "video")}>
                Add video
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => addBranchMediaItem(action.id, option.id, branchAction.id, "pdf")}>
                Add PDF
              </button>
            </div>
          </div>
        ) : branchAction.type === "Update Status" ? (
          <select
            aria-label={`Customer status for branch action ${branchIndex + 1}`}
            className={styles.canvasNodeSelect}
            value={customerStatuses.includes(branchAction.message as typeof customerStatuses[number]) ? branchAction.message : ""}
            onChange={(event) => updateBranchAction(action.id, option.id, branchAction.id, { message: event.target.value })}
          >
            <option value="">Choose status</option>
            {customerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        ) : (
          <textarea
            className={styles.canvasNodeInput}
            value={branchAction.message}
            onChange={(event) => updateBranchAction(action.id, option.id, branchAction.id, { message: event.target.value })}
            placeholder="No message yet"
            rows={2}
          />
        )}
      </div>
    );
  }

  function renderCanvasMediaEditor(action: FlowAction) {
    const mediaItems = action.mediaItems.length ? action.mediaItems : [makeMediaItem()];
    return (
      <div className={styles.branchMediaList}>
        <textarea
          className={styles.canvasNodeInput}
          value={action.message}
          onChange={(event) => updateAction(action.id, { message: event.target.value })}
          placeholder="Optional caption or instruction"
          rows={2}
        />
        {mediaItems.map((item, mediaIndex) => (
          <div className={styles.branchMediaItem} key={item.id || `${action.id}-${mediaIndex}`}>
            <select
              className={styles.canvasNodeSelect}
              value={item.type}
              onChange={(event) => {
                if (item.id) updateMediaItem(action.id, item.id, { type: event.target.value as MediaType });
                else addMediaItem(action.id, event.target.value as MediaType);
              }}
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="pdf">PDF</option>
            </select>
            <label
              className={`${styles.fileUpload} ${draggingMediaId === item.id ? styles.fileUploadDragging : ""}`}
              onDragEnter={(event) => handleMediaDrag(event, item.id)}
              onDragOver={(event) => handleMediaDrag(event, item.id)}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDraggingMediaId("");
              }}
              onDrop={(event) => handleMediaDrop(event, action.id, item)}
            >
              <input
                accept={mediaAccept()}
                multiple
                type="file"
                onChange={(event) => {
                  void uploadMediaFiles(action.id, item, event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <strong>{uploadingMediaId === item.id ? "Uploading..." : item.url ? "Add more files" : "Upload media"}</strong>
              <small>{item.fileName || (item.url ? "Drop or choose more files" : `Drop or choose ${mediaDropText(item.type)}`)}</small>
            </label>
            {item.id && (
              <input
                className={styles.canvasNodeInput}
                value={item.caption || ""}
                onChange={(event) => updateMediaItem(action.id, item.id, { caption: event.target.value })}
                placeholder="Optional caption"
              />
            )}
            {item.url && (
              <span
                className={styles.mediaPreview}
                style={item.type === "image" ? { backgroundImage: `url("${item.url}")` } : undefined}
              >
                {item.type === "video" ? "HD video ready" : item.type === "pdf" ? "PDF ready" : ""}
              </span>
            )}
            {item.id && (
              <button className={styles.textButton} type="button" onClick={() => removeMediaItem(action.id, item.id)}>
                Remove media
              </button>
            )}
          </div>
        ))}
        <div className={styles.mediaButtons}>
          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "image")}>
            Add image
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "video")}>
            Add video
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "pdf")}>
            Add PDF
          </button>
        </div>
      </div>
    );
  }

  function renderCurrentWorkflowBoard() {
    return (
      <section className={styles.workflowStudio}>
        <div className={styles.workflowBoard}>
          <div className={styles.workflowBoardToolbar}>
            <div>
              <input
                aria-label="Workflow name"
                className={styles.workflowTitleInput}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                value={form.name}
                placeholder="Untitled workflow"
              />
              <span>{form.actions.length} actions - {form.actions.filter((action) => action.type === "Ask Selection").length} branch points</span>
            </div>
            <div className={styles.workflowToolbarActions}>
              <button className={styles.secondaryButton} onClick={() => void exitBuilder()} disabled={saving} type="button">
                Save and exit
              </button>
              <span className={styles.autoSaveStatus}>
                {form.status === "Active" ? "Published" : "Draft"}
              </span>
              <button className={styles.primaryButton} onClick={() => void publishFlow()} disabled={saving || !form.name.trim() || !hasUsableAction} type="button">
                {saving ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>

          <div className={styles.workflowTrack}>
            <div
              className={`${styles.triggerFlowCard} ${selectedCanvasNodeId === "trigger" ? styles.canvasNodeSelected : ""}`}
              onClick={() => setSelectedCanvasNodeId("trigger")}
            >
              <span>Trigger</span>
              <select
                className={styles.canvasNodeSelect}
                onChange={(event) => setForm((current) => formWithTriggerType(current, event.target.value as TriggerType))}
                value={form.triggerType}
              >
                <option value="click">Inbox button</option>
                <option value="keywords">Exact phrases</option>
                <option value="first_message">First customer message</option>
                <option value="selection_button">Selection button press</option>
              </select>
              <div className={styles.triggerNodeBody}>
                {form.triggerType === "first_message" ? (
                  <small>Customer sends their first message</small>
                ) : form.triggerType === "selection_button" ? (
                  <small>{triggerCanvasSummary()}</small>
                ) : form.triggerType === "keywords" ? (
                  renderExactPhraseTriggerEditor()
                ) : (
                  <input
                    className={styles.canvasNodeInput}
                    onChange={(event) => setForm((current) => ({ ...current, triggerButtonLabel: event.target.value }))}
                    placeholder="Inbox button"
                    value={form.triggerButtonLabel}
                  />
                )}
              </div>
            </div>

            {form.actions.map((action, index) => {
              const filledOptions = action.options.filter((option) => option.label.trim());
              return (
                <div className={styles.canvasStep} key={`canvas-${action.id}`}>
                  <div className={styles.canvasConnector} />
                  <div
                    className={`${styles.canvasNode} ${selectedCanvasNodeId === action.id ? styles.canvasNodeSelected : ""}`}
                    onClick={() => setSelectedCanvasNodeId(action.id)}
                  >
                    <div className={styles.canvasActionHeader}>
                      <span className={styles.compactActionDelay}>
                        Action {index + 1} (Delay
                        <input
                          aria-label={`Delay for action ${index + 1} in seconds`}
                          min="0"
                          onChange={(event) => updateAction(action.id, { delayValue: event.target.value, delayUnit: "seconds" })}
                          type="number"
                          value={action.delayValue}
                        />
                        seconds)
                      </span>
                      <button
                        className={styles.canvasActionRemove}
                        disabled={form.actions.length === 1 && action.type !== "Ask Selection"}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeAction(action.id);
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <select
                      className={styles.canvasNodeSelect}
                      onChange={(event) => updateAction(action.id, actionPatchFromSelect(action, event.target.value as ActionSelectValue))}
                      value={actionSelectValue(action)}
                    >
                      {actionSelectOptions.map((choice) => (
                        <option key={`canvas-${action.id}-${choice.value}`} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                    {action.type === "Ask Selection" ? (
                      <textarea
                        aria-label={`Question for action ${index + 1}`}
                        className={styles.canvasNodeInput}
                        onChange={(event) => updateAction(action.id, { message: event.target.value })}
                        placeholder="Ask the customer a question before showing the choices"
                        rows={2}
                        value={action.message}
                      />
                    ) : action.type === "Send Message" ? (
                      <textarea
                        aria-label={`Message for action ${index + 1}`}
                        className={styles.canvasNodeInput}
                        onChange={(event) => updateAction(action.id, { message: event.target.value })}
                        placeholder="No message yet"
                        rows={3}
                        value={action.message}
                      />
                    ) : action.type === "Send Media" ? (
                      renderCanvasMediaEditor(action)
                    ) : action.type === "Update Status" ? (
                      <select
                        aria-label={`Customer status for action ${index + 1}`}
                        className={styles.canvasNodeSelect}
                        onChange={(event) => updateAction(action.id, { message: event.target.value })}
                        value={customerStatuses.includes(action.message as typeof customerStatuses[number]) ? action.message : ""}
                      >
                        <option value="">Choose status</option>
                        {customerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : action.type === "Create Manual Order Link" ? (
                      <div className={styles.manualOrderActionFields}>
                        <select value={manualOrderSettings(action.message).character} onChange={(event) => updateAction(action.id, { message: manualOrderSettingsValue(event.target.value, manualOrderSettings(action.message).speaker) })}>
                          {manualOrderCharacters.map((character) => <option key={character} value={character}>{character}</option>)}
                        </select>
                        <select value={manualOrderSettings(action.message).speaker} onChange={(event) => updateAction(action.id, { message: manualOrderSettingsValue(manualOrderSettings(action.message).character, event.target.value) })}>
                          {manualOrderSpeakers.map((speaker) => <option key={speaker} value={speaker}>{speaker}s speaker</option>)}
                        </select>
                      </div>
                    ) : (
                      <small>{actionNodeSummary(action)}</small>
                    )}
                  </div>
                  {action.type === "Ask Selection" && (
                    <div className={styles.outcomeFan}>
                      {filledOptions.length ? filledOptions.map((option) => (
                            <div className={styles.outcomeBranch} key={`${action.id}-${option.id || option.label}`}>
                              <div className={styles.outcomePath}>
                                <input
                                  className={styles.outcomeLabelInput}
                                  onChange={(event) => updateAction(action.id, {
                                    options: action.options.map((current) => (
                                      current.id === option.id ? { ...current, label: event.target.value } : current
                                    )),
                                  })}
                                  value={option.label}
                                  placeholder="Option label"
                                />
                                <strong>{(option.actions || []).length ? `${option.actions?.length} inline action${option.actions?.length === 1 ? "" : "s"}` : "No actions yet"}</strong>
                                {action.options.filter((candidate) => candidate.id !== option.id).length > 0 && (
                                  <label className={styles.copyBranchControl}>
                                    Copy actions to
                                    <select
                                      aria-label={`Copy actions from ${option.label || "this option"}`}
                                      defaultValue=""
                                      disabled={!(option.actions || []).length}
                                      onChange={(event) => {
                                        copyOptionActions(action.id, option, event.target.value);
                                        event.currentTarget.value = "";
                                      }}
                                    >
                                      <option value="">Choose option</option>
                                      {action.options.filter((candidate) => candidate.id !== option.id).map((candidate) => (
                                        <option key={`${option.id}-copy-${candidate.id}`} value={candidate.id}>
                                          {candidate.label || "Unnamed option"}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                              </div>
                              <div className={styles.branchConnector} />
                              <button
                                aria-label={`Add action below ${option.label || "option"}`}
                                className={styles.outcomeAddButton}
                                onClick={() => addActionBelowOption(action.id, option)}
                                type="button"
                              >
                                +
                              </button>
                              {(option.actions || []).length > 0 && (
                                <div className={styles.outcomeSubflowActions}>
                                  {(option.actions || []).map((branchAction, branchIndex) => renderBranchActionCard(action, option, branchAction, branchIndex))}
                                </div>
                              )}
                            </div>
                      )) : (
                        <div className={styles.outcomePath}>
                          <span>No options</span>
                          <strong>Add a button outcome</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!flowEndsWithBranch && (
              <>
                <div className={styles.canvasConnector} />
                <button className={styles.canvasAddButton} onClick={addAction} type="button" aria-label="Add action">
                  +
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  function chartLevels(chartFlows: WhatsAppFlow[]) {
    const flowIds = new Set(chartFlows.map((flow) => flow.id));
    const incomingIds = new Set<string>();
    const childrenByFlowId = new Map<string, string[]>();

    for (const flow of chartFlows) {
      const analysis = flowAnalysis.get(flow.id);
      const childIds = (analysis?.branches || [])
        .map((branch) => branch.destinationId)
        .filter((destinationId) => flowIds.has(destinationId));
      childrenByFlowId.set(flow.id, childIds);
      for (const childId of childIds) incomingIds.add(childId);
    }

    const roots = chartFlows.filter((flow) => (
      !incomingIds.has(flow.id) || normaliseTriggerType(flow.triggerType) !== "selection_button"
    ));
    const orderedRoots = roots.length ? roots : chartFlows.slice(0, 1);
    const depthByFlowId = new Map<string, number>();
    const queue = orderedRoots.map((flow) => ({ flow, depth: 0 }));
    let guard = 0;

    while (queue.length && guard < chartFlows.length * chartFlows.length) {
      guard += 1;
      const item = queue.shift();
      if (!item) continue;
      const previousDepth = depthByFlowId.get(item.flow.id);
      if (previousDepth !== undefined && previousDepth >= item.depth) continue;
      depthByFlowId.set(item.flow.id, item.depth);
      for (const childId of childrenByFlowId.get(item.flow.id) || []) {
        const childFlow = chartFlows.find((flow) => flow.id === childId);
        if (childFlow) queue.push({ flow: childFlow, depth: item.depth + 1 });
      }
    }

    for (const flow of chartFlows) {
      if (!depthByFlowId.has(flow.id)) depthByFlowId.set(flow.id, 0);
    }

    const maxDepth = Math.max(0, ...Array.from(depthByFlowId.values()));
    return Array.from({ length: maxDepth + 1 }, (_, depth) => (
      chartFlows.filter((flow) => depthByFlowId.get(flow.id) === depth)
    ));
  }

  function renderChartFlowNode(flow: WhatsAppFlow, chartFlowIds: Set<string>) {
    const analysis = flowAnalysis.get(flow.id);
    if (!analysis) return null;
    const linkedBranches = analysis.branches.filter((branch) => chartFlowIds.has(branch.destinationId));
    const outsideBranches = analysis.branches.filter((branch) => branch.destinationId && !chartFlowIds.has(branch.destinationId));
    const isSelected = selectedFlowIds.includes(flow.id);

    return (
      <article
        className={`${styles.chartFlowNode} ${analysis.flags.length ? styles.needsAttentionFlow : ""} ${isSelected ? styles.selectedFlow : ""}`}
        draggable
        key={flow.id}
        onDragStart={(event) => {
          const draggingIds = isSelected ? selectedFlowIds : [flow.id];
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", flow.id);
          event.dataTransfer.setData("application/json", JSON.stringify(draggingIds));
          setDraggingFlowId(flow.id);
        }}
        onDragEnd={() => {
          setDraggingFlowId("");
          setDropTargetKey("");
        }}
      >
        <div className={styles.chartNodeHeader}>
          <label className={styles.flowSelect}>
            <input
              aria-label={`Select ${flow.name}`}
              checked={isSelected}
              onChange={() => toggleFlowSelection(flow.id)}
              type="checkbox"
            />
          </label>
          <button onClick={() => editFlow(flow)} type="button">
            <strong>{analysis.displayName}</strong>
            <span>{analysis.stage} - {analysis.language} - {flow.status}</span>
          </button>
        </div>
        <div className={styles.chartNodeMeta}>
          <span>{analysis.triggerSummary}</span>
          <span>{analysis.actionsSummary}</span>
        </div>
        {analysis.flags.length > 0 && (
          <div className={styles.flowFlags}>
            {analysis.flags.map((flag) => <span key={`${flow.id}-chart-${flag}`}>{flag}</span>)}
          </div>
        )}
        {(linkedBranches.length > 0 || outsideBranches.length > 0) && (
          <div className={styles.chartBranches}>
            {linkedBranches.map((branch) => (
              <span className={styles.branchLinked} key={`${flow.id}-chart-${branch.label}-${branch.destinationId}`}>
                {branch.label} {"->"} {branch.destinationName}
              </span>
            ))}
            {outsideBranches.map((branch) => (
              <span className={styles.branchOutside} key={`${flow.id}-outside-${branch.label}-${branch.destinationId}`}>
                {branch.label} {"->"} outside group
              </span>
            ))}
          </div>
        )}
        <div className={styles.chartNodeActions}>
          <button onClick={() => editFlow(flow)} type="button">Edit</button>
          <button disabled={saving} onClick={() => void duplicateFlow(flow)} type="button">Duplicate</button>
          <button disabled={saving} onClick={() => void deleteFlow(flow.id)} type="button">Delete</button>
        </div>
      </article>
    );
  }

  function renderFlowChartWorkspace(title: string, chartFlows: WhatsAppFlow[], handlers: ReturnType<typeof dropZoneHandlers>) {
    const chartFlowIds = new Set(chartFlows.map((flow) => flow.id));
    const levels = chartLevels(chartFlows);
    const branchCount = chartFlows.reduce((total, flow) => {
      const analysis = flowAnalysis.get(flow.id);
      return total + (analysis?.branches.filter((branch) => chartFlowIds.has(branch.destinationId)).length || 0);
    }, 0);

    return (
      <div className={styles.groupChartWorkspace} {...handlers}>
        <div className={styles.groupChartHeader}>
          <div>
            <strong>{title} flow chart</strong>
            <span>{chartFlows.length} flows - {branchCount} linked paths</span>
          </div>
          <p>Drag flows onto this workspace to place them in this group.</p>
        </div>
        <div className={styles.folderDropPad} {...handlers}>
          Drop flow here
        </div>
        {chartFlows.length ? (
          <div className={styles.groupChartCanvas}>
            {levels.map((levelFlows, index) => (
              <div className={styles.chartColumn} key={`${title}-level-${index}`}>
                <span className={styles.chartColumnLabel}>{index === 0 ? "Entry" : `Step ${index}`}</span>
                {levelFlows.map((flow) => renderChartFlowNode(flow, chartFlowIds))}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyChart}>
            Create or drag flows into this group to build its chart.
          </div>
        )}
      </div>
    );
  }

  function renderFlowCard(flow: WhatsAppFlow) {
    const isSelected = selectedFlowIds.includes(flow.id);
    const analysis = flowAnalysis.get(flow.id);
    const isExpanded = expandedFlowIds.includes(flow.id);
    if (!analysis) return null;
    return (
      <div
        className={`${styles.flowFile} ${analysis.flags.length ? styles.needsAttentionFlow : ""} ${isSelected ? styles.selectedFlow : ""} ${draggingFlowId === flow.id ? styles.draggingFlow : ""}`}
        draggable
        key={flow.id}
        onDragStart={(event) => {
          const draggingIds = isSelected ? selectedFlowIds : [flow.id];
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", flow.id);
          event.dataTransfer.setData("application/json", JSON.stringify(draggingIds));
          setDraggingFlowId(flow.id);
        }}
        onDragEnd={() => {
          setDraggingFlowId("");
          setDropTargetKey("");
        }}
      >
        <label className={styles.flowSelect}>
          <input
            aria-label={`Select ${flow.name}`}
            checked={isSelected}
            onChange={() => toggleFlowSelection(flow.id)}
            type="checkbox"
          />
        </label>
        <button className={styles.flowFileMain} onClick={() => toggleExpandedFlow(flow.id)} type="button">
          <span className={styles.flowFileName}>{analysis.displayName}</span>
          <span className={styles.flowSubline}>{analysis.breadcrumb}</span>
        </button>
        <div className={styles.flowBadgeRow}>
          <span className={flow.status === "Active" ? styles.activeBadge : styles.draftBadge}>{flow.status}</span>
          <span className={styles.languageBadge}>{analysis.language}</span>
        </div>
        <div className={styles.fileActions}>
          <button onClick={() => editFlow(flow)}>Edit</button>
          <button disabled={saving} onClick={() => void renameFlow(flow)}>
            Rename
          </button>
          <button disabled={saving} onClick={() => void duplicateFlow(flow)}>
            Duplicate
          </button>
          <button disabled={saving} onClick={() => void deleteFlow(flow.id)}>
            Delete
          </button>
        </div>
        <div className={styles.flowCardBody}>
          <div className={styles.flowMetaGrid}>
            <span><strong>Stage</strong>{analysis.stage}</span>
            <span><strong>Trigger</strong>{analysis.triggerSummary}</span>
            <span><strong>Actions</strong>{analysis.actionsSummary}</span>
            {analysis.counterpartId && (
              <span><strong>Pair</strong>{flowAnalysis.get(analysis.counterpartId)?.displayName || "Language variant"}</span>
            )}
          </div>
          {analysis.suggestedName !== flow.name && (
            <div className={styles.suggestedName}>
              Suggested name: <strong>{analysis.suggestedName}</strong>
            </div>
          )}
          {analysis.flags.length > 0 && (
            <div className={styles.flowFlags}>
              {analysis.flags.map((flag) => <span key={`${flow.id}-${flag}`}>{flag}</span>)}
            </div>
          )}
          {(isExpanded || analysis.branches.length > 0) && (
            <div className={styles.branchPreview}>
              {analysis.branches.length ? analysis.branches.map((branch) => (
                <span className={branch.status === "linked" ? styles.branchLinked : styles.branchWarning} key={`${flow.id}-${branch.label}-${branch.destinationId}`}>
                  {branch.label} {"->"} {branch.destinationName || (branch.status === "missing" ? "Missing flow" : "No destination")}
                </span>
              )) : <span>No outgoing branches</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSubfolder(groupName: string, subfolder: FlowSubfolder, depth = 0) {
    const targetKey = `subgroup:${groupName}:${subfolder.path}`;
    const handlers = dropZoneHandlers(targetKey, groupName, subfolder.path);
    const allFlows = subfolderFlows(subfolder);
    const visibleDirectFlows = subfolder.flows.filter((flow) => filteredFlowIds.has(flow.id));
    const visibleChildren = subfolder.subgroups.filter((child) => subfolderFlows(child).some((flow) => filteredFlowIds.has(flow.id)));
    const totalFlows = allFlows.length;
    const visibleTotal = allFlows.filter((flow) => filteredFlowIds.has(flow.id)).length;
    const isOpen = expandedFolderKeys.includes(targetKey) || searchTerm || needsAttentionOnly || visibleTotal !== totalFlows;
    if (!visibleTotal && filteredFlows.length !== flows.length) return null;

    return (
      <section
        className={`${styles.subfolderNode} ${dropTargetKey === targetKey ? styles.dropReady : ""}`}
        key={`${groupName}-${subfolder.path}`}
        style={{ marginLeft: Math.min(depth * 14 + 14, 42) }}
        {...handlers}
      >
        <div className={styles.folderRow}>
          <div>
            <button className={styles.folderTitleButton} onClick={() => toggleFolder(targetKey)} type="button">
              {isOpen ? "v" : ">"} {titleCaseLabel(cleanCopySuffix(subfolder.name))}
            </button>
            <span>{visibleTotal === totalFlows ? totalFlows : `${visibleTotal} of ${totalFlows}`} flows</span>
          </div>
          <div className={styles.folderActions}>
            <button disabled={saving} onClick={() => void renameSubfolder(groupName, subfolder)}>
              Rename
            </button>
            <button disabled={saving} onClick={() => createSubfolder(groupName, subfolder.path)}>
              New subfolder
            </button>
            <button disabled={saving} onClick={() => void duplicateSubgroup(groupName, subfolder)}>
              Duplicate
            </button>
          </div>
        </div>
        {isOpen && (
          <div className={styles.folderChildren}>
            {libraryView === "chart"
              ? renderFlowChartWorkspace(titleCaseLabel(cleanCopySuffix(subfolder.name)), visibleDirectFlows, handlers)
              : visibleDirectFlows.map((flow) => renderFlowCard(flow))}
            {visibleChildren.map((child) => renderSubfolder(groupName, child, depth + 1))}
          </div>
        )}
      </section>
    );
  }

  function renderWorkflowHome() {
    const openedGroup = flowGroups.find((group) => group.name === openedGroupName);
    const groupRows = openedGroup ? [] : flowGroups.filter((group) => (
      group.name !== "Ungrouped"
      && (groupFilter === "all" || group.name === groupFilter)
      && (
        !searchTerm.trim()
        || group.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
        || group.flows.some((flow) => filteredFlowIds.has(flow.id))
        || group.subgroups.some((subgroup) => (
          subfolderFlows(subgroup).some((flow) => filteredFlowIds.has(flow.id))
        ))
      )
    ));
    const workflowRows = (openedGroup
      ? filteredFlows.filter((flow) => flowGroupName(flow) === openedGroup.name)
      : filteredFlows.filter((flow) => flowGroupName(flow) === "Ungrouped")
    );

    return (
      <>
        <div className={styles.workflowHomeHeader}>
          <div>
            <p className={styles.eyebrow}>Flow</p>
            <h1>Workflows</h1>
          </div>
          <div className={styles.workflowHomeActions}>
            <button className={styles.secondaryButton} onClick={createFolder} type="button">Create group</button>
            <button className={styles.primaryButton} onClick={createWorkflow} type="button">Create workflow</button>
          </div>
        </div>

        {notice && <div className={styles.notice}>{notice}</div>}

        <section className={styles.workflowListPanel}>
          <div className={styles.workflowTabs}>
            <button className={statusFilter === "all" ? styles.workflowTabActive : ""} onClick={() => setStatusFilter("all")} type="button">All</button>
            <button className={statusFilter === "Active" ? styles.workflowTabActive : ""} onClick={() => setStatusFilter("Active")} type="button">Active</button>
            <button className={statusFilter === "Draft" ? styles.workflowTabActive : ""} onClick={() => setStatusFilter("Draft")} type="button">Draft</button>
          </div>

          <section className={styles.libraryControls}>
            <input
              aria-label="Search workflows"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search workflow, branch, trigger, group..."
              value={searchTerm}
            />
            <select aria-label="Language filter" onChange={(event) => setLanguageFilter(event.target.value)} value={languageFilter}>
              <option value="all">All languages</option>
              <option value="EN">English</option>
              <option value="MS">Malay</option>
              <option value="Any">Any language</option>
            </select>
            <select aria-label="Trigger filter" onChange={(event) => setTriggerFilter(event.target.value)} value={triggerFilter}>
              <option value="all">All triggers</option>
              <option value="keywords">Trigger phrases</option>
              <option value="click">Inbox button</option>
              <option value="first_message">First message</option>
              <option value="selection_button">Selection button</option>
            </select>
            <select
              aria-label="Group filter"
              onChange={(event) => {
                const group = event.target.value;
                setGroupFilter(group);
                setOpenedGroupName(group === "all" ? "" : group);
              }}
              value={groupFilter}
            >
              <option value="all">All groups</option>
              {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <label className={styles.attentionToggle}>
              <input checked={needsAttentionOnly} onChange={(event) => setNeedsAttentionOnly(event.target.checked)} type="checkbox" />
              Needs attention
            </label>
          </section>

          {selectedFlowIds.length > 0 && (
            <div className={styles.bulkGroupBar}>
              <strong>{selectedFlowIds.length} selected</strong>
              <span>Move selected workflows to</span>
              <select onChange={(event) => setSelectedGroupTarget(event.target.value)} value={selectedGroupTarget}>
                <option value="Ungrouped">Ungrouped</option>
                {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <button disabled={saving} onClick={() => void moveFlowsToFolder(selectedFlowIds, selectedGroupTarget)} type="button">Move to group</button>
              <button className={styles.textButton} onClick={() => setSelectedFlowIds([])} type="button">Clear</button>
            </div>
          )}

          <div className={styles.workflowTable}>
            <div className={styles.workflowTableHead}>
              <span />
              <span>Workflow</span>
              <span>Status</span>
              <span>Trigger</span>
              <span>Actions</span>
              <span>Branches</span>
              <span>Group</span>
              <span />
            </div>
            {openedGroup && (
              <div className={styles.workflowGroupBreadcrumb}>
                <button onClick={() => { setOpenedGroupName(""); setGroupFilter("all"); }} type="button">← All workflows</button>
                <strong>{openedGroup.name}</strong>
                <span>{workflowRows.length} workflow{workflowRows.length === 1 ? "" : "s"}</span>
              </div>
            )}
            {groupRows.map((group) => {
              const groupTotal = group.flows.length + group.subgroups.reduce((total, subgroup) => total + subfolderFlows(subgroup).length, 0);
              return (
                <div className={`${styles.workflowTableRow} ${styles.workflowGroupRow}`} key={`group-row-${group.name}`}>
                  <span className={styles.workflowGroupIcon}>▸</span>
                  <button onClick={() => { setOpenedGroupName(group.name); setGroupFilter(group.name); }} type="button">
                    <strong>{titleCaseLabel(cleanCopySuffix(group.name))}</strong>
                    <span>Group · {groupTotal} workflow{groupTotal === 1 ? "" : "s"}</span>
                  </button>
                  <span>—</span>
                  <span>Grouped workflows</span>
                  <span>{groupTotal ? `${groupTotal} workflows` : "Empty group"}</span>
                  <span>—</span>
                  <span>Group</span>
                  <div className={styles.workflowRowActions}>
                    <button onClick={() => { setOpenedGroupName(group.name); setGroupFilter(group.name); }} type="button">Open</button>
                  </div>
                </div>
              );
            })}
            {workflowRows.map((flow) => {
              const analysis = flowAnalysis.get(flow.id);
              if (!analysis) return null;
              return (
                <div className={`${styles.workflowTableRow} ${selectedFlowIds.includes(flow.id) ? styles.workflowTableRowSelected : ""}`} key={`workflow-row-${flow.id}`}>
                  <label className={styles.flowSelect}>
                    <input aria-label={`Select ${flow.name}`} checked={selectedFlowIds.includes(flow.id)} onChange={() => toggleFlowSelection(flow.id)} type="checkbox" />
                  </label>
                  <button onClick={() => editFlow(flow)} type="button">
                    <strong>{analysis.displayName}</strong>
                    <span>{flow.description || analysis.suggestedName}</span>
                  </button>
                  <span className={flow.status === "Active" ? styles.activeBadge : styles.draftBadge}>{flow.status}</span>
                  <span>{analysis.triggerSummary}</span>
                  <span>{analysis.actionsSummary}</span>
                  <span>{analysis.branches.length ? `${analysis.branches.length} outcomes` : "None"}</span>
                  <span>{analysis.breadcrumb}</span>
                  <div className={styles.workflowRowActions}>
                    <button onClick={() => editFlow(flow)} type="button">Open</button>
                    <button disabled={saving} onClick={() => void duplicateFlow(flow)} type="button">Duplicate</button>
                    <button disabled={saving} onClick={() => void deleteFlow(flow.id)} type="button">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && filteredFlows.length === 0 && (
            <div className={styles.emptyState}>
              <h3>No matching workflows</h3>
              <p>Adjust the filters or create a new workflow.</p>
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <main className={styles.page}>
      <section className={`${styles.layout} ${screenMode === "library" ? styles.libraryMode : styles.builderMode}`}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a href="/crm/inbox">Inbox</a>
          <a className={styles.railActive} href="/crm/flows">Flow</a>
          <a href="/crm/customers">Customers</a>
          <a href="/crm/test-ai">Test AI</a>
          <a href="/crm/setup">Setup</a>
        </aside>

        {screenMode === "library" ? (
          <section className={styles.flowList}>
            {renderWorkflowHome()}
          </section>
        ) : (
        <section className={styles.builder}>
          <div className={styles.builderHeader}>
            <div className={styles.builderTitleRow}>
              <button className={styles.backButton} onClick={() => void exitBuilder()} disabled={saving} type="button">Save and exit</button>
              <div>
                <p className={styles.eyebrow}>Workflow builder</p>
                <h1>{form.name || (editingId ? "Edit workflow" : "Create workflow")}</h1>
              </div>
            </div>
            <div className={styles.builderHeaderActions}>
              <span>{loading ? "Loading..." : `${flows.length} flows | ${activeCount} active`}</span>
              <span className={styles.autoSaveStatus}>
                {form.status === "Active" ? "Published" : "Draft"}
              </span>
              <button className={styles.primaryButton} onClick={() => void publishFlow()} disabled={saving || !form.name.trim() || !hasUsableAction} type="button">
                {saving ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>

          {notice && <div className={styles.notice}>{notice}</div>}

          <div className={styles.templateRow}>
            {starterTemplates.map((template) => (
              <button key={template.name} onClick={() => loadTemplate(template)}>
                {template.name}
              </button>
            ))}
          </div>

          <div className={styles.flowCanvas}>
            <section className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <span className={styles.nodeBadge}>Trigger</span>
                <p>Start this flow when a WhatsApp chat matches these conditions.</p>
              </div>

              <div className={styles.formGrid}>
                <label>
                  Flow name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Example: Ask for plushie details"
                  />
                </label>

                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FlowForm["status"] }))}
                  >
                    <option>Draft</option>
                    <option>Active</option>
                  </select>
                </label>
              </div>

              <div className={styles.formGrid}>
                <label>
                  Group
                  <input
                    value={form.groupName}
                    onChange={(event) => setForm((current) => ({ ...current, groupName: event.target.value }))}
                    placeholder="Example: Intro flows"
                  />
                </label>

                <label>
                  Subflow
                  <input
                    value={form.subgroupName}
                    onChange={(event) => setForm((current) => ({ ...current, subgroupName: event.target.value }))}
                    placeholder="Example: English path"
                  />
                </label>
              </div>

              <div className={styles.triggerModeGrid}>
                <label>
                  Trigger
                  <select
                    value={form.triggerType}
                    onChange={(event) => setForm((current) => formWithTriggerType(current, event.target.value as TriggerType))}
                  >
                    <option value="click">Click button</option>
                    <option value="keywords">Trigger words</option>
                    <option value="first_message">First customer message</option>
                    <option value="selection_button">Selection button press</option>
                  </select>
                </label>

                {form.triggerType === "first_message" ? (
                  <label>
                    Starts when
                    <input value="A customer sends their first message" disabled />
                  </label>
                ) : form.triggerType === "selection_button" ? (
                  <div className={styles.linkedTriggerPanel}>
                    <span>Linked from</span>
                    {editingSelectionLinks.length ? (
                      editingSelectionLinks.map((link) => (
                        <strong key={`${link.sourceFlowId}-${link.optionKey}`}>
                          {link.sourceFlowName} / {link.optionLabel}
                        </strong>
                      ))
                    ) : (
                      <strong>Choose this flow in an Ask Selection option to link it.</strong>
                    )}
                  </div>
                ) : form.triggerType === "click" ? (
                  <label>
                    Button name
                    <input
                      value={form.triggerButtonLabel}
                      onChange={(event) => setForm((current) => ({ ...current, triggerButtonLabel: event.target.value }))}
                      placeholder="Example: Ask details"
                    />
                  </label>
                ) : (
                  renderExactPhraseTriggerEditor()
                )}
              </div>

              <p className={styles.helperText}>
                {form.triggerType === "click"
                  ? "This flow appears as a quick button in the inbox. Click it to send the message sequence."
                  : form.triggerType === "first_message"
                    ? "This flow runs automatically when a customer sends their first message in a new chat."
                  : form.triggerType === "selection_button"
                    ? "This flow runs when it is selected in another flow's Ask Selection action. The button key is handled automatically."
                  : "This flow runs when a WhatsApp message contains one of these phrases. It ignores differences in case, punctuation, emoji, and extra words around the phrase. Choose whether it watches customer messages received or team messages sent."}
              </p>

              <label>
                Notes
                <input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What this flow is for"
                />
              </label>
            </section>

            {renderCurrentWorkflowBoard()}

            {form.actions.map((action, index) => (
              <div className={styles.actionWrap} key={action.id}>
                <div className={styles.nodeConnector}>Then</div>
                <section className={styles.actionNode}>
                  <div className={styles.actionHeader}>
                    <div>
                      <span className={`${styles.nodeBadge} ${styles.compactActionDelay}`}>
                        Action {index + 1} (Delay
                        <input
                          aria-label={`Delay for action ${index + 1} in seconds`}
                          min="0"
                          onChange={(event) => updateAction(action.id, { delayValue: event.target.value, delayUnit: "seconds" })}
                          type="number"
                          value={action.delayValue}
                        />
                        seconds)
                      </span>
                      <h3>{action.type}</h3>
                    </div>
                    <div className={styles.actionControls}>
                      <button className={styles.textButton} type="button" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>
                        Move up
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => moveAction(action.id, 1)} disabled={index === form.actions.length - 1}>
                        Move down
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => removeAction(action.id)} disabled={form.actions.length === 1 && action.type !== "Ask Selection"}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className={styles.actionTypeRow}>
                    <label>
                      Action
                      <select
                        value={actionSelectValue(action)}
                        onChange={(event) => updateAction(action.id, actionPatchFromSelect(action, event.target.value as ActionSelectValue))}
                      >
                        {actionSelectOptions.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {action.type === "Ask Selection" ? (
                    <div className={styles.selectionPanel}>
                      <label>
                        Question
                        <textarea
                          value={action.message}
                          onChange={(event) => updateAction(action.id, { message: event.target.value })}
                          placeholder="Example: Which language would you like to use?"
                          rows={3}
                        />
                      </label>
                      <div className={styles.optionList}>
                        {action.options.map((option, optionIndex) => {
                          const pairingIssue = selectionPairingIssue(option, flows);
                          return (
                            <div className={`${styles.optionItem} ${pairingIssue ? styles.optionItemError : ""}`} key={option.id || `${action.id}-option-${optionIndex}`}>
                              <label>
                                Button {optionIndex + 1}
                                <input
                                  value={option.label}
                                  onChange={(event) => updateAction(action.id, {
                                    options: action.options.map((current) => (
                                      current.id === option.id ? { ...current, label: event.target.value } : current
                                    )),
                                  })}
                                  placeholder="Example: English"
                                />
                              </label>
                              <label>
                                Flow to trigger
                                <select
                                  value={option.targetFlowId || ""}
                                  onChange={(event) => {
                                    const targetFlowId = event.target.value;
                                    updateAction(action.id, {
                                      options: action.options.map((current) => (
                                        current.id === option.id ? {
                                          ...current,
                                          targetFlowId,
                                          targetFlowName: flows.find((flow) => flow.id === targetFlowId)?.name || "",
                                        } : current
                                      )),
                                    });
                                  }}
                                >
                                  <option value="">Use a flow triggered by this option key</option>
                                  {flows
                                    .filter((flow) => flow.id !== editingId)
                                    .map((flow) => (
                                      <option key={flow.id} value={flow.id}>
                                        {flow.name} ({flow.status})
                                      </option>
                                    ))}
                                </select>
                                <small className={pairingIssue ? styles.optionWarning : undefined}>
                                  {pairingIssue || (option.targetFlowId
                                    ? `Linked with option key ${option.id}.`
                                    : `Option key: ${option.id}. Choose a target flow to link this button.`)}
                                </small>
                              </label>
                              <button
                                className={styles.textButton}
                                disabled={action.options.length <= 1}
                                onClick={() => updateAction(action.id, { options: action.options.filter((current) => current.id !== option.id) })}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                        <button
                          className={styles.secondaryButton}
                          disabled={action.options.length >= 3}
                          onClick={() => updateAction(action.id, { options: [...action.options, makeSelectionOption()] })}
                          type="button"
                        >
                          Add option
                        </button>
                      </div>
                    </div>
                  ) : action.type === "Send Media" ? (
                    <>
                      <label>
                        Caption / instruction
                        <textarea
                          value={action.message}
                          onChange={(event) => updateAction(action.id, { message: event.target.value })}
                          placeholder="Optional caption for the first media item, or an internal note for this action."
                          rows={3}
                        />
                      </label>

                      <div className={styles.mediaList}>
                        {action.mediaItems.map((item, itemIndex) => (
                          <div className={styles.mediaItem} key={item.id || `${action.id}-${itemIndex}`}>
                            <label>
                              Type
                              <select
                                value={item.type}
                                onChange={(event) => updateMediaItem(action.id, item.id, { type: event.target.value as MediaType })}
                              >
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                                <option value="pdf">PDF</option>
                              </select>
                            </label>
                            <div className={styles.mediaUploadCell}>
                              <span>Media file</span>
                              <label
                                className={`${styles.fileUpload} ${draggingMediaId === item.id ? styles.fileUploadDragging : ""}`}
                                onDragEnter={(event) => handleMediaDrag(event, item.id)}
                                onDragOver={(event) => handleMediaDrag(event, item.id)}
                                onDragLeave={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setDraggingMediaId("");
                                }}
                                onDrop={(event) => handleMediaDrop(event, action.id, item)}
                              >
                                <input
                                  accept={mediaAccept()}
                                  multiple
                                  type="file"
                                  onChange={(event) => {
                                    void uploadMediaFiles(action.id, item, event.target.files);
                                    event.currentTarget.value = "";
                                  }}
                                />
                                <strong>{uploadingMediaId === item.id ? "Uploading..." : item.url ? "Add more files" : "Upload file"}</strong>
                                <small>{item.fileName || (item.url ? "Drop or choose more files" : `Drop or choose ${mediaDropText(item.type)}`)}</small>
                              </label>
                              {(item.fileName || item.sizeBytes) && (
                                <em>{[item.contentType, formatFileSize(item.sizeBytes)].filter(Boolean).join(" | ")}</em>
                              )}
                              {item.url && (
                                <span
                                  className={styles.mediaPreview}
                                  style={item.type === "image" ? { backgroundImage: `url("${item.url}")` } : undefined}
                                >
                                  {item.type === "video" ? "HD video ready" : item.type === "pdf" ? "PDF ready" : ""}
                                </span>
                              )}
                            </div>
                            <label>
                              Caption
                              <input
                                value={item.caption || ""}
                                onChange={(event) => updateMediaItem(action.id, item.id, { caption: event.target.value })}
                                placeholder={itemIndex === 0 ? "Optional caption" : "Optional caption"}
                              />
                            </label>
                            <button className={styles.textButton} type="button" onClick={() => removeMediaItem(action.id, item.id)}>
                              Remove
                            </button>
                          </div>
                        ))}
                        <div className={styles.mediaButtons}>
                          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "image")}>
                            Add image
                          </button>
                          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "video")}>
                            Add video
                          </button>
                          <button className={styles.secondaryButton} type="button" onClick={() => addMediaItem(action.id, "pdf")}>
                            Add PDF
                          </button>
                        </div>
                      </div>
                    </>
                  ) : action.type === "Update Status" ? (
                    <label>
                      Customer status
                      <select value={customerStatuses.includes(action.message as typeof customerStatuses[number]) ? action.message : ""} onChange={(event) => updateAction(action.id, { message: event.target.value })}>
                        <option value="">Choose status</option>
                        {customerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Message or instruction
                      <textarea
                        value={action.message}
                        onChange={(event) => updateAction(action.id, { message: event.target.value })}
                        placeholder="Write the message, status update, or note for this action."
                        rows={5}
                      />
                    </label>
                  )}
                </section>
              </div>
            ))}

            <button className={styles.addActionButton} onClick={addAction}>
              Add action
            </button>
          </div>

          <div className={styles.formActions}>
            <button className={styles.primaryButton} onClick={saveFlow} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setEditingId("");
                setForm(emptyFlowForm());
                setSelectedCanvasNodeId("trigger");
                setScreenMode("library");
              }}
            >
              Clear
            </button>
          </div>
        </section>
        )}

        {screenMode === "builder" && false && (
        <section className={styles.flowList}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Saved flows</p>
              <h2>Automation library</h2>
              {selectedFlowIds.length > 0 && (
                <span className={styles.selectionStatus}>{selectedFlowIds.length} selected</span>
              )}
            </div>
            <button className={styles.secondaryButton} disabled={saving} onClick={createFolder}>
              Create group
            </button>
          </div>

          <section className={styles.healthPanel}>
            {[
              ["Total", healthSummary.total],
              ["Active", healthSummary.active],
              ["Draft", healthSummary.draft],
              ["Unlinked", healthSummary.unlinked],
              ["Duplicate names", healthSummary.duplicateCandidates],
              ["No notes", healthSummary.withoutNotes],
            ].map(([label, value]) => (
              <div className={styles.healthMetric} key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>

          <section className={styles.journeyMap}>
            <div className={styles.journeyHeader}>
              <strong>Customer journey map</strong>
              <span>Language selection {"->"} English / Malay {"->"} Intro {"->"} Product choices {"->"} Shipping {"->"} Order summary {"->"} Follow-up</span>
            </div>
            <div className={styles.journeySteps}>
              {JOURNEY_STAGES.map((stage) => {
                const stageFlows = flows.filter((flow) => flowAnalysis.get(flow.id)?.stage === stage);
                return (
                  <div className={styles.journeyStep} key={stage}>
                    <strong>{stage}</strong>
                    <span>{stageFlows.length} flows</span>
                    <small>
                      {stageFlows.slice(0, 3).map((flow) => flowAnalysis.get(flow.id)?.displayName || flow.name).join(" / ") || "No flow"}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.libraryControls}>
            <input
              aria-label="Search flows"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search flow, branch, trigger, folder..."
              value={searchTerm}
            />
            <select aria-label="Language filter" onChange={(event) => setLanguageFilter(event.target.value)} value={languageFilter}>
              <option value="all">All languages</option>
              <option value="EN">English</option>
              <option value="MS">Malay</option>
              <option value="Any">Any language</option>
            </select>
            <select aria-label="Status filter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
            </select>
            <select aria-label="Trigger filter" onChange={(event) => setTriggerFilter(event.target.value)} value={triggerFilter}>
              <option value="all">All triggers</option>
              <option value="keywords">Trigger phrases</option>
              <option value="click">Inbox button</option>
              <option value="first_message">First message</option>
              <option value="selection_button">Selection button</option>
            </select>
            <select aria-label="Group filter" onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}>
              <option value="all">All groups</option>
              {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <label className={styles.attentionToggle}>
              <input checked={needsAttentionOnly} onChange={(event) => setNeedsAttentionOnly(event.target.checked)} type="checkbox" />
              Needs attention
            </label>
            <div className={styles.viewToggle}>
              <button className={libraryView === "chart" ? styles.toggleActive : ""} onClick={() => setLibraryView("chart")} type="button">Flow chart</button>
              <button className={libraryView === "list" ? styles.toggleActive : ""} onClick={() => setLibraryView("list")} type="button">List</button>
            </div>
          </section>

          {libraryView === "list" ? (
            <section className={styles.flatList}>
              {filteredFlows.map((flow) => renderFlowCard(flow))}
            </section>
          ) : flowGroups.map((group) => {
            const groupKey = `group:${group.name}`;
            const directFlows = group.flows.filter((flow) => filteredFlowIds.has(flow.id));
            const visibleSubgroups = group.subgroups.filter((subgroup) => subfolderFlows(subgroup).some((flow) => filteredFlowIds.has(flow.id)));
            const totalFlows = group.flows.length + group.subgroups.reduce((total, subgroup) => total + subfolderFlows(subgroup).length, 0);
            const visibleTotal = directFlows.length + visibleSubgroups.reduce((total, subgroup) => total + subfolderFlows(subgroup).filter((flow) => filteredFlowIds.has(flow.id)).length, 0);
            const isOpen = expandedFolderKeys.includes(groupKey) || searchTerm || needsAttentionOnly || visibleTotal !== totalFlows;
            if (!visibleTotal && filteredFlows.length !== flows.length) return null;
            return (
              <section
                className={`${styles.folderNode} ${dropTargetKey === groupKey ? styles.dropReady : ""}`}
                key={group.name}
                {...dropZoneHandlers(groupKey, group.name)}
              >
                <div className={styles.folderRow}>
                  <div>
                    <button className={styles.folderTitleButton} onClick={() => toggleFolder(groupKey)} type="button">
                      {isOpen ? "v" : ">"} {titleCaseLabel(cleanCopySuffix(group.name))}
                    </button>
                    <span>
                      {visibleTotal === totalFlows ? totalFlows : `${visibleTotal} of ${totalFlows}`} flows
                    </span>
                  </div>
                  <div className={styles.folderActions}>
                    <button disabled={saving} onClick={() => void renameGroup(group)}>
                      Rename
                    </button>
                    <button disabled={saving} onClick={() => createSubfolder(group.name)}>
                      New subfolder
                    </button>
                    <button disabled={saving} onClick={() => void duplicateGroup(group)}>
                      Duplicate
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className={styles.folderChildren}>
                    {libraryView === "chart"
                      ? renderFlowChartWorkspace(titleCaseLabel(cleanCopySuffix(group.name)), directFlows, dropZoneHandlers(groupKey, group.name))
                      : directFlows.map((flow) => renderFlowCard(flow))}
                    {visibleSubgroups.map((subgroup) => renderSubfolder(group.name, subgroup))}
                  </div>
                )}
              </section>
            );
          })}

          {!loading && flows.length > 0 && filteredFlows.length === 0 && (
            <div className={styles.emptyState}>
              <h3>No matching flows</h3>
              <p>Adjust the filters to see more of the automation library.</p>
            </div>
          )}

          {loading && (
            <div className={styles.emptyState}>
              <h3>Loading flows...</h3>
              <p>Your shared WhatsApp flows are loading.</p>
            </div>
          )}

          {!loading && !flows.length && (
            <div className={styles.emptyState}>
              <h3>No flows yet</h3>
              <p>Use a template or create your own WhatsApp sales flow.</p>
            </div>
          )}
        </section>
        )}
      </section>
      {pendingSelectionRemoval && (
        <div className={styles.selectionPreserveOverlay} role="presentation">
          <section aria-labelledby="preserve-selection-title" className={styles.selectionPreserveDialog} role="dialog" aria-modal="true">
            <h2 id="preserve-selection-title">Keep one option’s actions</h2>
            <p>Removing this Ask Selection will replace it with the inline actions from the option you keep.</p>
            <div className={styles.selectionPreserveChoices}>
              {pendingSelectionRemoval.options.map((option) => {
                const actionCount = (option.actions || []).length;
                return (
                  <button
                    disabled={!actionCount}
                    key={option.id}
                    onClick={() => preserveSelectionOption(option.id || "")}
                    type="button"
                  >
                    <strong>{option.label || "Unnamed option"}</strong>
                    <span>{actionCount ? `Keep ${actionCount} inline action${actionCount === 1 ? "" : "s"}` : "No inline actions to keep"}</span>
                  </button>
                );
              })}
            </div>
            <button className={styles.secondaryButton} onClick={() => setPendingSelectionRemoval(null)} type="button">Cancel</button>
          </section>
        </div>
      )}
    </main>
  );
}
