export type NormalizedWhatsAppMessage = {
  messageId: string;
  waId: string;
  phoneNumberId: string;
  displayName: string;
  messageType: "text" | "image" | "audio" | "video" | "document" | "unknown";
  text: string;
  timestamp: Date;
  raw: Record<string, unknown>;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function messageText(message: Record<string, unknown>) {
  const type = textValue(message.type);
  if (type === "text") return textValue(objectValue(message.text).body);
  if (type === "button") return textValue(objectValue(message.button).text);
  if (type === "interactive") {
    const interactive = objectValue(message.interactive);
    return textValue(objectValue(interactive.button_reply).title) || textValue(objectValue(interactive.list_reply).title);
  }
  return "";
}

function messageType(message: Record<string, unknown>): NormalizedWhatsAppMessage["messageType"] {
  const type = textValue(message.type);
  if (["text", "image", "audio", "video", "document"].includes(type)) {
    return type as NormalizedWhatsAppMessage["messageType"];
  }
  return "unknown";
}

export function normalizeWhatsAppWebhookPayload(payload: unknown): NormalizedWhatsAppMessage[] {
  const messages: NormalizedWhatsAppMessage[] = [];
  for (const entry of arrayValue(objectValue(payload).entry)) {
    for (const change of arrayValue(objectValue(entry).changes)) {
      const value = objectValue(objectValue(change).value);
      const metadata = objectValue(value.metadata);
      const phoneNumberId = textValue(metadata.phone_number_id);
      const contacts = new Map(
        arrayValue(value.contacts).map((contact) => {
          const row = objectValue(contact);
          return [textValue(row.wa_id), textValue(objectValue(row.profile).name)] as const;
        }),
      );

      for (const item of arrayValue(value.messages)) {
        const message = objectValue(item);
        const waId = textValue(message.from);
        const timestampSeconds = Number(textValue(message.timestamp));
        messages.push({
          messageId: textValue(message.id),
          waId,
          phoneNumberId,
          displayName: contacts.get(waId) ?? "",
          messageType: messageType(message),
          text: messageText(message),
          timestamp: Number.isFinite(timestampSeconds) ? new Date(timestampSeconds * 1000) : new Date(),
          raw: message,
        });
      }
    }
  }
  return messages;
}
