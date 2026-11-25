import { NextResponse } from "next/server";
import { context, failure, headers, PairingError } from "../../../../lib/certificate-cards-server";
import { packingOrderProjection, packingOrderItem } from "../../../../lib/packing-station";
import { GET as lookup, POST as pair } from "../../mobile/packing/route";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

// Reuse the existing read-only barcode resolution and gated NFC pairing.
// Neither endpoint marks the order Packed.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("scanBarcode")) return lookup(request);
  try {
    const { client } = await context(request);
    const cursor=new URL(request.url).searchParams.get("after")||"";
    if(cursor.length>200)throw new PairingError("Invalid audio order list.");
    // Daily Production's scanner queue is driven by production_items.stage,
    // not the older fulfilment status. Include both workflows and keyset-page
    // their union so neither source truncates or hides the other.
    let legacy=client.from("fulfilment_orders").select(packingOrderProjection)
      .eq("status", "sent_for_sewing").order("id", { ascending: true }).limit(101);
    let sewing=client.from("production_items").select("order_id,batch_id")
      .eq("disposition","active").in("stage",["at_tailor","returned","audio_passed"])
      .order("order_id",{ascending:true}).limit(101);
    if(cursor){legacy=legacy.gt("id",cursor);sewing=sewing.gt("order_id",cursor);}
    const [old,queue]=await Promise.all([legacy,sewing]);
    if(old.error||queue.error)throw old.error||queue.error;
    const ids=queue.data.map(item=>item.order_id);
    const batchOrders=ids.length?await client.from("fulfilment_orders").select(packingOrderProjection).in("id",ids):{data:[],error:null};
    if(batchOrders.error)throw batchOrders.error;
    const merged=new Map<string,Record<string,unknown>>();
    for(const row of [...old.data,...batchOrders.data])merged.set(String(row.id),row);
    const all=[...merged.values()].sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0),data=all.slice(0,100);
    const more=all.length>100||old.data.length===101||queue.data.length===101;
    return NextResponse.json({ items: data.map(row=>({...packingOrderItem([row],"MPI-"+row.id),batchId:queue.data.find(item=>item.order_id===row.id)?.batch_id||""})),nextCursor:more&&data.length?data[data.length-1].id:null }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) { return pair(request); }
