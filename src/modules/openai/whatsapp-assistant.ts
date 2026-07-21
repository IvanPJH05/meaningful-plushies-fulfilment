export type WhatsAppAssistantMessage = {
  direction: "customer" | "assistant" | "team" | "system";
  body: string;
};

export type WhatsAppAssistantMedia = {
  name?: string;
  contentType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  note?: string;
};

export type WhatsAppAssistantTraining = {
  enabled: boolean;
  requiresHumanReview: boolean;
  brandVoice: string;
  businessFacts: string;
  productGuide: string;
  replyRules: string;
  faq: string;
  exampleReplies: string;
};

export type WhatsAppAssistantInput = {
  customerName?: string;
  customerPhone?: string;
  latestMessage: string;
  recentMessages?: WhatsAppAssistantMessage[];
  media?: WhatsAppAssistantMedia[];
  training?: Partial<WhatsAppAssistantTraining>;
};

export type WhatsAppAssistantResult = {
  ok: boolean;
  reply?: string;
  model?: string;
  raw?: unknown;
  error?: string;
  reason?: "missing_openai_api_key" | "empty_message";
};

export const defaultWhatsAppAssistantModel = "gpt-5.6-sol";
export const whatsappAssistantConfigName = "whatsapp_sales_assistant";
export const whatsappAssistantConfigVersion = 1;

export const defaultWhatsAppAssistantTraining: WhatsAppAssistantTraining = {
  enabled: true,
  requiresHumanReview: true,
  brandVoice: [
    "Friendly, warm, simple, and helpful.",
    "Mirror the customer's language when practical. If they use Malay, reply in natural Malay or Manglish.",
    "Keep replies short enough for WhatsApp unless the customer asks for details.",
  ].join("\n"),
  businessFacts: [
    "Meaningful Plushies sells personalized plushies with a recorded voice message and certificate details.",
    "Customers normally need to provide plush name, gender, birth date, birth place, favourite person, belongs to, and meaningful note.",
    "The team creates Shopify checkout or detail links after payment is checked.",
  ].join("\n"),
  productGuide: [
    "Main characters: Billy, Tootsie, Hunnie, and Dragon Warrior.",
    "Voice lengths: 5 seconds, 10 seconds, and 20 seconds.",
    "If the customer is choosing, ask what character and voice length they prefer.",
  ].join("\n"),
  replyRules: [
    "Do not say payment is confirmed unless the business/team has confirmed it.",
    "Do not invent order status, tracking numbers, discounts, stock, or delivery promises.",
    "Do not create or promise a checkout link yourself. If payment looks paid, say the team will verify it and send the link.",
    "If the customer asks a question you cannot answer safely, ask the team to check and keep the customer reassured.",
  ].join("\n"),
  faq: [
    "If the customer asks what details are needed, ask for: plush name, gender, birth date, birth place, favourite person, belongs to, and meaningful note.",
    "If the customer says they paid, thank them and say the team will verify payment.",
  ].join("\n"),
  exampleReplies: [
    "Hi! Can I get the plushie details? Name, gender, birth date, birth place, favourite person, belongs to, and meaningful note.",
    "Thank you! I will get the team to verify the payment first, then we will send the Shopify link for the details.",
  ].join("\n\n"),
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeWhatsAppAssistantTraining(value?: Partial<WhatsAppAssistantTraining> | null): WhatsAppAssistantTraining {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: booleanValue(source.enabled, defaultWhatsAppAssistantTraining.enabled),
    requiresHumanReview: booleanValue(source.requiresHumanReview, defaultWhatsAppAssistantTraining.requiresHumanReview),
    brandVoice: stringValue(source.brandVoice, defaultWhatsAppAssistantTraining.brandVoice),
    businessFacts: stringValue(source.businessFacts, defaultWhatsAppAssistantTraining.businessFacts),
    productGuide: stringValue(source.productGuide, defaultWhatsAppAssistantTraining.productGuide),
    replyRules: stringValue(source.replyRules, defaultWhatsAppAssistantTraining.replyRules),
    faq: stringValue(source.faq, defaultWhatsAppAssistantTraining.faq),
    exampleReplies: stringValue(source.exampleReplies, defaultWhatsAppAssistantTraining.exampleReplies),
  };
}

export function parseWhatsAppAssistantTraining(systemPrompt?: string | null): WhatsAppAssistantTraining {
  if (!systemPrompt?.trim()) return defaultWhatsAppAssistantTraining;

  try {
    const parsed = JSON.parse(systemPrompt) as unknown;
    if (parsed && typeof parsed === "object") {
      return normalizeWhatsAppAssistantTraining(parsed as Partial<WhatsAppAssistantTraining>);
    }
  } catch {
    // Older rows may contain a plain prompt. Preserve it as the custom rule block.
  }

  return normalizeWhatsAppAssistantTraining({
    ...defaultWhatsAppAssistantTraining,
    replyRules: systemPrompt,
  });
}

export function serializeWhatsAppAssistantTraining(training: Partial<WhatsAppAssistantTraining>) {
  return JSON.stringify(normalizeWhatsAppAssistantTraining(training));
}

