import {test} from "node:test";
import assert from "node:assert/strict";
import {dailyManualPaymentSummary,manualPaymentDayRange,type DailyPaymentRow} from "./daily-manual-payments.ts";
const base:DailyPaymentRow={id:"a",customer_name:"Test",status:"created",paid_at:"2026-11-02T16:00:00Z",shopify_order_id:"123",shopify_order_name:"#123",payment_receipts:[{url:"https://example.test/receipt"}]};
test("Malaysia payment day includes midnight and excludes next midnight, unpaid, cancelled and COD",()=>{
 const rows=[base,{...base,id:"last",shopify_order_id:"456",paid_at:"2026-11-03T15:59:59Z"},{...base,id:"old",paid_at:"2026-11-02T15:59:59Z"},{...base,id:"next",paid_at:"2026-11-03T16:00:00Z"},{...base,id:"unpaid",status:"awaiting_payment"},{...base,id:"cancelled",status:"cancelled"},{...base,id:"cod",payment_receipts:[{url:"manual-order://cash-on-delivery"}]},{...base,id:"no-receipt",payment_receipts:[]}];
 const summary=dailyManualPaymentSummary(rows,"2026-11-03");assert.equal(summary.paymentCount,2);assert.equal(summary.orderCount,2);assert.deepEqual(summary.missingOrders,[]);
});
test("receipt without created order is flagged; duplicate Shopify order cannot inflate order count",()=>{
 const result=dailyManualPaymentSummary([base,{...base,id:"b"},{...base,id:"c",status:"ready_to_create",shopify_order_id:null}],"2026-11-03");assert.equal(result.paymentCount,3);assert.equal(result.orderCount,1);assert.deepEqual(result.missingOrders,[{id:"c",customerName:"Test"}]);
});
test("zero payments is valid and malformed dates fail",()=>{assert.equal(dailyManualPaymentSummary([],"2026-11-03").orderCount,0);assert.throws(()=>manualPaymentDayRange("2026-02-30"));assert.throws(()=>manualPaymentDayRange(""));});
