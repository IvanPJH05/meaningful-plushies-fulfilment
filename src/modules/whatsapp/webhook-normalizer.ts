export type NormalizedWhatsAppMessage = {
  messageId: string;
  waId: string;
  phoneNumberId: string;
  displayName: string;
  direction: "inbound" | "outbound";
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

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value).trim();
    if (text) return text;
  }
  return "";
}

function dateFromValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000);
  }

  const text = textValue(value).trim();
  if (!text) return new Date();

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function messageText(message: Record<string, unknown>) {
  const type = textValue(message.type);
  if (type === "text") return textValue(message.text) || textValue(objectValue(message.text).body);
  if (type === "button") return textValue(objectValue(message.button).text);
  if (type === "interactive") {
    const interactive = objectValue(message.interactive);
    return textValue(objectValue(interactive.button_reply).title) || textValue(objectValue(interactive.list_reply).title);
  }
  if (type === "image") return textValue(objectValue(message.image).caption);
  if (type === "video") return textValue(objectValue(message.video).caption);
  if (type === "document") return textValue(objectValue(message.document).caption) || textValue(objectValue(message.document).filename);
  return firstTextValue(message.text, objectValue(message.text).body, message.body, message.message, message.caption);
}

function messageType(message: Record<string, unknown>): NormalizedWhatsAppMessage["messageType"] {
  const type = textValue(message.type);
  if (["text", "image", "audio", "video", "document"].includes(type)) {
    return type as NormalizedWhatsAppMessage["messageType"];
  }
  if (firstTextValue(message.text, objectValue(message.text).body, message.body)) return "text";
  return "unknown";
}

function messageId(message: Record<string, unknown>) {
  return firstTextValue(
    message.id,
    message.wamid,
    message.message_id,
    message.messageId,
    objectValue(message.context).message_id,
    objectValue(message.context).id,
  );
}

function profileName(message: Record<string, unknown>) {
  const profile = objectValue(message.customerProfile);
  return firstTextValue(profile.name, profile.username, message.profile_name, message.displayName);
}

function normalizePhone(value: unknown) {
  return textValue(value).replace(/^\+/, "").trim();
}

export function normalizeWhatsAppWebhookPayload(payload: unknown): NormalizedWhatsAppMessage[] {
  const messages: NormalizedWhatsAppMessage[] = [];
  const seen = new Set<string>();

  function addMessage(input: {
    message: Record<string, unknown>;
    waId: string;
    phoneNumberId: string;
    displayName?: string;
    direction: NormalizedWhatsAppMessage["direction"];
    fallbackTimestamp?: unknown;
  }) {
    const id = messageId(input.message);
    const waId = normalizePhone(input.waId);
    if (!id || !waId) return;

    const key = `${input.direction}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);

    messages.push({
      messageId: id,
      waId,
      phoneNumberId: input.phoneNumberId,
      displayName: input.displayName || profileName(input.message),
      direction: input.direction,
      messageType: messageType(input.message),
      text: messageText(input.message),
      timestamp: dateFromValue(input.message.timestamp ?? input.message.sendTime ?? input.message.createTime ?? input.fallbackTimestamp),
      raw: input.message,
    });
  }

  function scanProviderStyleEvent(value: Record<string, unknown>, fallbackPhoneNumberId = "", fallbackTimestamp?: unknown) {
    const inbound = objectValue(value.whatsappInboundMessage);
    if (Object.keys(inbound).length) {
      addMessage({
        message: inbound,
        waId: firstTextValue(inbound.from, inbound.fromUserId),
        phoneNumberId: fallbackPhoneNumberId,
        displayName: profileName(inbound),
        direction: "inbound",
        fallbackTimestamp,
      });
    }

    const outbound = objectValue(value.whatsappMessage);
    if (Object.keys(outbound).length) {
      addMessage({
        message: outbound,
        waId: firstTextValue(outbound.to, outbound.toUserId),
        phoneNumberId: fallbackPhoneNumberId,
        displayName: profileName(outbound),
        direction: "outbound",
        fallbackTimestamp,
      });
    }
  }

  function scanNestedProviderEvents(value: unknown, fallbackPhoneNumberId = "", fallbackTimestamp?: unknown, depth = 0) {
    if (depth > 5) return;
    const object = objectValue(value);
    if (!Object.keys(object).length) return;

    scanProviderStyleEvent(object, fallbackPhoneNumberId, fallbackTimestamp);

    for (const child of Object.values(object)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          scanNestedProviderEvents(item, fallbackPhoneNumberId, fallbackTimestamp, depth + 1);
        }
      } else if (child && typeof child === "object") {
        scanNestedProviderEvents(child, fallbackPhoneNumberId, fallbackTimestamp, depth + 1);
      }
    }
  }

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
        addMessage({
          message,
          waId,
          phoneNumberId,
          displayName: contacts.get(waId) ?? "",
          direction: "inbound",
        });
      }

      for (const item of arrayValue(value.message_echoes)) {
        const message = objectValue(item);
        const waId = firstTextValue(message.to, message.recipient_id);
        addMessage({
          message,
          waId,
          phoneNumberId,
          displayName: profileName(message),
          direction: "outbound",
        });
      }

      for (const item of arrayValue(value.history)) {
        scanNestedProviderEvents(item, phoneNumberId, value.timestamp);
      }

      scanNestedProviderEvents(value, phoneNumberId, value.timestamp);
    }
  }

  scanNestedProviderEvents(payload, "", objectValue(payload).createTime);

  return messages;
}
