import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

type SubscribeAttempt = {
  fields: string[];
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  code?: number;
  type?: string;
  trace?: string;
};

const SUBSCRIPTION_FIELD_SETS = [
  ["messages", "history", "smb_message_echoes", "message_template_status_update", "phone_number_name_update"],
  ["messages", "message_template_status_update", "phone_number_name_update"],
  ["messages"],
];

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function subscribe(fields: string[], accessToken: string, wabaId: string): Promise<SubscribeAttempt> {
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    body: new URLSearchParams({
      access_token: accessToken,
      subscribed_fields: fields.join(","),
    }),
  });
  const data = await response.json().catch(() => ({})) as GraphError & Record<string, unknown>;

  if (!response.ok) {
    return {
      fields,
      ok: false,
      status: response.status,
      error: data.error?.message || "Meta rejected the webhook subscription request.",
      code: data.error?.code,
      type: data.error?.type,
      trace: data.error?.fbtrace_id,
    };
  }

  return {
    fields,
    ok: true,
    status: response.status,
    data,
  };
}

export async function POST() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";

  if (!accessToken || !wabaId) {
    return json(400, {
      ok: false,
      error: "WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID must be set in Vercel first.",
    });
  }

  const attempts: SubscribeAttempt[] = [];

  for (const fields of SUBSCRIPTION_FIELD_SETS) {
    const attempt = await subscribe(fields, accessToken, wabaId);
    attempts.push(attempt);
    if (attempt.ok) {
      return json(200, {
        ok: true,
        message: "WhatsApp webhook subscription repaired.",
        activeFields: fields,
        attempts,
      });
    }
  }

  return json(400, {
    ok: false,
    error: attempts.at(-1)?.error || "Meta rejected the WhatsApp webhook subscription request.",
    attempts,
  });
}
