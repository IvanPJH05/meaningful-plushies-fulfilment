import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../lib/certificate-sync.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const keys=['code','order_number','created_at','id_name','gender','born_on','birthplace','favourite_person','belongs_to','meaningful_note','plush_background_bottom','plush_details','certificate'];
async function scenario(order,link={sessions:[]},existing=null){
 const writes=[];const calls=[];const exports={};
 const shopify={shopDomain:()=> 'example.myshopify.com',certificateMediaForLineItem:()=>undefined,plushBackgroundForMeaningfulNote:()=>undefined,shopifyGraphql:async(_domain,query,variables)=>{
   calls.push(query);
   if(query.includes('mutation')){writes.push(variables);return {data:{metaobjectUpsert:{metaobject:{id:existing?.id||'created'},userErrors:[]}}};}
   return {data:{metaobject:query.includes('LinkedCertificate(')?existing:null,metaobjectByHandle:existing,metaobjectDefinitionByType:{fieldDefinitions:keys.map(key=>({key,name:key}))}}};
 }};
 vm.runInNewContext(compiled,{exports,process:{env:{}},require(name){if(name==='node:crypto')return {};if(name==='./mobile-api')return {mobileServiceClient:()=>({rpc:async()=>({data:link,error:null})})};if(name==='./shopify-orders')return shopify;if(name==='./plush-charm')return {isPlushCharmOrder:o=>o.productType==='plush_charm'};if(name==='./certificate-sync-fields')return {certificateDetails:o=>({idName:o.plushName,gender:o.plushGender,bornOn:o.plushBirthDate,birthplace:o.plushBirthPlace,favouritePerson:o.plushFavouritePerson,belongsTo:o.plushBelongsTo,meaningfulNote:o.meaningfulNote})};throw Error(name);}});
 await exports.syncLinkedCertificate(order);return {writes,calls};
}
const order={id:'test',certificateCode:'12345678901',orderNumber:'1234',orderDate:'2026-11-03',character:'Billy',product:'Billy',salesChannel:'tiktok',plushName:'',plushGender:'',plushBirthPlace:''};
for(const salesChannel of ['tiktok','shopify','whatsapp']){
 const {writes}=await scenario({...order,salesChannel});assert.equal(writes.length,1);assert.equal(writes[0].handle.handle,order.certificateCode);assert.equal(writes[0].metaobject.capabilities.publishable.status,'ACTIVE');assert.ok(writes[0].metaobject.fields.some(f=>f.key==='code'));assert.ok(!writes[0].metaobject.fields.some(f=>f.value===''));assert.ok(!writes[0].metaobject.fields.some(f=>f.key==='id_name'));
}
const stale=await scenario(order,{sessions:[{certificate_code:order.certificateCode,certificate_metaobject_id:'deleted'}]});assert.equal(stale.writes.length,1);assert.ok(stale.calls.some(q=>q.includes('LinkedCertificateHandle')));
await assert.rejects(scenario(order,{duplicate:true,sessions:[]}),/another order/);
await assert.rejects(scenario({...order,certificateCode:''}),/No birth certificate/);
await assert.rejects(scenario({...order,productType:'plush_charm'}),/Our Link/);
const existing={id:'existing',type:'version_1_certs',handle:order.certificateCode,fields:[{key:'code',value:order.certificateCode}]};
const edited=await scenario(order,{sessions:[]},existing);assert.ok(edited.writes[0].metaobject.fields.some(f=>f.key==='birthplace'&&f.value===''));
await assert.rejects(scenario(order,{sessions:[]},{...existing,fields:[{key:'code',value:'other'}]}),/does not match/);
console.log('Optional details create active pages across channels; stale IDs recover; duplicate, identity and Charm guards remain intact.');
