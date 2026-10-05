import { NextResponse } from "next/server";
import { approveManualOrderCod, getManualOrderIntakeDetails, listManualOrderIntakeApprovals, listManualOrderIntakes } from "../../../../lib/manual-order-intakes";
import { requireMobileSession } from "../../../../lib/mobile-api";

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "awaiting") return NextResponse.json({ intakes: await listManualOrderIntakeApprovals() }, { headers: { "cache-control": "no-store, max-age=0" } });
    if (scope === "history") return NextResponse.json({ intakes: (await listManualOrderIntakes()).filter((intake) => intake.status !== "awaiting_payment") }, { headers: { "cache-control": "no-store, max-age=0" } });
    // The mobile archive needs the same complete approval summary as the
    // browser workspace. Returning plain intake rows here used to omit both
    // the configured recording duration and the calculated collection total.
    const [approvals, history] = await Promise.all([
      listManualOrderIntakeApprovals(),
      listManualOrderIntakes(),
    ]);
    return NextResponse.json({
      intakes: [...approvals, ...history.filter((intake) => intake.status !== "awaiting_payment")],
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "MANUAL_ORDERS_FAILED" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const body = await request.json() as { action?: string; id?: string };
    if (body.action === "details") return NextResponse.json({ details: await getManualOrderIntakeDetails(String(body.id || "")) });
    if (body.action === "approve_cod") return NextResponse.json({ intake: await approveManualOrderCod(String(body.id || "")) });
    return NextResponse.json({ error: "That Manual Order action is not supported in the app yet." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "MANUAL_ORDER_ACTION_FAILED" }, { status: 500 }); }
}
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
