import { NextResponse } from "next/server";
import { context, failure, headers } from "@/lib/certificate-cards-server";
import { packingOrderProjection, packingOrderItem } from "@/lib/packing-station";
import { GET as lookup, POST as pair } from "@/app/api/mobile/packing/route";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

// Reuse the existing read-only barcode resolution and gated NFC pairing.
// Neither endpoint marks the order Packed.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("scanBarcode")) return lookup(request);
  try {
    const { client } = await context(request);
    const { data, error } = await client.from("fulfilment_orders").select(packingOrderProjection)
      .eq("status", "sent_for_sewing").order("updated_at", { ascending: false }).limit(80);
    if (error) throw error;
    const ids=data.map(row=>row.id);
    const batches=ids.length?await client.from("production_items").select("order_id,batch_id").in("order_id",ids).eq("disposition","active"):{data:[],error:null};
    if(batches.error)throw batches.error;
    return NextResponse.json({ items: data.map(row=>({...packingOrderItem([row],"MPI-"+row.id),batchId:batches.data?.find(item=>item.order_id===row.id)?.batch_id||""})) }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) { return pair(request); }
