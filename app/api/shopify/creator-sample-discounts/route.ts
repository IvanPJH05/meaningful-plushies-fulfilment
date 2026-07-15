import { NextResponse } from "next/server";

import { createCreatorSampleDiscountCode, deactivateManualOrderDiscount } from "../../../../lib/manual-orders";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; creatorName?: string };
    const discountId = await createCreatorSampleDiscountCode(body.code ?? "", body.creatorName ?? "");
    return json(200, { ok: true, discountId });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Creator sample discount could not be created." });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { action?: string; discountId?: string };
    if (body.action !== "deactivate" || !body.discountId) return json(400, { ok: false, error: "Invalid creator sample discount action." });
    await deactivateManualOrderDiscount(body.discountId);
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Creator sample discount could not be updated." });
  }
}
