import {NextResponse} from "next/server";
import {context,failure,headers} from "@/lib/certificate-cards-server";
export const runtime="nodejs";
export async function GET(request:Request){try{const {client}=await context(request);const url=new URL(request.url);if (url.searchParams.has("badges")) {
  const badges: Record<string, number> = {};
  for (let offset = 0; ; offset += 500) {
    const result = await client.from("production_items").select("order_id,production_batches(batch_number)")
      .order("id").range(offset, offset + 499);
    if (result.error) throw result.error;
    for (const item of result.data) {
      const batch = item.production_batches as unknown as {batch_number: number} | null;
      if (batch?.batch_number) badges[item.order_id] = batch.batch_number;
    }
    if (result.data.length < 500) break;
  }
  return NextResponse.json({badges}, {headers});
}
const page=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get("page")||"0",10)||0));const search=(url.searchParams.get("q")||"").replace(/[^\p{L}\p{N}\s@+.\-]/gu,"").trim().slice(0,100);let query=client.from("fulfilment_orders").select("id,order_number,updated_at,data",{count:"exact"});if(search)query=query.or(["order_number","data->>customerName","data->>phone","data->>trackingNumber","data->>plushName"].map(field=>`${field}.ilike.%${search}%`).join(","));const {data,error,count}=await query.order("updated_at",{ascending:false}).order("id").range(page*50,page*50+49);if(error)throw error;const ids=(data||[]).map(r=>r.id);const {data:items,error:itemError}=ids.length?await client.from("production_items").select("id,order_id,stage,issue,disposition,carried_issue,batch_id,updated_at,production_batches(batch_number)").in("order_id",ids):{data:[],error:null};if(itemError)throw itemError;return NextResponse.json({orders:(data||[]).map(r=>({...r.data,id:r.id,production:items?.find(i=>i.order_id===r.id)||null})),total:count||0,page},{headers});}catch(e){return failure(e);}}
