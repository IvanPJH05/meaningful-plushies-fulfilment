import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
import { hasShippingScope, trustedTikTokDocumentUrl, validateHandover, validateShippingPackage } from "../lib/tiktok-shipping-policy.ts";

const orderId="tiktok-123456789012345678", packageId="987654321012345678";
class TikTokApiError extends Error { constructor(code){super(`TikTok code ${code}`);this.code=code;} }
const pdf=await PDFDocument.create();pdf.addPage([298,420]);const bytes=Buffer.from(await pdf.save());
function harness({status="TO_FULFILL",scopes=["seller.fulfillment.basic"],bookError=null,labelError=false,lockTaken=false,bookingState=null,wrongOrder=false}={}) {
  const calls=[],states=[],saved=[];let unlocks=0;
  const db={from(table){let patch,filters=[];const chain={update(value){patch=value;return chain;},select(){return chain;},eq(k,v){filters.push([k,v]);return chain;},lt(){return chain;},single(){return Promise.resolve({data:{id:orderId,order_number:"TT1",data:{salesChannel:"tiktok",orderNumber:"TT1 123456789012345678"}}});},maybeSingle(){return Promise.resolve({data:bookingState?{booking_state:bookingState}:null});},upsert(row){states.push(row.booking_state);return Promise.resolve({error:null});},then(resolve){if(table==="tiktok_sync_lock"){if(patch.owner===null)unlocks++;return Promise.resolve({data:lockTaken?[]:[{id:true}]}).then(resolve);}return Promise.resolve({data:null}).then(resolve);}};return chain;},async rpc(name,args){saved.push({name,args});return {error:null};}};
  const api=async(path,token,query,body)=>{calls.push({path,body});if(path.endsWith("/ship")){if(bookError)throw bookError;return {};}if(path.endsWith("/shipping_documents")){if(labelError)throw new TikTokApiError(11034037);return {doc_url:"https://p16.ibyteimg.com/label.pdf",tracking_number:"TRACK123"};}if(path.endsWith("/handover_time_slots"))return {can_drop_off:true};return {package_id:packageId,package_status:status,shipping_type:"TIKTOK",orders:[{id:wrongOrder?"999999999":orderId.slice(7)}]};};
  const source=ts.transpileModule(fs.readFileSync(new URL("../lib/tiktok-shipping.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};const modules={"node:crypto":{randomUUID:()=>"owner"},"pdf-lib":{PDFDocument},"./mobile-api":{mobileServiceClient:()=>db},"./tiktok-connection":{tikTokAccess:async()=>({shop_id:"shop",shop_cipher:"cipher",token:"private",granted_scopes:scopes})},"./tiktok-client":{TikTokApiError,tikTokRequest:api},"./tiktok-orders":{fetchTikTokOrderDetails:async()=>[{id:orderId.slice(7),status:"AWAITING_SHIPMENT",packages:[{id:packageId}]}]},"./tiktok-shipping-policy":{hasShippingScope,trustedTikTokDocumentUrl,validateHandover,validateShippingPackage},"@/src/modules/businesses/default-business":{ensureDefaultBusiness:async()=>({id:"business"})},"@/src/modules/whatsapp/media-assets":{createOrReuseMediaAssetFromBytes:async()=>({contentHash:"a".repeat(64)}),mediaAssetPublicUrls:h=>({originalUrl:`/media-assets/${h}/original`})}};
  vm.runInNewContext(source,{exports,require:name=>{assert.ok(modules[name],name);return modules[name];},Buffer,URL,Date,AbortSignal,fetch:async()=>new Response(bytes,{headers:{"content-type":"application/pdf"}})});
  return {run:(action="arrange")=>exports.performTikTokShipping(orderId,packageId,action,{method:"SHOP_DEFAULT"}),calls,states,saved,unlocks:()=>unlocks};
}
let h=harness();await h.run();assert.equal(h.calls.filter(c=>c.path.endsWith("/ship")).length,1);assert.deepEqual(h.states,["attempting","arranged"]);assert.deepEqual(Object.keys(h.calls.find(c=>c.path.endsWith("/ship")).body),[]);assert.equal(h.calls.some(c=>c.path.endsWith("/handover_time_slots")),false);assert.equal(h.saved[0].name,"save_tiktok_shipping_label");assert.equal(h.saved[0].args.p_order,orderId);assert.equal(h.saved[0].args.p_tracking,"TRACK123");assert.equal(h.unlocks(),1);
h=harness({status:"PROCESSING",bookingState:"arranged"});await h.run("label");assert.equal(h.calls.some(c=>c.path.endsWith("/ship")),false);
h=harness({labelError:true});await assert.rejects(h.run(),/Shipment is arranged/);assert.deepEqual(h.states,["attempting","arranged"]);assert.equal(h.saved.length,0);assert.equal(h.unlocks(),1);
h=harness({bookError:new Error("network timeout")});await assert.rejects(h.run(),/did not confirm/);assert.equal(h.states.at(-1),"uncertain");assert.equal(h.calls.some(c=>c.path.endsWith("shipping_documents")),false);
h=harness({bookError:new TikTokApiError(36009003)});await assert.rejects(h.run());assert.equal(h.states.at(-1),"uncertain");
for(const options of [{bookingState:"uncertain"},{wrongOrder:true},{scopes:["seller.order.info"]},{lockTaken:true}]){h=harness(options);await assert.rejects(h.run());assert.equal(h.calls.some(c=>c.path.endsWith("/ship")),false);}
console.log("Shipping tests passed: correct labels, no rebooking on retrieval, delayed-label recovery, uncertain-booking protection, ownership, scopes and lease checks.");
