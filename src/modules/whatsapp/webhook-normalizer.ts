export type NormalizedWhatsAppMessageSource = "messages" | "message_echoes" | "history" | "provider_history";

export type NormalizedWhatsAppMessage = {
  messageId: string;
  waId: string;
  phoneNumberId: string;
  displayName: string;
  direction: "inbound" | "outbound";
  messageType:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "button"
    | "interactive"
    | "reaction"
    | "sticker"
    | "contacts"
    | "location"
    | "order"
    | "system"
    | "unsupported"
    | "unknown";
  text: string;
  media?: {
    id: string;
    mimeType: string;
    sha256: string;
    filename: string;
  };
  timestamp: Date;
  source: NormalizedWhatsAppMessageSource;
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

function titleCaseLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
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
  return whatsAppDisplayTextFromMessage(message);
}

export function whatsAppDisplayTextFromMessage(message: Record<string, unknown>) {
  const type = textValue(message.type).toLowerCase();
  if (type === "text") return textValue(message.text) || textValue(objectValue(message.text).body);
  if (type === "reaction") {
    const reaction = objectValue(message.reaction);
    const emoji = textValue(reaction.emoji).trim();
    return emoji ? `Reacted ${emoji} to a message` : "Removed a reaction";
  }
  if (type === "button") {
    const button = objectValue(message.button);
    const text = firstTextValue(button.text, button.payload);
    return text ? `Tapped button: ${text}` : "Tapped a button";
  }
  if (type === "interactive") {
    const interactive = objectValue(message.interactive);
    const buttonReply = objectValue(interactive.button_reply);
    const listReply = objectValue(interactive.list_reply);
    const nfmReply = objectValue(interactive.nfm_reply);
    const title = firstTextValue(
      buttonReply.title,
      buttonReply.id,
      listReply.title,
      listReply.id,
      nfmReply.name,
      nfmReply.body,
      nfmReply.response_json,
    );
    return title ? `Selected: ${title}` : "Sent an interactive reply";
  }
  if (type === "image") return firstTextValue(objectValue(message.image).caption, "Sent a photo");
  if (type === "video") return firstTextValue(objectValue(message.video).caption, "Sent a video");
  if (type === "audio") return "Sent a voice message";
  if (type === "document") {
    const document = objectValue(message.document);
    const documentText = firstTextValue(document.caption, document.filename, document.file_name, document.name);
    return documentText || "Sent a document";
  }
  if (type === "sticker") return "Sent a sticker";
  if (type === "contacts") {
    const names = arrayValue(message.contacts)
      .map((contact) => {
        const record = objectValue(contact);
        const name = objectValue(record.name);
        return firstTextValue(
          name.formatted_name,
          name.first_name,
          record.name,
          record.wa_id,
        );
      })
      .filter(Boolean);
    return names.length ? `Shared contact: ${names.join(", ")}` : "Shared a contact";
  }
  if (type === "location") {
    const location = objectValue(message.location);
    const place = firstTextValue(
      location.name,
      location.address,
      location.url,
      location.latitude && location.longitude ? `${location.latitude}, ${location.longitude}` : "",
    );
    return place ? `Shared location: ${place}` : "Shared a location";
  }
  if (type === "order") return "Sent an order";
  if (type === "system") {
    const system = objectValue(message.system);
    const details = firstTextValue(system.body, system.type, system.wa_id);
    return details ? `System message: ${details}` : "System message";
  }
  if (type === "unsupported") return "Unsupported WhatsApp message";

  const fallback = firstTextValue(
    message.text,
    objectValue(message.text).body,
    message.body,
    message.message,
    message.caption,
    objectValue(message.error).message,
    ...arrayValue(message.errors).map((error) => objectValue(error).message),
  );
  if (fallback) return fallback;
  return type ? `${titleCaseLabel(type)} message` : "WhatsApp message";
}

function messageType(message: Record<string, unknown>): NormalizedWhatsAppMessage["messageType"] {
  const type = textValue(message.type).toLowerCase();
  if ([
    "text",
    "image",
    "audio",
    "video",
    "document",
    "button",
    "interactive",
    "reaction",
    "sticker",
    "contacts",
    "location",
    "order",
    "system",
    "unsupported",
  ].includes(type)) {
    return type as NormalizedWhatsAppMessage["messageType"];
  }
  if (firstTextValue(message.text, objectValue(message.text).body, message.body)) return "text";
  return "unknown";
}

