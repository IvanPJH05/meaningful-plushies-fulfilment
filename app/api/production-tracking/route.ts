import {NextResponse} from "next/server";
import {context,failure,PairingError,headers,summary} from "@/lib/certificate-cards-server";
import {certificateCardCode} from "@/lib/certificate-pairing";
import {batchSchedule,matchesProductionBarcode} from "@/lib/production-tracking";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request){try{
 const {client}=await context(request);const url=new URL(request.url);const id=url.searchParams.get("batch");
 if(url.searchParams.has("candidates")){
  const day=url.searchParams.get("day")||"";const plan=batchSchedule(day);
  const {data:members,error:memberError}=await client.from("production_items").select("order_id,disposition,deferred_until,issue");if(memberError)throw memberError;
  const {data:existingBatchOrders,error:batchOrdersError}=await client.from("fulfilment_batch_orders").select("order_id");if(batchOrdersError)throw batchOrdersError;
  const deferred=(members||[]).filter(m=>m.disposition==="deferred"&&m.deferred_until<=day);const used=new Set([...(members||[]).filter(m=>!deferred.includes(m)).map(m=>m.order_id),...(existingBatchOrders||[]).map(m=>m.order_id)]);
  const {data,error}=await client.from("fulfilment_orders").select("id,order_number,updated_at,data").eq("status","new_order").lte("data->>orderDate",new Date(plan.cutoff).toISOString()).order("order_number").limit(1000);if(error)throw error;
  const orders=(data||[]).filter(r=>!used.has(r.id)).slice(0,200).map(r=>({id:r.id,...r.data as object,productionCarryover:deferred.find(m=>m.order_id===r.id)?.issue||null}));return NextResponse.json({orders},{headers});
 }
 if(!id){const {data,error}=await client.from("production_batches").select("*,production_items(stage,issue,disposition,carried_issue)").order("production_date",{ascending:false}).limit(60);if(error)throw error;return NextResponse.json({batches:data},{headers});}
 if(!uuid.test(id))throw new PairingError("Invalid batch.");
 const {data:batch,error:batchError}=await client.from("production_batches").select("*").eq("id",id).single();if(batchError)throw batchError;
 const {data:items,error}=await client.from("production_items").select("*").eq("batch_id",id).order("order_id");if(error)throw error;
 const ids=(items||[]).map(i=>i.order_id);
 const {data:orders,error:orderError}=await client.from("fulfilment_orders").select("id,data").in("id",ids);if(orderError)throw orderError;
 const {data:events,error:eventError}=await client.from("production_events").select("*,dashboard_accounts(display_name)").in("item_id",(items||[]).map(i=>i.id)).order("created_at",{ascending:false}).limit(3000);if(eventError)throw eventError;
 return NextResponse.json({batch,items:(items||[]).map(i=>({...i,order:orders?.find(o=>o.id===i.order_id)?.data||{}})),events:(events||[]).map(e=>({...e,actorName:(e.dashboard_accounts as unknown as {display_name:string})?.display_name}))},{headers});
 }catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {client,actor,session}=await context(request);const raw=await request.text();if(raw.length>40000)throw new PairingError("Request too large.");const body=JSON.parse(raw);
 if(body.action==="create"){
  if(session.role!=="admin")throw new PairingError("Only admins can close production batches.",403);
  batchSchedule(body.day);if(!uuid.test(body.id||"")||!Array.isArray(body.orderIds)||body.orderIds.length<1||body.orderIds.length>200||body.orderIds.some((id:unknown)=>typeof id!=="string"||id.length>200))throw new PairingError("Choose the orders for this batch.");
  const {data:assigned,error:assignedError}=await client.from("fulfilment_batch_orders").select("order_id").in("order_id",body.orderIds);if(assignedError)throw assignedError;if(assigned?.length)throw new PairingError("An order is already in Batch Fulfilment. Finish it there before starting another production cycle.",409);
  const {data:rows,error:rowsError}=await client.from("fulfilment_orders").select("status,data").in("id",body.orderIds);if(rowsError)throw rowsError;
  if(rows?.length!==body.orderIds.length||rows.some(r=>r.status!=="new_order"))throw new PairingError("Only New Order items can begin production. Refresh and review the selection.",409);
  if(body.pickupDate)batchSchedule(body.pickupDate);
  const {data,error}=await client.rpc("production_create_batch",{p_actor:actor,p_id:body.id,p_day:body.day,p_order_ids:body.orderIds,p_pickup:body.pickupDate||null});if(error)throw new PairingError(error.message,409);return NextResponse.json({id:data},{headers});
 }
 if(["pair_labels","labels_printed_all"].includes(body.action)){
 if(!uuid.test(body.batchId||""))throw new PairingError("Choose a batch.");
 if(body.action==="pair_labels"){
 if(!Array.isArray(body.labels)||!body.labels.length||body.labels.length>200||new Set(body.labels.map((l:{orderId:string})=>l.orderId)).size!==body.labels.length)throw new PairingError("Invalid label selection.");
 for(const label of body.labels){if(!label||typeof label.orderId!=="string"||typeof label.fileName!=="string"||!["jnt","tiktok"].includes(label.source)||!Number.isInteger(label.version))throw new PairingError("Invalid label.");const url=new URL(label.url);if(url.origin!==new URL(request.url).origin||!/^\/media-assets\/[a-f0-9]{64}\/original$/.test(url.pathname))throw new PairingError("Invalid label URL.");}
 }else if(!body.versions||typeof body.versions!=="object"||Array.isArray(body.versions)||Object.keys(body.versions).length>200||Object.values(body.versions).some(v=>!Number.isInteger(v)))throw new PairingError("Refresh this batch before printing.");
 const {error}=await client.rpc("production_prepare_labels",{p_actor:actor,p_batch:body.batchId,p_action:body.action==="pair_labels"?"labels":"printed",p_payload:body.action==="pair_labels"?{labels:body.labels}:{versions:body.versions}});if(error)throw new PairingError(error.message,409);return NextResponse.json({ok:true},{headers});
 }
 if(body.action==="audio_complete"){if(!uuid.test(body.batchId||"")||!body.versions||typeof body.versions!=="object"||Array.isArray(body.versions)||Object.keys(body.versions).length>200||Object.values(body.versions).some(v=>!Number.isInteger(v)))throw new PairingError("Invalid batch versions.");const {error}=await client.rpc("production_audio_downloaded",{p_actor:actor,p_batch:body.batchId,p_versions:body.versions});if(error)throw new PairingError(error.message,409);return NextResponse.json({ok:true},{headers});}
 if(["collected","delivered","at_tailor"].includes(body.action))throw new PairingError("Use the batch audio ZIP to start Sewing. Packing completes production.");
 if(!uuid.test(body.itemId||"")||!Number.isInteger(body.version))throw new PairingError("Select a production item.");
 if(body.action==="delivered"&&session.role!=="admin")throw new PairingError("Delivery confirmation is admin only until courier updates are connected.",403);
 let details=null,code=null,orderUpdated=null;
 if(body.action==="packed"||body.action==="audio_passed"){
  if(body.action==="packed")code=/^NFC-\d{6,12}$/i.test(String(body.cardCode||"").trim())?String(body.cardCode).trim().toUpperCase():certificateCardCode(String(body.cardCode||""));
  const {data:item}=await client.from("production_items").select("order_id").eq("id",body.itemId).single();if(!item)throw new PairingError("Item not found.");
  const {data:row}=await client.from("fulfilment_orders").select("id,order_number,updated_at,data").eq("id",item.order_id).single();if(!row)throw new PairingError("Order not found.");
  if(!matchesProductionBarcode({id:row.id,orderNumber:row.order_number},String(body.orderBarcode||"")))throw new PairingError("Scan this order barcode before its certificate card.");
  if(body.action==="packed"&&!code?.startsWith("NFC-"))details=summary(row as Parameters<typeof summary>[0]).fields;orderUpdated=row.updated_at;
 }
 const {error}=await client.rpc("production_record_step",{p_actor:actor,p_item:body.itemId,p_version:body.version,p_action:body.action,p_note:String(body.note||"").slice(0,1000),p_card:code,p_details:details,p_order_updated:orderUpdated});
 if(error)throw new PairingError(error.message,409);return NextResponse.json({ok:true},{headers});
 }catch(error){return failure(error);}}
