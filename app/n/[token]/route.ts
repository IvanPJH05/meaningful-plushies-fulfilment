import { NextResponse } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";
import { nfcDestination, nfcTokenPattern } from "@/lib/nfc-cards";
import type { Order } from "@/lib/types";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow","Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"};
function pending(status=200) {
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meaningful Plushies</title><style>body{font:18px/1.6 system-ui;background:#f4f7fb;color:#193148;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:480px;padding:36px;text-align:center}h1{font-size:28px}</style><main><p>Meaningful Plushies</p><h1>Your plushie's link isn't active yet</h1><p>If you have just received this card, please contact Meaningful Plushies for help.</p></main></html>`,{status,headers});
}
export async function GET(_request: Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!nfcTokenPattern.test(token)) return pending(404);
  try {
    const db=mobileServiceClient();
    const {data:card,error}=await db.from("nfc_cards").select("status,order_id").eq("public_token",token).maybeSingle();
    if(error) throw error;
    if(!card || card.status!=="assigned" || !card.order_id) return pending(card?200:404);
    const {data:row,error:orderError}=await db.from("fulfilment_orders").select("data,status").eq("id",card.order_id).maybeSingle();
    if(orderError) throw orderError;
    if(!row || ["awaiting_customisation","issue"].includes(row.status)) return pending();
    const destination=nfcDestination(row.data as Order);
    if(!destination) return pending();
    return NextResponse.redirect(destination,{status:307,headers});
  } catch {return pending(503);}
}
