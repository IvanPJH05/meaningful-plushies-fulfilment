import { NextResponse } from "next/server";
import { CRM_PHASES } from "@/src/shared/constants/crm";
import { getMissingPhase1Env, getMissingPhase2Env } from "@/src/shared/validation/env";
import { metaCoexistenceManualSetupSteps } from "@/src/modules/onboarding/meta-coexistence";
import { paidManualOrderPhase2Policy } from "@/src/modules/sales/paid-manual-order-flow";

export function GET() {
  return NextResponse.json({
    ok: true,
    phase: "phase_1_foundations",
    officialWhatsAppOnly: true,
    phases: CRM_PHASES,
    missingRecommendedEnv: getMissingPhase1Env(),
    phase2: {
      status: "paid_first_manual_order_commands_started",
      missingRecommendedEnv: getMissingPhase2Env(),
      policy: paidManualOrderPhase2Policy,
      commandEndpoint: "/api/crm/ai/commands/manual-order",
      webhookEndpoint: "/api/crm/whatsapp/webhook",
    },
    manualMetaSteps: metaCoexistenceManualSetupSteps,
  });
}
