import test from "node:test";
import assert from "node:assert/strict";
import {batchSchedule,matchesProductionBarcode,nextProductionStage} from "./production-tracking.ts";
import {renderCustomerTracking} from "./customer-production-tracking.ts";
test("10pm Malaysia cycle crosses month and year boundaries correctly",()=>{
 assert.deepEqual(batchSchedule("2026-12-31"),{cutoff:"2026-12-31T22:00:00+08:00",tailorDate:"2027-01-01",packingDate:"2027-01-01",pickupDate:"2027-01-02",arrivalDate:"2027-01-03"});
 assert.equal(new Date(batchSchedule("2026-10-26").cutoff).toISOString(),"2026-10-26T14:00:00.000Z");
 assert.throws(()=>batchSchedule("2026-02-30"));assert.throws(()=>batchSchedule(""));
});
test("order scans match exact Shopify and TikTok references without substring matches",()=>{
 assert.ok(matchesProductionBarcode({orderNumber:"1953"},"MP-1953"));
 assert.ok(matchesProductionBarcode({orderNumber:"TT1345 13242433532"},"MP-TT1345"));
 assert.equal(matchesProductionBarcode({orderNumber:"19530"},"MP-1953"),false);
 assert.equal(matchesProductionBarcode({orderNumber:"TT1345 13242433532"},"1345"),false);
 assert.equal(matchesProductionBarcode({orderNumber:"1953"},""),false);
 assert.equal(nextProductionStage("audio_passed"),"packed");assert.equal(nextProductionStage("delivered"),undefined);
});
test("customer timeline shows only customer milestones and generic delay details",()=>{
 const html=renderCustomerTracking({stage:"at_tailor",delayed:true,pickupDate:"2027-01-02",events:[{stage:"received",created_at:"2026-12-31T14:01:00Z"},{stage:"at_tailor",created_at:"2026-12-31T17:00:00Z"}]});
 assert.match(html,/Your plushie is being sewn/);assert.match(html,/needs a little extra time/);assert.match(html,/Being updated/);
 assert.doesNotMatch(html,/customerName|phone|shippingAddress|tracking_token|actor|speaker broke|SUPABASE/);
 assert.match(renderCustomerTracking(null),/Tracking link not found/);
});

test("production scans identify each split plushie with the new packing barcode",()=>{
 const a={id:"1970-1",orderNumber:"1970"},b={id:"1970-2",orderNumber:"1970"};
 assert.equal(matchesProductionBarcode(a,"MPI-1970-1"),true);
 assert.equal(matchesProductionBarcode(b,"MPI-1970-1"),false);
 assert.equal(matchesProductionBarcode(a,"MP-1970"),false);
 assert.equal(matchesProductionBarcode(b,"1970"),false);
 assert.equal(matchesProductionBarcode({id:"abc-uuid",orderNumber:"TT12345 987"},"MPI-ABC-UUID"),true);
});
