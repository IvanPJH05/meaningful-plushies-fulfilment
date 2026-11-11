import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const errors: Record<string,string> = {
  NFC_ORDER_NOT_FOUND: "No plushie matches this code. Scan its packing-slip barcode.",
  NFC_ORDER_AMBIGUOUS: "This older code matches more than one plushie. Reprint the packing slip and scan its new individual item barcode.",
  NFC_CARD_NOT_FOUND: "This card is not in NFC inventory. Generate the card batch first.",
  NFC_CARD_NOT_PROGRAMMED: "Write or verify this card's permanent link before pairing it.",
  NFC_CARD_ALREADY_ASSIGNED: "This card belongs to another plushie. An administrator must undo that pairing first.",
  NFC_ORDER_ALREADY_PAIRED: "This plushie already has an NFC card. An administrator must undo the old pairing before replacing it.",
  NFC_CARD_VOIDED: "This card has been voided. Use another card.",
  NFC_ORDER_NOT_READY: "Finish customisation first. Cancelled, shipped or issue orders cannot be paired.",
  NFC_CERTIFICATE_MISSING: "This plushie has no valid certificate or Our Link. Correct its order details first.",
  NFC_CERTIFICATE_PENDING: "The birth certificate is still syncing. Wait for it to finish before pairing.",
  NFC_CERTIFICATE_SHARED: "Another plushie shares this certificate link. Correct the individual certificate links before pairing.",
  NFC_CARD_CHANGED: "This card's pairing changed. Refresh it before making a correction.",
  NFC_REASON_REQUIRED: "Enter a reason for the correction (up to 500 characters).",
  NFC_BATCH_CHANGED: "This batch request already exists with different details. Reload the inventory.",
  NFC_CARD_NOT_ASSIGNED: "This card has no active pairing to undo.",
};
function fail(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/SIGN_IN_REQUIRED|WAREHOUSE_ACCESS_REQUIRED/.test(code)) return NextResponse.json({error:"Sign in with a warehouse account."},{status:401,headers});
  if (code === "ADMIN_REQUIRED") return NextResponse.json({error:"Administrator access required."},{status:403,headers});
  if (errors[code] || code.startsWith("INVALID_")) return NextResponse.json({error:errors[code] || "Invalid NFC request."},{status:409,headers});
  if (code.includes("nfc_one_active_card_per_order")) return NextResponse.json({error:errors.NFC_ORDER_ALREADY_PAIRED},{status:409,headers});
  console.error("NFC inventory request failed", code);
  return NextResponse.json({error:"NFC request could not be saved. Check the inventory before retrying."},{status:500,headers});
}
export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const db=mobileServiceClient(), query=new URL(request.url).searchParams;
    const batchId=query.get("batchId"), cardId=query.get("cardId");
    if (batchId && !uuid.test(batchId) || cardId && !/^\d{6,12}$/.test(cardId)) throw new Error("INVALID_NFC_FILTER");
    const {data:batches,error:batchError}=await db.from("nfc_card_batches").select("*").order("number",{ascending:false}).limit(100);
    if (batchError) throw new Error(batchError.message);
    const selected=batchId || batches?.[0]?.id;
    let cardsQuery=db.from("nfc_cards").select("id,batch_id,public_token,status,order_id,programmed_at,paired_at").order("id").limit(1000);
    if (cardId) cardsQuery=cardsQuery.eq("id",Number(cardId)); else if (selected) cardsQuery=cardsQuery.eq("batch_id",selected); else return NextResponse.json({batches:[],cards:[],logs:[]},{headers});
    const {data:cards,error}=await cardsQuery;
    if(error) throw new Error(error.message);
    let logQuery=db.from("nfc_pairing_logs").select("id,card_id,order_id,action,actor,reason,created_at").order("id",{ascending:false}).limit(50);
    if(cardId) logQuery=logQuery.eq("card_id",Number(cardId));
    const {data:logs,error:logError}=await logQuery;
    if(logError) throw new Error(logError.message);
    return NextResponse.json({batches,cards,logs,batchId:selected},{headers});
  } catch(error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    const session=await requireMobileSession(request);
    const raw=await request.text();
    if(raw.length>5000) throw new Error("INVALID_NFC_REQUEST");
    let body;
    try {body=JSON.parse(raw);} catch {throw new Error("INVALID_NFC_REQUEST");}
    if(!body || !["generate","resolve","pair","programmed","unpair","void"].includes(body.action)) throw new Error("INVALID_NFC_ACTION");
    if (!["resolve","pair"].includes(body.action) && session.role!=="admin") throw new Error("ADMIN_REQUIRED");
    const db=mobileServiceClient(), actor=`${session.displayName} (${session.username})`;
    if(body.action==="generate") {
      if(!uuid.test(body.batchId || "") || !Number.isInteger(body.quantity) || body.quantity<1 || body.quantity>1000) throw new Error("INVALID_NFC_BATCH");
      const {data,error}=await db.rpc("generate_nfc_cards",{p_batch:body.batchId,p_quantity:body.quantity,p_actor:actor});
      if(error) throw new Error(error.message);
      return NextResponse.json({batchId:data},{headers});
    }
    let order;
    if(["resolve","pair"].includes(body.action)) {
      if(typeof body.orderScan!=="string" || !body.orderScan.trim() || body.orderScan.length>512) throw new Error("INVALID_SCAN");
      const {data,error}=await db.rpc("resolve_nfc_order",{p_scan:body.orderScan});
      if(error) throw new Error(error.message);
      order=data;
      if(body.action==="resolve") return NextResponse.json({order},{headers});
    }
    if(!Number.isSafeInteger(body.cardId) || body.cardId<100001 || body.cardId>999999999999) throw new Error("INVALID_NFC_CARD");
    if(["unpair","void"].includes(body.action) && (typeof body.reason!=="string" || !body.reason.trim() || body.reason.length>500 || body.expectedOrder!==null && typeof body.expectedOrder!=="string")) throw new Error("INVALID_NFC_CORRECTION");
    const {data:card,error}=await db.rpc("mutate_nfc_card",{p_action:body.action,p_card:body.cardId,p_order:order?.id || body.expectedOrder || null,p_actor:actor,p_reason:body.reason || ""});
    if(error) throw new Error(error.message);
    return NextResponse.json({card,order},{headers});
  } catch(error) {return fail(error);}
}
