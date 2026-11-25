/* eslint-disable @typescript-eslint/no-explicit-any -- Query-builder double for paginated route integration. */
import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),from:vi.fn(),pages:[] as any[],projections:[] as string[],orders:[] as any[],production:[] as any[]}));
vi.mock("../lib/certificate-cards-server",()=>({context:mocks.context,headers:{"Cache-Control":"private, no-store"},failure:(error:Error)=>Response.json({error:error.message},{status:401}),PairingError:class extends Error{}}));
vi.mock("../app/api/mobile/packing/route",()=>({GET:vi.fn(),POST:vi.fn()}));
import {GET} from "../app/api/production-tracking/warehouse/route";
beforeEach(()=>{
 vi.resetAllMocks();mocks.pages=[];mocks.projections=[];
 mocks.orders=Array.from({length:241},(_,n)=>({id:"order-"+String(n).padStart(4,"0"),order_number:String(2000+n),status:"sent_for_sewing",updated_at:"v1"}));mocks.production=[];
 mocks.from.mockImplementation((table:string)=>{
  let cursor="",limit=1000,sort="id";const filters:Array<(row:any)=>boolean>=[];const query:any={select:(projection:string)=>{if(table==="fulfilment_orders")mocks.projections.push(projection);return query;},eq:(column:string,value:string)=>{filters.push(row=>row[column]===value);return query;},in:(column:string,values:string[])=>{filters.push(row=>values.includes(row[column]));return query;},order:(column:string)=>{sort=column;return query;},limit:(value:number)=>{limit=value;return query;},gt:(column:string,value:string)=>{cursor=value;filters.push(row=>row[column]>value);return query;},then:(resolve:any)=>{mocks.pages.push({table,cursor,limit,sort});const source=table==="production_items"?mocks.production:mocks.orders;resolve({data:source.filter(row=>filters.every(f=>f(row))).sort((a,b)=>a[sort]<b[sort]?-1:a[sort]>b[sort]?1:0).slice(0,limit),error:null});}};return query;
 });mocks.context.mockResolvedValue({client:{from:mocks.from}});
});
it("serves every sewing order over keyset pages without embedded audio payloads",async()=>{
 let cursor="",count=0;
 do{const response=await GET(new Request("https://app.test/api/production-tracking/warehouse"+(cursor?"?after="+cursor:"")));expect(response.status).toBe(200);const body=await response.json();count+=body.items.length;cursor=body.nextCursor;}while(cursor);
 expect(count).toBe(241);expect(mocks.pages.filter(p=>p.table==="fulfilment_orders").map(p=>p.cursor)).toEqual(["","order-0099","order-0199"]);expect(mocks.projections.every(p=>!p.includes("!inner")&&!p.split(",").includes("data"))).toBe(true);
});
it("includes Daily Production sewing orders despite different fulfilment statuses and deduplicates both queues",async()=>{
 mocks.orders=Array.from({length:261},(_,n)=>({id:"item-"+String(n).padStart(4,"0"),order_number:String(3000+n),status:n<9?"sent_for_sewing":"completed",audioRevision:"source-v1"}));
 mocks.production=mocks.orders.slice(0,251).map((o,n)=>({order_id:o.id,batch_id:"batch",disposition:n===250?"deferred":"active",stage:n===249?"packed":"at_tailor"}));
 const items:any[]=[];let cursor="";do{const response=await GET(new Request("https://app.test/api/production-tracking/warehouse"+(cursor?"?after="+cursor:"")));const body=await response.json();expect(response.status).toBe(200);items.push(...body.items);cursor=body.nextCursor;}while(cursor);
 expect(items).toHaveLength(249);expect(new Set(items.map(i=>i.order_id)).size).toBe(249);expect(items.every(i=>i.batchId==="batch"&&i.order.audioRevision==="source-v1")).toBe(true);
 expect(items.some(i=>i.order_id==="item-0249"||i.order_id==="item-0250")).toBe(false);
});
it("keeps the complete queue staff-only",async()=>{
 mocks.context.mockRejectedValueOnce(Error("Sign in required"));const denied=await GET(new Request("https://app.test/api/production-tracking/warehouse"));expect(denied.status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
});
