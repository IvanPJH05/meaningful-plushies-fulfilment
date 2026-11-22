/* eslint-disable @typescript-eslint/no-explicit-any -- Query-builder double for paginated route integration. */
import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),from:vi.fn(),pages:[] as any[],projections:[] as string[]}));
vi.mock("../lib/certificate-cards-server",()=>({context:mocks.context,headers:{"Cache-Control":"private, no-store"},failure:(error:Error)=>Response.json({error:error.message},{status:401}),PairingError:class extends Error{}}));
vi.mock("../app/api/mobile/packing/route",()=>({GET:vi.fn(),POST:vi.fn()}));
import {GET} from "../app/api/production-tracking/warehouse/route";
beforeEach(()=>{
 vi.resetAllMocks();mocks.pages=[];mocks.projections=[];
 const all=Array.from({length:241},(_,n)=>({id:"order-"+String(n).padStart(4,"0"),order_number:String(2000+n),status:"sent_for_sewing",updated_at:"v1"}));
 mocks.from.mockImplementation((table:string)=>{
  if(table==="production_items")return{select:()=>({in:()=>({eq:async()=>({data:[],error:null})})})};
  let cursor="",limit=0,stage="",sort="";const query:any={select:(projection:string)=>{mocks.projections.push(projection);return query;},eq:(_column:string,value:string)=>{stage=value;return query;},order:(column:string)=>{sort=column;return query;},limit:(value:number)=>{limit=value;return query;},gt:(_column:string,value:string)=>{cursor=value;return query;},then:(resolve:any)=>{mocks.pages.push({cursor,limit,stage,sort});resolve({data:all.filter(row=>row.id>cursor).slice(0,limit),error:null});}};return query;
 });mocks.context.mockResolvedValue({client:{from:mocks.from}});
});
it("serves every sewing order over keyset pages without embedded audio payloads",async()=>{
 let cursor="",count=0;
 do{const response=await GET(new Request("https://app.test/api/production-tracking/warehouse"+(cursor?"?after="+cursor:"")));expect(response.status).toBe(200);const body=await response.json();count+=body.items.length;cursor=body.nextCursor;}while(cursor);
 expect(count).toBe(241);expect(mocks.pages.map(p=>p.cursor)).toEqual(["","order-0099","order-0199"]);expect(mocks.pages.every(p=>p.limit===100&&p.stage==="sent_for_sewing"&&p.sort==="id")).toBe(true);expect(mocks.projections.every(p=>!p.includes("!inner")&&!p.split(",").includes("data"))).toBe(true);
});
it("keeps the complete queue staff-only",async()=>{
 mocks.context.mockRejectedValueOnce(Error("Sign in required"));const denied=await GET(new Request("https://app.test/api/production-tracking/warehouse"));expect(denied.status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
});
