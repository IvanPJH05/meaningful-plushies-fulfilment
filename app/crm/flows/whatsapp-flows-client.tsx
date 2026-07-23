"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

import styles from "./whatsapp-flows.module.css";

type WhatsAppFlow = {
  id: string;
  name: string;
  triggerType?: TriggerType;
  triggerButtonLabel?: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  steps: FlowStep[];
  updatedAt: string;
};

type TriggerType = "keywords" | "click" | "first_message" | "selection_button";
type MediaType = "image" | "video" | "pdf";
type ActionType = "Send Message" | "Send Media" | "Ask Selection" | "AI Reply" | "Update Status" | "Add Note";
type StoredActionType = ActionType | "Send Image" | "Send Video";
type DelayUnit = "seconds" | "minutes" | "hours" | "days";

type SelectionOption = {
  id?: string;
  label: string;
  followUpMessage: string;
  targetFlowId?: string;
  targetFlowName?: string;
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
  options?: SelectionOption[];
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
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  actions: FlowAction[];
};

const actionTypes: ActionType[] = ["Send Message", "Send Media", "Ask Selection", "AI Reply", "Update Status", "Add Note"];
const delayUnits: DelayUnit[] = ["seconds", "minutes", "hours", "days"];
const FLOW_BUILDER_CACHE_KEY = "crm-whatsapp-flow-builder-cache-v1";
const MAX_BROWSER_IMAGE_BYTES = 3.8 * 1024 * 1024;
const MAX_WHATSAPP_VIDEO_BYTES = 16 * 1024 * 1024;
const MAX_WHATSAPP_DOCUMENT_BYTES = 100 * 1024 * 1024;
const MAX_FLOW_IMAGE_EDGE = 1800;
const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

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

let flowBuilderMemoryCache: FlowBuilderCache | null = null;

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

function makeMediaItem(media?: Partial<FlowMediaItem>): FlowMediaItem {
  return {
    id: makeId(),
    type: media?.type === "video" ? "video" : "image",
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
  };
}

function makeAction(action?: Partial<FlowAction>): FlowAction {
  const type = action?.type || "Send Message";
  return {
    id: makeId(),
    type,
    delayValue: action?.delayValue ?? "0",
    delayUnit: action?.delayUnit || "minutes",
    message: action?.message || "",
    mediaItems: action?.mediaItems?.length ? action.mediaItems.map(makeMediaItem) : (type === "Send Media" ? [makeMediaItem()] : []),
    options: action?.options?.length
      ? action.options.slice(0, 3).map(makeSelectionOption)
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
    trigger: "",
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
    };
  }
  return { ...form, triggerType };
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
    trigger: typeof form.trigger === "string" ? form.trigger : "",
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