function messageMedia(message: Record<string, unknown>, type: NormalizedWhatsAppMessage["messageType"]) {
  if (!["image", "audio", "video", "document", "sticker"].includes(type)) return undefined;
  const typedMedia = objectValue(message[type]);
  const genericMedia = objectValue(message.media);
  const media = Object.keys(typedMedia).length ? typedMedia : genericMedia;
  const id = firstTextValue(media.id, media.media_id, media.mediaId, message.media_id, message.mediaId);
  if (!id) return undefined;

  return {
    id,
    mimeType: firstTextValue(media.mime_type, media.mimeType, media.content_type, media.contentType),
    sha256: firstTextValue(media.sha256, media.sha_256),
    filename: firstTextValue(media.filename, media.file_name, media.name),
  };
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
  return textValue(value).replace(/[^\d]/g, "").trim();
}

function messageTimestamp(message: Record<string, unknown>, fallbackTimestamp?: unknown) {
  return dateFromValue(message.timestamp ?? message.sendTime ?? message.createTime ?? message.sent_at ?? fallbackTimestamp);
}

type HistoryContext = {
  phoneNumberId: string;
  businessPhone: string;
  fallbackTimestamp?: unknown;
  contacts: Map<string, string>;
  threadWaId?: string;
};

function explicitDirection(message: Record<string, unknown>): NormalizedWhatsAppMessage["direction"] | null {
  const fromMe = booleanValue(message.from_me ?? message.fromMe ?? message.is_from_me ?? message.isFromMe);
  if (fromMe === true) return "outbound";
  if (fromMe === false) return "inbound";

  const direction = firstTextValue(
    message.direction,
    message.message_direction,
    message.messageDirection,
    message.sender_type,
    message.senderType,
  ).toLowerCase();

  if (!direction) return null;
  if (direction.includes("out") || direction.includes("sent") || direction.includes("business") || direction.includes("team")) {
    return "outbound";
  }
  if (direction.includes("in") || direction.includes("received") || direction.includes("customer")) {
    return "inbound";
  }

  return null;
}

function historyDirection(message: Record<string, unknown>, context: HistoryContext) {
  const explicit = explicitDirection(message);
  if (explicit) return explicit;

  const from = normalizePhone(firstTextValue(message.from, message.sender, message.sender_id, message.fromUserId));
  const to = normalizePhone(firstTextValue(message.to, message.recipient, message.recipient_id, message.toUserId));

  if (context.businessPhone) {
    if (from && from === context.businessPhone) return "outbound";
    if (to && to === context.businessPhone) return "inbound";
  }

  if (!from && to) return "outbound";
  if (from && !to) return "inbound";

  return null;
}

function historyWaId(message: Record<string, unknown>, direction: NormalizedWhatsAppMessage["direction"], context: HistoryContext) {
  const candidate = direction === "inbound"
    ? firstTextValue(message.from, message.sender, message.sender_id, message.fromUserId, context.threadWaId)
    : firstTextValue(message.to, message.recipient, message.recipient_id, message.toUserId, context.threadWaId);

  return normalizePhone(candidate);
}

function historyDisplayName(waId: string, message: Record<string, unknown>, context: HistoryContext) {
  return context.contacts.get(waId) || profileName(message);
}

function looksLikeMessage(message: Record<string, unknown>) {
  if (!messageId(message)) return false;
  if (textValue(message.type)) return true;
  if (Object.keys(objectValue(message.text)).length || textValue(message.text)) return true;
  if (firstTextValue(message.body, message.message, message.caption)) return true;
  return [
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "reaction",
    "contacts",
    "location",
    "interactive",
    "button",
    "media",
  ].some((key) => Object.keys(objectValue(message[key])).length);
}

