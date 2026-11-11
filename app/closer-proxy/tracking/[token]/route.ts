import {mobileServiceClient} from "@/lib/mobile-api";
import {renderCustomerTracking} from "@/lib/customer-production-tracking";
import type {ProductionStage} from "@/lib/production-tracking";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const headers={"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self' https://meaningfulplushies.com"};
 if(!/^[0-9a-f]{64}$/.test(token))return new Response(renderCustomerTracking(null),{status:404,headers});
 try{
  const db=mobileServiceClient();const {data:item,error}=await db.from("production_items").select("id,stage,issue,batch_id").eq("tracking_token",token).maybeSingle();if(error)throw error;if(!item)return new Response(renderCustomerTracking(null),{status:404,headers});
  const {data:batch,error:batchError}=await db.from("production_batches").select("pickup_date").eq("id",item.batch_id).single();if(batchError)throw batchError;
  const {data:events,error:eventError}=await db.from("production_events").select("stage,created_at").eq("item_id",item.id).eq("kind","stage").order("created_at");if(eventError)throw eventError;
  return new Response(renderCustomerTracking({stage:item.stage as ProductionStage,delayed:Boolean(item.issue),pickupDate:batch.pickup_date,events:(events||[]) as {stage:ProductionStage;created_at:string}[]}),{headers});
 }catch{return new Response("Tracking is temporarily unavailable. Please try again shortly.",{status:503,headers});}
}