const starterTemplates: FlowForm[] = [
  {
    name: "New customer details",
    triggerType: "click",
    triggerButtonLabel: "Ask details",
    trigger: "interested, price, details",
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
    trigger: "paid, payment done, transfer",
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
    trigger: "tracking, order, update",
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
  return delayUnits.find((unit) => unit === value.toLowerCase()) || "minutes";
}

function mediaItemsFromStep(step: FlowStep): FlowMediaItem[] {
  const items = Array.isArray(step.mediaItems) ? step.mediaItems : [];
  const seen = new Set<string>();
  const mediaItems = items
    .map((item) => makeMediaItem({
      type: item.type,
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

function actionFromStep(step: FlowStep | string): FlowAction {
  if (typeof step !== "string") {
    const type = normaliseActionType(step.type);
    return makeAction({
      type,
      delayValue: step.delayValue ?? "0",
      delayUnit: normaliseDelayUnit(step.delayUnit),
      message: step.message || "",
      mediaItems: type === "Send Media" ? mediaItemsFromStep(step) : [],
      options: type === "Ask Selection" && Array.isArray(step.options) ? step.options.map(makeSelectionOption) : [],
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
    trigger: flow.trigger,
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
    }))
    .filter((option) => option.label)
    .slice(0, 3);

  if (action.type === "Ask Selection" && (!message || !options.length)) return null;
  if (action.type === "Send Media" && !mediaItems.length) return null;
  if (action.type !== "Send Media" && action.type !== "AI Reply" && !message) return null;
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
  return {
    id,
    name: form.name.trim(),
    triggerType: form.triggerType,
    triggerButtonLabel: form.triggerButtonLabel.trim(),
    trigger: form.trigger.trim(),
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

function actionPreview(action: FlowAction) {
  const delay = Math.max(0, Number(action.delayValue) || 0);
  return delay > 0 ? `${delay} ${action.delayUnit}` : "No delay";
}

function actionSummary(action: FlowAction) {
  if (action.type === "Send Media") {
    const mediaCount = action.mediaItems.filter((item) => item.url.trim()).length;
    return mediaCount ? `${mediaCount} media item${mediaCount === 1 ? "" : "s"}` : "No media added yet";
  }
  if (action.type === "Ask Selection") {
    const optionCount = action.options.filter((option) => option.label.trim()).length;
    const linkedCount = action.options.filter((option) => option.label.trim() && (option.targetFlowId || option.targetFlowName)).length;
    return optionCount ? `${optionCount} option${optionCount === 1 ? "" : "s"} | ${linkedCount} linked flow${linkedCount === 1 ? "" : "s"}` : "No options yet";
  }
  return action.message || "No message yet";
}

function triggerSummary(flow: Pick<WhatsAppFlow, "name" | "triggerType" | "triggerButtonLabel" | "trigger">) {
  const triggerType = normaliseTriggerType(flow.triggerType);
  if (triggerType === "click") return `Button: ${flow.triggerButtonLabel || flow.name}`;
  if (triggerType === "first_message") return "First customer message";
  if (triggerType === "selection_button") return "Selection button press";
  return `Trigger: ${flow.trigger || "Keywords"}`;
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
  const [uploadingMediaId, setUploadingMediaId] = useState("");
  const [draggingMediaId, setDraggingMediaId] = useState("");

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

  async function saveFlow() {
    if (!form.name.trim() || !hasUsableAction) return;
    if (form.status === "Active" && form.triggerType === "selection_button") {
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
        return;
      }
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/flows", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(flowPayloadFromForm(form, editingId || undefined)),
      });
      const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
      if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be saved.");
      setFlows((current) => {
        if (editingId) return current.map((flow) => (flow.id === editingId ? (result.flow as WhatsAppFlow) : flow));
        return [result.flow as WhatsAppFlow, ...current];
      });
      setForm(emptyFlowForm());
      setEditingId("");
      setNotice("Flow saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function editFlow(flow: WhatsAppFlow) {
    setEditingId(flow.id);
    setForm(formFromFlow(flow));
  }

  async function duplicateFlow(flow: WhatsAppFlow) {
    setSaving(true);
    setNotice("");
    try {
      const duplicateForm = {
        ...formFromFlow(flow),
        name: `${flow.name} Copy`,
        status: "Draft" as const,
      };
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
      setNotice(`Duplicated "${flow.name}" as a draft.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be duplicated.");
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
          applyUploadedMediaItems(actionId, uploadedItems.length === 1 ? mediaId : undefined, [uploadedItem]);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `${file.name} could not be uploaded.`);
        }
      }

      if (!uploadedItems.length) {
        throw new Error(failures[0] || "Media could not be uploaded.");
      }
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

  function mediaAccept() {
    return "image/*,video/*,application/pdf,.pdf";
  }

  function mediaDropText(type: MediaType) {
    if (type === "video") return "one or more HD videos";
    if (type === "pdf") return "one or more PDFs";
    return "one or more images";
  }

  function removeAction(actionId: string) {
    setForm((current) => {
      if (current.actions.length === 1) return current;
      return { ...current, actions: current.actions.filter((action) => action.id !== actionId) };
    });
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

  function loadTemplate(template: FlowForm) {
    setEditingId("");
    setForm(cloneTemplate(template));
  }

  return (
    <main className={styles.page}>
      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a href="/crm/inbox">Inbox</a>
          <a className={styles.railActive} href="/crm/flows">Flows</a>
          <a href="/crm/test-ai">Test AI</a>
          <a href="/crm/setup">Setup</a>
        </aside>

        <section className={styles.builder}>
          <div className={styles.builderHeader}>
            <div>
              <p className={styles.eyebrow}>Flow Builder</p>
              <h1>{editingId ? "Edit flow" : "Create flow"}</h1>
            </div>
            <span>{loading ? "Loading..." : `${flows.length} flows | ${activeCount} active`}</span>
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
                  <label>
                    Trigger words
                    <input
                      value={form.trigger}
                      onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}
                      placeholder="Example: price, interested, details"
                    />
                  </label>
                )}
              </div>

              <p className={styles.helperText}>
                {form.triggerType === "click"
                  ? "This flow appears as a quick button in the inbox. Click it to send the message sequence."
                  : form.triggerType === "first_message"
                    ? "This flow runs automatically when a customer sends their first message in a new chat."
                  : form.triggerType === "selection_button"
                    ? "This flow runs when it is selected in another flow's Ask Selection action. The button key is handled automatically."
                  : "The flow can run when a WhatsApp message contains one of these words."}
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

            <section className={styles.workflowPreview}>
              <strong>Workflow preview</strong>
              <div className={styles.branchList}>
                <span>{form.triggerType === "first_message" ? "First message" : form.triggerType === "selection_button" ? "Selection button" : form.triggerType === "click" ? "Inbox button" : "Trigger words"}</span>
                {form.actions.map((action, index) => (
                  <span key={`preview-${action.id}`}>
                    {index + 1}. {action.type}
                    {action.type === "Ask Selection"
                      ? ` -> ${action.options.filter((option) => option.label.trim()).map((option) => {
                        const target = option.targetFlowName || flows.find((flow) => flow.id === option.targetFlowId)?.name || "";
                        return `${option.label.trim()}${target ? ` -> ${target}` : ""}`;
                      }).join(" / ") || "Options"}`
                      : ""}
                  </span>
                ))}
              </div>
            </section>

            {form.actions.map((action, index) => (
              <div className={styles.actionWrap} key={action.id}>
                <div className={styles.nodeConnector}>Then</div>
                <section className={styles.actionNode}>
                  <div className={styles.actionHeader}>
                    <div>
                      <span className={styles.nodeBadge}>Action {index + 1}</span>
                      <h3>{action.type}</h3>
                    </div>
                    <div className={styles.actionControls}>
                      <button className={styles.textButton} type="button" onClick={() => moveAction(action.id, -1)} disabled={index === 0}>
                        Move up
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => moveAction(action.id, 1)} disabled={index === form.actions.length - 1}>
                        Move down
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => removeAction(action.id)} disabled={form.actions.length === 1}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className={styles.delayGrid}>
                    <label>
                      Delay
                      <input
                        min="0"
                        type="number"
                        value={action.delayValue}
                        onChange={(event) => updateAction(action.id, { delayValue: event.target.value })}
                      />
                    </label>
                    <label>
                      Time
                      <select
                        value={action.delayUnit}
                        onChange={(event) => updateAction(action.id, { delayUnit: event.target.value as DelayUnit })}
                      >
                        {delayUnits.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Action
                      <select
                        value={action.type}
                        onChange={(event) => {
                          const nextType = event.target.value as ActionType;
                    updateAction(action.id, {
                      type: nextType,
                      mediaItems: nextType === "Send Media" && !action.mediaItems.length ? [makeMediaItem()] : action.mediaItems,
                      options: nextType === "Ask Selection" && !action.options.length ? [
                        makeSelectionOption({ label: "English" }),
                        makeSelectionOption({ label: "Malay" }),
                      ] : action.options,
                    });
                  }}
                >
                        {actionTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
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
                        {action.options.map((option, optionIndex) => (
                          <div className={styles.optionItem} key={option.id || `${action.id}-option-${optionIndex}`}>
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
                                onChange={(event) => updateAction(action.id, {
                                  options: action.options.map((current) => (
                                    current.id === option.id ? {
                                      ...current,
                                      targetFlowId: event.target.value,
                                      targetFlowName: flows.find((flow) => flow.id === event.target.value)?.name || "",
                                      id: flows.find((flow) => flow.id === event.target.value && normaliseTriggerType(flow.triggerType) === "selection_button")?.triggerButtonLabel || current.id,
                                    } : current
                                  )),
                                })}
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
                              <small>
                                {option.targetFlowId
                                  ? `Linked by key ${option.id}. The target flow will use this key automatically.`
                                  : `Option key: ${option.id}. Choose a target flow to link this button.`}
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
                        ))}
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
                                <strong>{uploadingMediaId === item.id ? "Uploading..." : item.url ? "Replace file" : "Upload file"}</strong>
                                <small>{item.fileName || (item.url ? "Drop to replace, or choose another file" : `Drop or choose ${mediaDropText(item.type)}`)}</small>
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
            <button className={styles.primaryButton} onClick={saveFlow} disabled={saving || !form.name.trim() || !hasUsableAction}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create flow"}
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setEditingId("");
                setForm(emptyFlowForm());
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <section className={styles.flowList}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Saved flows</p>
              <h2>Automation library</h2>
            </div>
          </div>

          {flows.map((flow) => (
            <article className={styles.flowCard} key={flow.id}>
              <div className={styles.flowTopline}>
                <div>
                  <h3>{flow.name}</h3>
                  <p>{flow.description || "No notes yet."}</p>
                </div>
                <span className={flow.status === "Active" ? styles.activeBadge : styles.draftBadge}>{flow.status}</span>
              </div>

              <div className={styles.flowMeta}>
                <span>{triggerSummary(flow)}</span>
                <strong>{flow.steps.length} actions</strong>
              </div>

              {normaliseTriggerType(flow.triggerType) === "selection_button" && (
                <div className={styles.linkedFlowSummary}>
                  {selectionLinks.filter((link) => link.targetFlowId === flow.id).length ? (
                    selectionLinks
                      .filter((link) => link.targetFlowId === flow.id)
                      .map((link) => (
                        <span key={`${flow.id}-${link.sourceFlowId}-${link.optionKey}`}>
                          Linked from {link.sourceFlowName} / {link.optionLabel}
                        </span>
                      ))
                  ) : (
                    <span>Not linked yet. Select this flow inside an Ask Selection option.</span>
                  )}
                </div>
              )}

              <div className={styles.actionTimeline}>
                {flow.steps.map((step, index) => {
                  const parsed = actionFromStep(step);
                  return (
                    <div className={styles.previewAction} key={`${flow.id}-${index}`}>
                      <span>{actionPreview(parsed)}</span>
                      <div>
                        <strong>{parsed.type}</strong>
                        <p>{actionSummary(parsed)}</p>
                        {parsed.type === "Send Media" && parsed.message && <p>{parsed.message}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.cardActions}>
                <button onClick={() => editFlow(flow)}>Edit</button>
                <button disabled={saving} onClick={() => void duplicateFlow(flow)}>
                  Duplicate
                </button>
                <button disabled={saving} onClick={() => void deleteFlow(flow.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}

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
      </section>
    </main>
  );
}
