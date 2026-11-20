import test from "node:test";
import assert from "node:assert/strict";
import {packingBarcodeQuery,packingOrderItem,packingOrderProjection} from "./packing-station.ts";
test("packing lookup recognises individual Shopify and TikTok codes without accepting query syntax",()=>{
  assert.deepEqual(packingBarcodeQuery(" mpi-2059-2 "),{code:"MPI-2059-2",kind:"id",value:"2059-2"});
  assert.equal(packingBarcodeQuery("MPTT1445").kind,"tiktok");
  for(const code of ["", "MP%", "MPorder,id.eq.other", "MPI-abc_", "a".repeat(201)])assert.throws(()=>packingBarcodeQuery(code));
  const rows=[{id:"2059-1",order_number:"2059-1"},{id:"2059-2",order_number:"2059-2"}];
  assert.equal(packingOrderItem(rows,"MPI-2059-2")?.order_id,"2059-2");
  assert.equal(packingOrderItem(rows,"MP2059"),null);
  assert.throws(()=>packingOrderItem([{id:"tt-a",order_number:"TT1445 9798 -1"},{id:"tt-b",order_number:"TT1445 9798 -2"}],"MPTT1445"),/multiple items/);
});
test("large private media never leaks into the packing order response",()=>{
  const response=packingOrderItem([{id:"2059",order_number:"2059",status:"issue",plushName:"Billy",customerName:"Test",voiceLength:"10",data:{meaningfulMessage:"data:audio/wav;base64,"+"x".repeat(3_000_000)},phone:"private",address:"private"}],"MP2059");
  assert.equal(response?.order.status,"issue");assert.equal(response?.order.voiceLength,10);
  assert.ok(JSON.stringify(response).length<1500);
  assert.ok(!JSON.stringify(response).includes("private"));
  assert.ok(!packingOrderProjection.split(",").includes("data"));
});
