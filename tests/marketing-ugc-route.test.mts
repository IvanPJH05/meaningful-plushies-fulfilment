import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),client:vi.fn(),create:vi.fn(),disable:vi.fn()}));
vi.mock("../lib/mobile-api",()=>({requireMobileSession:mocks.session,mobileServiceClient:mocks.client}));
vi.mock("../lib/manual-orders",()=>({createUgcSampleDiscountCode:mocks.create,deactivateManualOrderDiscount:mocks.disable}));
import {POST,GET,PATCH} from "../app/api/marketing/ugc/route";
const id="00000000-0000-4000-8000-000000000001";
const sample={id,customer_name:"Customer",sample_code:"UGC-TEST",shopify_discount_id:"",status:"pending",updated_at:"2026-10-17T00:00:00Z"};
function request(body:unknown={},method="POST"){return new Request("https://app.test/api/marketing/ugc",{method,headers:{authorization:"Bearer test"},...(method==="GET"?{}:{body:JSON.stringify(body)})});}
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({role:"admin",username:"Admin"});});
it.each([POST,GET,PATCH])("rejects staff before accessing records or Shopify",async handler=>{mocks.session.mockResolvedValue({role:"staff"});expect((await handler(request())).status).toBe(403);expect(mocks.client).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();});
it("retains a pending record when Shopify fails, allowing retry with the same code",async()=>{
 const find={select:()=>find,eq:()=>find,maybeSingle:async()=>({data:sample,error:null})};mocks.client.mockReturnValue({from:()=>find});mocks.create.mockRejectedValue(new Error("Shopify unavailable"));
 const response=await POST(request({id}));expect(await response.json()).toEqual({sample,error:"Shopify unavailable"});expect(mocks.create).toHaveBeenCalledWith("UGC-TEST","Customer",id);
});
it("retry returns an existing active code without creating a second discount",async()=>{
 const active={...sample,status:"active",shopify_discount_id:"gid://shopify/DiscountCodeNode/1"};const find={select:()=>find,eq:()=>find,maybeSingle:async()=>({data:active,error:null})};mocks.client.mockReturnValue({from:()=>find});expect(await(await POST(request({id}))).json()).toEqual({sample:active});expect(mocks.create).not.toHaveBeenCalled();
});
it("disabled offers cannot be recreated",async()=>{
 const find={select:()=>find,eq:()=>find,maybeSingle:async()=>({data:{...sample,status:"disabled"},error:null})};mocks.client.mockReturnValue({from:()=>find});expect((await POST(request({id}))).status).toBe(400);expect(mocks.create).not.toHaveBeenCalled();
});
