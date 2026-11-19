import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),from:vi.fn(),single:vi.fn(),rpc:vi.fn()}));
vi.mock("../lib/mobile-api",()=>({requireMobileSession:mocks.session,mobileServiceClient:()=>({from:mocks.from,rpc:mocks.rpc})}));
import { GET, POST } from "../app/api/fulfilment/nfc/route";
const card={id:100001,batch_id:"batch",public_token:"a".repeat(32),status:"available",programmed_at:null,order_id:null,paired_at:null};
const request=(query="cardId=100001&prepareWrite=1")=>new Request(`https://app.test/api/fulfilment/nfc?${query}`);
beforeEach(()=>{
  vi.resetAllMocks();process.env.NFC_SHARED_CARD_PASSWORD="A1B2";
  mocks.session.mockResolvedValue({role:"admin",username:"test",displayName:"Test"});
  mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:mocks.single})})});
  mocks.single.mockResolvedValue({data:card,error:null});
});
it("prepares a scan with one card lookup, without fetching batches or logs",async()=>{
  const response=await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({card,password:"A1B2"});
  expect(mocks.from.mock.calls).toEqual([["nfc_cards"]]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not return writer settings to unauthenticated or non-admin callers",async()=>{
  mocks.session.mockRejectedValueOnce(new Error("SIGN_IN_REQUIRED"));
  const denied=await GET(request());expect(denied.status).toBe(401);expect(await denied.text()).not.toContain("A1B2");
  mocks.session.mockResolvedValueOnce({role:"staff"});
  expect((await GET(request())).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();
});
it("rejects missing card IDs and invalid writer settings before reading inventory",async()=>{
  expect((await GET(request("prepareWrite=1"))).status).toBe(409);
  delete process.env.NFC_SHARED_CARD_PASSWORD;
  expect((await GET(request())).status).toBe(503);expect(mocks.from).not.toHaveBeenCalled();
});
it("returns current assigned/programmed state so scans still reject unavailable cards",async()=>{
  const unavailable={...card,status:"assigned",programmed_at:"2026-11-19T00:00:00Z"};
  mocks.single.mockResolvedValueOnce({data:unavailable,error:null});
  expect((await (await GET(request())).json()).card).toEqual(unavailable);
  mocks.single.mockResolvedValueOnce({data:null,error:null});
  expect((await (await GET(request())).json()).card).toBeNull();
});
it("programmed confirmation returns the persisted card without a second inventory read",async()=>{
  const saved={...card,programmed_at:"2026-11-19T00:00:00Z"};
  mocks.rpc.mockResolvedValueOnce({data:saved,error:null});
  const response=await POST(new Request("https://app.test/api/fulfilment/nfc",{method:"POST",body:JSON.stringify({action:"programmed",cardId:100001,reason:"readback verified"})}));
  expect(response.status).toBe(200);expect((await response.json()).card).toEqual(saved);
  expect(mocks.from).not.toHaveBeenCalled();
});
