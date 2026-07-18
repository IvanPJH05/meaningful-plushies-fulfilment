export type WhatsAppAssistantMessage = {
  direction: "customer" | "assistant" | "team" | "system";
  body: string;
};

export type WhatsAppAssistantInput = {
  customerName?: string;
  customerPhone?: string;
  latestMessage: string;
  recentMessages?: WhatsAppAssistantMessage[];
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

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
  return [
    "You are the WhatsApp sales assistant for Meaningful Plushies.",
    "Write one concise, friendly reply that can be sent directly on WhatsApp.",
    "Keep the reply under 900 characters unless the customer asks for detailed help.",
    "Use simple English or Malay if the customer writes Malay. Mirror the customer's language where practical.",
    "You sell personalized plushies with recorded voice messages and certificate details.",
    "Do not say payment is confirmed unless the message clearly includes confirmation from the business, not just the customer claiming they paid.",
    "Do not create or promise a Shopify checkout link yourself. If payment looks paid, say the team will verify it and send the checkout link.",
    "If the customer asks what details are needed, ask for plush name, gender, birth date, birth place, favourite person, belongs to, and meaningful note.",
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

  return [
    history ? `Recent conversation:\n${history}` : "",
    `Latest customer message:\n${input.latestMessage.trim()}`,
  ].filter(Boolean).join("\n\n");
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
      input: buildWhatsAppAssistantInput(input),
      max_output_tokens: 450,
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
