import { NextResponse } from "next/server";

import { createCreatorSampleDiscountCode, deactivateManualOrderDiscount } from "../../../../lib/manual-orders";
import { saveCreatorFreeSample, type CreatorFreeSampleRecord } from "../../../../lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionToken?: string; sample?: CreatorFreeSampleRecord };
    const sessionToken = body.sessionToken?.trim() ?? "";
    const sample = body.sample;
    if (!sessionToken || !sample?.id || !sample.creatorName?.trim() || !sample.sampleCode?.trim()) {
      return json(400, { ok: false, error: "Creator name, discount code, and an active admin session are required." });
    }

    // The database RPC validates the dashboard session before any Shopify action.
    // Keeping both saves on the server prevents a browser-to-Supabase network blip
    // from leaving the creator ledger and Shopify code out of sync.
    const pendingSample: CreatorFreeSampleRecord = {
      ...sample,
      sampleCode: sample.sampleCode.trim().toUpperCase(),
      shopifyDiscountId: "",
    };
    await saveCreatorFreeSample(sessionToken, pendingSample);

    try {
      const discountId = await createCreatorSampleDiscountCode(pendingSample.sampleCode, pendingSample.creatorName);
      const savedSample = { ...pendingSample, shopifyDiscountId: discountId };
      await saveCreatorFreeSample(sessionToken, savedSample);
      return json(200, { ok: true, saved: true, discountId, sample: savedSample });
    } catch (error) {
      // The creator record is still retained so staff can resolve an already-used
      // code without accidentally giving the same sample twice.
      return json(200, {
        ok: false,
        saved: true,
        sample: pendingSample,
        error: error instanceof Error ? error.message : "Shopify could not create this discount code.",
      });
    }
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