function contactMap(value: Record<string, unknown>) {
  return new Map(
    arrayValue(value.contacts).map((contact) => {
      const row = objectValue(contact);
      const waId = normalizePhone(row.wa_id);
      return [waId, textValue(objectValue(row.profile).name)] as const;
    }).filter(([waId]) => waId),
  );
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
    source: NormalizedWhatsAppMessageSource;
    fallbackTimestamp?: unknown;
  }) {
    const id = messageId(input.message);
    const waId = normalizePhone(input.waId);
    if (!id || !waId) return;

    const key = `${input.direction}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);

    const type = messageType(input.message);
    messages.push({
      messageId: id,
      waId,
      phoneNumberId: input.phoneNumberId,
      displayName: input.displayName || profileName(input.message),
      direction: input.direction,
      messageType: type,
      text: messageText(input.message),
      media: messageMedia(input.message, type),
      timestamp: messageTimestamp(input.message, input.fallbackTimestamp),
      source: input.source,
      raw: input.message,
    });
  }

  function addHistoryMessage(message: Record<string, unknown>, context: HistoryContext, source: NormalizedWhatsAppMessageSource = "history") {
    if (!looksLikeMessage(message)) return;
    const direction = historyDirection(message, context);
    if (!direction) return;
    const waId = historyWaId(message, direction, context);
    if (!waId) return;

    addMessage({
      message,
      waId,
      phoneNumberId: context.phoneNumberId,
      displayName: historyDisplayName(waId, message, context),
      direction,
      source,
      fallbackTimestamp: context.fallbackTimestamp,
    });
  }

  function scanProviderStyleEvent(value: Record<string, unknown>, context: HistoryContext) {
    const inbound = objectValue(value.whatsappInboundMessage);
    if (Object.keys(inbound).length) {
      addMessage({
        message: inbound,
        waId: firstTextValue(inbound.from, inbound.fromUserId, context.threadWaId),
        phoneNumberId: context.phoneNumberId,
        displayName: profileName(inbound),
        direction: "inbound",
        source: "provider_history",
        fallbackTimestamp: context.fallbackTimestamp,
      });
    }

    const outbound = objectValue(value.whatsappMessage);
    if (Object.keys(outbound).length) {
      addMessage({
        message: outbound,
        waId: firstTextValue(outbound.to, outbound.toUserId, context.threadWaId),
        phoneNumberId: context.phoneNumberId,
        displayName: profileName(outbound),
        direction: "outbound",
        source: "provider_history",
        fallbackTimestamp: context.fallbackTimestamp,
      });
    }
  }

  function scanHistoryNode(value: unknown, context: HistoryContext, depth = 0) {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) scanHistoryNode(item, context, depth + 1);
      return;
    }

    const object = objectValue(value);
    if (!Object.keys(object).length) return;

    const objectThreadWaId = normalizePhone(firstTextValue(
      object.wa_id,
      object.contact_wa_id,
      object.customer_wa_id,
      object.contactId,
      object.contact_id,
      objectValue(object.contact).wa_id,
      objectValue(object.customer).wa_id,
      arrayValue(object.messages).length ? object.id : "",
    ));
    const nextContext = objectThreadWaId ? { ...context, threadWaId: objectThreadWaId } : context;

    scanProviderStyleEvent(object, nextContext);
    addHistoryMessage(object, nextContext);

    for (const key of [
      "history",
      "threads",
      "thread",
      "messages",
      "message_echoes",
      "events",
      "data",
      "items",
      "chat_history",
      "conversation",
      "conversations",
    ]) {
      if (object[key] !== undefined) scanHistoryNode(object[key], nextContext, depth + 1);
    }
  }

  for (const entry of arrayValue(objectValue(payload).entry)) {
    for (const change of arrayValue(objectValue(entry).changes)) {
      const value = objectValue(objectValue(change).value);
      const metadata = objectValue(value.metadata);
      const phoneNumberId = textValue(metadata.phone_number_id);
      const businessPhone = normalizePhone(metadata.display_phone_number);
      const contacts = contactMap(value);

      for (const item of arrayValue(value.messages)) {
        const message = objectValue(item);
        const waId = normalizePhone(message.from);
        addMessage({
          message,
          waId,
          phoneNumberId,
          displayName: contacts.get(waId) ?? "",
          direction: "inbound",
          source: "messages",
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
          source: "message_echoes",
        });
      }

      if (value.history !== undefined) {
        scanHistoryNode(value.history, {
          phoneNumberId,
          businessPhone,
          fallbackTimestamp: value.timestamp,
          contacts,
        });
      }
    }
  }

  const root = objectValue(payload);
  if (root.whatsappInboundMessage || root.whatsappMessage) {
    scanProviderStyleEvent(root, {
      phoneNumberId: "",
      businessPhone: "",
      fallbackTimestamp: root.createTime,
      contacts: new Map(),
    });
  }

  return messages;
}
