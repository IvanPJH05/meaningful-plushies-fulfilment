import { NextResponse } from "next/server";

import { createCreatorSampleDiscountCode, deactivateManualOrderDiscount, upgradeCreatorSampleDiscountCode, type CreatorSampleDiscountUpgrade } from "../../../../lib/manual-orders";
import { saveCreatorFreeSample, type CreatorFreeSampleRecord } from "../../../../lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionToken?: string; samples?: CreatorFreeSampleRecord[]; sample?: CreatorFreeSampleRecord };
    const sessionToken = body.sessionToken?.trim() ?? "";
    const samples = body.samples ?? (body.sample ? [body.sample] : []);
    if (!sessionToken || !samples.length || samples.some((sample) => !sample?.id || !sample.creatorName?.trim() || !sample.sampleCode?.trim())) {
      return json(400, { ok: false, error: "Creator name, discount code, and an active admin session are required." });
    }

    // The database RPC validates the dashboard session before any Shopify action.
    // Keeping both saves on the server prevents a browser-to-Supabase network blip
    // from leaving the creator ledger and Shopify code out of sync.
    const pendingSamples = samples.map((sample) => ({
      ...sample,
      productCollection: sample.productCollection === "plush_charms_v1" ? "plush_charms_v1" as const : "classics" as const,
      sampleCode: sample.sampleCode.trim().toUpperCase(),
      shopifyDiscountId: "",
    }));
    await Promise.all(pendingSamples.map((sample) => saveCreatorFreeSample(sessionToken, sample)));

    const savedSamples = [];
    const failures = [];
    for (const sample of pendingSamples) {
      try {
        const discountId = await createCreatorSampleDiscountCode(sample.sampleCode, sample.creatorName, sample.productCollection, { recoverExisting: true });
        const savedSample = { ...sample, shopifyDiscountId: discountId };
        await saveCreatorFreeSample(sessionToken, savedSample);
        savedSamples.push(savedSample);
      } catch (error) {
        savedSamples.push(sample);
        failures.push(`${sample.sampleCode} · ${error instanceof Error ? error.message : "Shopify could not create this discount code."}`);
      }
    }
    return json(200, {
      ok: failures.length === 0,
      saved: true,
      discountIds: savedSamples.flatMap((sample) => sample.shopifyDiscountId ? [sample.shopifyDiscountId] : []),
      samples: savedSamples,
      ...(failures.length ? { error: failures.join(" ") } : {}),
    });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Creator sample discount could not be created." });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { sessionToken?: string; samples?: CreatorFreeSampleRecord[] };
    const sessionToken = body.sessionToken?.trim() ?? "";
    const samples = body.samples ?? [];
    if (!sessionToken || !samples.length) return json(400, { ok: false, error: "Choose active Creator Sample codes and an admin session." });

    // This write validates the dashboard session before any Shopify mutations.
    // Work one code at a time. This avoids Shopify rate limits and means a
    // single problematic legacy code cannot prevent the other safe upgrades.
    const results: CreatorSampleDiscountUpgrade[] = [];
    const updated: CreatorFreeSampleRecord[] = [];
    for (const sample of samples) {
      await saveCreatorFreeSample(sessionToken, sample);
      let result: CreatorSampleDiscountUpgrade;
      try {
        result = await upgradeCreatorSampleDiscountCode(
          sample.sampleCode,
          sample.creatorName,
          sample.productCollection === "plush_charms_v1" ? "plush_charms_v1" : "classics",
        );
      } catch (error) {
        result = {
          code: sample.sampleCode.trim().toUpperCase(),
          status: "failed",
          error: error instanceof Error ? error.message : "Shopify could not upgrade this Creator Sample code.",
        };
      }
      results.push(result);
      const next = result.discountId ? { ...sample, shopifyDiscountId: result.discountId } : sample;
      if (next !== sample) await saveCreatorFreeSample(sessionToken, next);
      updated.push(next);
    }
    return json(200, { ok: true, results, samples: updated });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Creator Sample codes could not be upgraded." });
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
