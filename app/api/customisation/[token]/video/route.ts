import { NextResponse } from "next/server";

import { orderVideoForCustomisationToken } from "../../../../../lib/customisation";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "https://meaningfulplushies.com");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return response;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(_: Request, { params }: Context) {
  try {
    const { token } = await params;
    const video = await orderVideoForCustomisationToken(token);
    return cors(NextResponse.json({ ok: true, video }));
  } catch {
    // A missing mapping is deliberately treated as no video, rather than
    // exposing Shopify configuration details on the customer-facing page.
    return cors(NextResponse.json({ ok: true, video: null }));
  }
}
