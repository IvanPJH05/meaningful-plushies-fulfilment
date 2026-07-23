export type WhatsAppTextPayloadInput = {
  to: string;
  body: string;
  previewUrl?: boolean;
  contextMessageId?: string;
};

export type WhatsAppImagePayloadInput = {
  to: string;
  imageUrl: string;
  caption?: string;
  contextMessageId?: string;
};

export type WhatsAppVideoPayloadInput = {
  to: string;
  videoUrl: string;
  caption?: string;
  contextMessageId?: string;
};

export type WhatsAppDocumentPayloadInput = {
  to: string;
  documentUrl: string;
  caption?: string;
  filename?: string;
  contextMessageId?: string;
};

export type WhatsAppButtonPayloadInput = {
  to: string;
  body: string;
  buttons: Array<{
    id: string;
    title: string;
  }>;
  contextMessageId?: string;
};

export function buildWhatsAppTextPayload(input: WhatsAppTextPayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    type: "text",
    text: {
      preview_url: input.previewUrl ?? true,
      body: input.body,
    },
  };
}

export function buildWhatsAppImagePayload(input: WhatsAppImagePayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    type: "image",
    image: {
      link: input.imageUrl,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
    },
  };
}

export function buildWhatsAppVideoPayload(input: WhatsAppVideoPayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    type: "video",
    video: {
      link: input.videoUrl,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
    },
  };
}

export function buildWhatsAppDocumentPayload(input: WhatsAppDocumentPayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    type: "document",
    document: {
      link: input.documentUrl,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
      ...(input.filename?.trim() ? { filename: input.filename.trim() } : {}),
    },
  };
}

export function buildWhatsAppButtonPayload(input: WhatsAppButtonPayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    ...(input.contextMessageId ? { context: { message_id: input.contextMessageId } } : {}),
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: input.body,
      },
      action: {
        buttons: input.buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: button.id.slice(0, 256),
            title: button.title.slice(0, 20),
          },
        })),
      },
    },
  };
}

export function buildWhatsAppReactionPayload(input: {
  to: string;
  messageId: string;
  emoji: string;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
    type: "reaction",
    reaction: {
      message_id: input.messageId,
      emoji: input.emoji,
    },
  };
}

async function sendWhatsAppPayload(payload: Record<string, unknown>) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";

  if (!phoneNumberId || !accessToken) {
    return {
      sent: false,
      reason: "missing_whatsapp_credentials",
      payload,
    };
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    throw new Error(`WhatsApp message could not be sent: ${JSON.stringify(data)}`);
  }

  return {
    sent: true,
    response: data,
    payload,
  };
}

export async function sendWhatsAppTextMessage(input: WhatsAppTextPayloadInput) {
  const payload = buildWhatsAppTextPayload(input);
  return sendWhatsAppPayload(payload);
}

export async function sendWhatsAppImageMessage(input: WhatsAppImagePayloadInput) {
  const payload = buildWhatsAppImagePayload(input);
  return sendWhatsAppPayload(payload);
}

export async function sendWhatsAppVideoMessage(input: WhatsAppVideoPayloadInput) {
  const payload = buildWhatsAppVideoPayload(input);
  return sendWhatsAppPayload(payload);
}

export async function sendWhatsAppDocumentMessage(input: WhatsAppDocumentPayloadInput) {
  const payload = buildWhatsAppDocumentPayload(input);
  return sendWhatsAppPayload(payload);
}

export async function sendWhatsAppButtonMessage(input: WhatsAppButtonPayloadInput) {
  const payload = buildWhatsAppButtonPayload(input);
  return sendWhatsAppPayload(payload);
}

export async function sendWhatsAppReactionMessage(input: {
  to: string;
  messageId: string;
  emoji: string;
}) {
  const payload = buildWhatsAppReactionPayload(input);
  return sendWhatsAppPayload(payload);
}