export function crmAiAutoReplyEnabled(input: Record<string, string | undefined> = process.env) {
  return input.CRM_AI_AUTO_REPLY === "true" || input.WHATSAPP_AI_AUTO_REPLY === "true";
}

export function crmAiSuggestEnabled(input: Record<string, string | undefined> = process.env) {
  return input.CRM_AI_SUGGEST_REPLY !== "false";
}

export function openAiConfigured(input: Record<string, string | undefined> = process.env) {
  return Boolean(input.OPENAI_API_KEY);
}

export function whatsappAssistantModel(input: Record<string, string | undefined> = process.env) {
  return input.OPENAI_MODEL || input.CRM_OPENAI_MODEL || defaultWhatsAppAssistantModel;
}

export function buildWhatsAppAssistantInstructions(input: WhatsAppAssistantInput) {
  const customerName = input.customerName?.trim() || "the customer";
  const training = normalizeWhatsAppAssistantTraining(input.training);
  const trainingSections = [
    ["Brand voice", training.brandVoice],
    ["Business facts", training.businessFacts],
    ["Product guide", training.productGuide],
    ["Rules", training.replyRules],
    ["FAQ", training.faq],
    ["Example good replies", training.exampleReplies],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}:\n${value.trim()}`)
    .join("\n\n");

  return [
    "You are the WhatsApp sales assistant for Meaningful Plushies.",
    "Write one concise, friendly reply that can be reviewed and sent directly on WhatsApp.",
    "Keep the reply under 900 characters unless the customer asks for detailed help.",
    "Use simple English or Malay if the customer writes Malay. Mirror the customer's language where practical.",
    "If media is included, use what you can see. If the attachment is not visible to you, mention that the team will check it instead of pretending you saw it.",
    "Never pretend that you performed an action in the system. You can only draft a reply.",
    training.requiresHumanReview ? "The team reviews this suggestion before sending. Do not write as if it was already sent." : "",
    trainingSections ? `Saved training from the business:\n\n${trainingSections}` : "",
    `Customer name: ${customerName}.`,
    input.customerPhone ? `Customer phone: ${input.customerPhone}.` : "",
  ].filter(Boolean).join("\n");
}

export function buildWhatsAppAssistantInput(input: WhatsAppAssistantInput) {
  const history = (input.recentMessages ?? [])
    .map((message) => `${message.direction}: ${compactText(message.body)}`)
    .filter((line) => line.length > 0)
    .slice(-8)
    .join("\n");

  const mediaContext = (input.media ?? [])
    .map((media, index) => {
      const label = [
        media.name ? `name: ${media.name}` : "",
        media.contentType ? `type: ${media.contentType}` : "",
        typeof media.sizeBytes === "number" ? `size: ${media.sizeBytes} bytes` : "",
        media.note ? `note: ${compactText(media.note)}` : "",
        media.dataUrl && media.contentType?.toLowerCase().startsWith("image/") ? "image: visible to the AI" : "",
      ].filter(Boolean).join(", ");
      return `Media ${index + 1}: ${label || "attached media"}`;
    })
    .join("\n");

  return [
    history ? `Recent conversation:\n${history}` : "",
    mediaContext ? `Customer media:\n${mediaContext}` : "",
    `Latest customer message:\n${input.latestMessage.trim()}`,
  ].filter(Boolean).join("\n\n");
}

type ResponseInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" };

function buildResponseInput(input: WhatsAppAssistantInput) {
  const content: ResponseInputContent[] = [
    { type: "input_text", text: buildWhatsAppAssistantInput(input) },
  ];

  for (const media of input.media ?? []) {
    const contentType = media.contentType?.toLowerCase() || "";
    if (media.dataUrl && contentType.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: media.dataUrl,
        detail: "auto",
      });
    }
  }

  if (content.length === 1) {
    return buildWhatsAppAssistantInput(input);
  }

  return [{ role: "user", content }];
}

function textFromResponse(data: unknown) {
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (typeof row.output_text === "string") return row.output_text.trim();

  const output = Array.isArray(row.output) ? row.output : [];
  const textParts: string[] = [];
  for (const item of output) {
    const outputItem = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    for (const contentItem of content) {
      const part = contentItem && typeof contentItem === "object" ? contentItem as Record<string, unknown> : {};
      if (typeof part.text === "string") textParts.push(part.text);
    }
  }
  return textParts.join("\n").trim();
}

export async function createWhatsAppAssistantReply(input: WhatsAppAssistantInput): Promise<WhatsAppAssistantResult> {
  if (!input.latestMessage.trim()) return { ok: false, reason: "empty_message" };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: "missing_openai_api_key" };

  const model = whatsappAssistantModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: buildWhatsAppAssistantInstructions(input),
      input: buildResponseInput(input),
      max_output_tokens: 450,
      truncation: "auto",
    }),
  });

  const data = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? JSON.stringify((data as Record<string, unknown>).error)
      : `OpenAI request failed with status ${response.status}`;
    return { ok: false, model, raw: data, error };
  }

  const reply = textFromResponse(data);
  if (!reply) return { ok: false, model, raw: data, error: "OpenAI returned an empty reply." };

  return { ok: true, model, reply, raw: data };
}
