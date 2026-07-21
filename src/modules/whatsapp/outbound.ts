export type WhatsAppTextPayloadInput = {
  to: string;
  body: string;
  previewUrl?: boolean;
};

export type WhatsAppImagePayloadInput = {
  to: string;
  imageUrl: string;
  caption?: string;
};

export function buildWhatsAppTextPayload(input: WhatsAppTextPayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.replace(/\D/g, ""),
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
    type: "image",
    image: {
      link: input.imageUrl,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
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
