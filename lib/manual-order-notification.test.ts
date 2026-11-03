import test from "node:test";
import assert from "node:assert/strict";
import { manualOrderNotification } from "./manual-order-notification.ts";
const base = { reference: "MP-TEST", product: "Billy", amountToCollect: 115, shippingRegion: "WEST" as const };
test("West Malaysia shows waived RM8 without adding it to collection", () => {
 const result = manualOrderNotification(base);
 assert.equal(result.summary, "Here is your order summary\nRM115 + RM8 (shipping)\nI give you free shipping\nTotal is RM115");
 assert.match(result.body, /MP-TEST/); assert.match(result.body, /To collect: RM115/);
});
test("East Malaysia separates item price from the RM20 already in the total", () => {
 const result = manualOrderNotification({...base, shippingRegion:"EAST", amountToCollect:135});
 assert.equal(result.summary, "Here is your order summary\nRM115 + RM20 (East Malaysia shipping)\nTotal is RM135");
});
test("uses the submitted Malay selection for both shipping regions", () => {
 for(const shippingRegion of ["WEST", "EAST"] as const){const result=manualOrderNotification({...base,shippingRegion,amountToCollect:135,language:"ms-MY"});assert.match(result.summary,/Ini ringkasan pesanan anda/);assert.match(result.summary,/Jumlah ialah RM135/);assert.match(result.body,/Jumlah perlu dikutip/);}
});
test("preserves cents and never invents a customer quote when pricing is missing", () => {
 assert.match(manualOrderNotification({...base,amountToCollect:115.5}).summary,/RM115.50/);
 for(const amountToCollect of [null,NaN,-1]) assert.equal(manualOrderNotification({...base,amountToCollect}).summary, "");
 assert.equal(manualOrderNotification({...base,shippingRegion:"EAST",amountToCollect:10}).summary, "");
});
