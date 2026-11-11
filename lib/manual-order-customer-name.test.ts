import test from "node:test";
import assert from "node:assert/strict";
import { shopifyManualOrderCustomerName, shopifyManualOrderShippingName } from "./manual-order-customer-name.ts";

test("single-word delivery names satisfy Shopify's last-name requirement without duplicating the recipient",()=>{
  assert.deepEqual(shopifyManualOrderShippingName(" Afrina "),{firstName:"",lastName:"Afrina"});
  assert.deepEqual(shopifyManualOrderCustomerName("Afrina"),{firstName:"Afrina",lastName:""});
});
test("multi-word names retain every word and blank names cannot create an order",()=>{
  assert.deepEqual(shopifyManualOrderShippingName("  Nur  Afrina Binti Ali "),{firstName:"Nur",lastName:"Afrina Binti Ali"});
  assert.throws(()=>shopifyManualOrderShippingName("   "),/full name/);
});
