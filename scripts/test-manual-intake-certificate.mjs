import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../lib/manual-order-intakes.ts',import.meta.url),'utf8')+'\nexport {saveManualIntakeToFulfilment};';
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario({cod=true,fallback=false,failBinding=false}={}) {
  const calls=[],writes=[],exports={};
  const intake={shopifyOrderName:'#2082',shopifyOrderId:'7129594757191',customisationSessionId:'submitted-session',productKey:'classic',productDisplayName:'Billy',character:'Billy',shippingAddress:{},isCod:cod,shippingRegion:'WEST'};
  const form={plushName:'ELHA'};
  const stale={id:'2082',orderNumber:'2082',status:'uploading_audio',certificateCode:'wrong-code',product:'Billy',character:'Billy',statusHistory:[]};
  const modules={
    '@supabase/supabase-js':{createClient:()=>({})},
    './supabase':{fetchSharedOrdersByOrderNumber:async()=>[],upsertSharedOrders:async rows=>{calls.push('save');writes.push(...rows);}},
    './shopify-orders':{cleanShopifyOrderNumber:()=> '2082',fetchShopifyOrderByNumber:async()=>fallback?null:{},textValue:v=>String(v||'')},
    './importer':{shopifyOrderToFulfilmentOrders:()=>[stale]},
    './manual-order-products':{manualOrderProductByKey:()=>null},
    './manual-order-product-paths':{normalizeManualOrderCharacter:()=> 'Billy'},
    './manual-order-intake-pricing':{manualOrderIntakeQuote:()=>({amountToCollect:125,shippingFee:0,speakerSeconds:10})},
    './customisation':{bindSessionsToOrders:async input=>{
      calls.push('bind');assert.equal(input.orderId,'gid://shopify/Order/7129594757191');assert.equal(input.orderNumber,'2082');assert.equal(input.sessionIds[0],'submitted-session');
      if(failBinding)throw Error('session belongs to another order');
      return input.orders.map(o=>({...o,certificateCode:'canonical-code',customisationSessionId:'submitted-session',idWebsiteLink:'canonical-link'}));
    }},
  };
  vm.runInNewContext(compiled,{exports,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-only'}},require:name=>modules[name]||{}});
  if(failBinding){await assert.rejects(exports.saveManualIntakeToFulfilment(intake,form,'','2026-11-24'),/another order/);assert.equal(writes.length,0);return;}
  assert.equal(await exports.saveManualIntakeToFulfilment(intake,form,'','2026-11-24'),1);
  assert.deepEqual(calls,['bind','save']);assert.equal(writes[0].certificateCode,'canonical-code');assert.equal(writes[0].customisationSessionId,'submitted-session');
  assert.equal(writes[0].plushName,'ELHA');
  if(!fallback)assert.equal(writes[0].status,'uploading_audio');
}
await scenario();await scenario({cod:false});await scenario({fallback:true});await scenario({failBinding:true});
console.log('Passed: COD, paid and fallback saves bind the session before writing; binding conflicts never save a mismatched order.');
