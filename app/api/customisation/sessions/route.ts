import { NextResponse } from "next/server";

import { createCompleteNowSession, createDeferredSession, type DeliveryMethod } from "../../../../lib/customisation";

export const runtime = "nodejs";

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: "complete_now" | "fill_later"; deliveryMethod?: DeliveryMethod; contactEmail?: string; contactPhone?: string };
    if (body.mode === "complete_now") {
      const session = await createCompleteNowSession();
      return cors(NextResponse.json({ ok: true, sessionId: session.id, token: session.token }));
    }
    const session = await createDeferredSession({
      deliveryMethod: body.deliveryMethod === "whatsapp" ? "whatsapp" : "email",
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
    });
    return cors(NextResponse.json({ ok: true, sessionId: session.id }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not start customisation." }, { status: 400 }));
  }
}
