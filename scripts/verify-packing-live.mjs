// Run only against an isolated disposable fixture created by the operator.
// Never supply a customer's order or a staff member's real credentials.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
if(!fixture.orderId.startsWith('packing-api-check-')||!fixture.username.startsWith('packing-check-'))throw new Error('An isolated packing fixture is required.');
const base=process.env.PACKING_VERIFY_BASE||'https://meaningful-plushies-fulfilment.vercel.app';
let token='';
async function call(path,body,authenticated=true){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(authenticated&&token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw new Error('Expected JSON from '+path+'; HTTP '+response.status);}
  return {status:response.status,data,bytes:Buffer.byteLength(text)};
}
const login=await call('/api/mobile/login',{username:fixture.username,password:fixture.password});assert.equal(login.status,200);token=login.data.token;assert.ok(token);
assert.equal((await call('/api/mobile/packing',undefined,false)).status,401);
assert.equal((await call('/api/production-tracking/proofs?orderId='+fixture.orderId,undefined,false)).status,401);
const connected=await call('/api/mobile/packing');assert.equal(connected.status,200);assert.equal(connected.data.connected,true);assert.equal(connected.data.protocol,1);
const barcode='MPI-'+fixture.orderId;
const lookup=await call('/api/mobile/packing?scanBarcode='+encodeURIComponent(barcode));assert.equal(lookup.status,200);assert.equal(lookup.data.item.order_id,fixture.orderId);assert.ok(lookup.bytes<2000,'Large media must be excluded from order lookup');
assert.equal((await call('/api/mobile/packing?scanBarcode='+encodeURIComponent('MP%'))).status,400);
for(let attempt=0;attempt<2;attempt++){const packed=await call('/api/production-tracking',{action:'scanner_pack',orderId:fixture.orderId,orderBarcode:barcode});assert.equal(packed.status,200);assert.equal(packed.data.ok,true);}
assert.equal((await call('/api/mobile/packing?scanBarcode='+encodeURIComponent(barcode))).data.item.order.status,'packed');
const pairing={action:'scanner_pair',orderId:fixture.orderId,orderBarcode:barcode,cardCode:fixture.card};
assert.equal((await call('/api/production-tracking',pairing)).status,200);
assert.equal((await call('/api/production-tracking',pairing)).status,200);
const other='MPI-'+fixture.otherOrderId;
assert.equal((await call('/api/production-tracking',{action:'scanner_pack',orderId:fixture.otherOrderId,orderBarcode:other})).status,200);
assert.equal((await call('/api/production-tracking',{action:'scanner_pair',orderId:fixture.otherOrderId,orderBarcode:other,cardCode:fixture.card})).status,409);
const now=Date.now();const recording={action:'prepare',id:fixture.proofId,orderId:fixture.orderId,orderNumber:'PACKING-API-VERIFICATION',orderBarcode:barcode,cardCode:fixture.card,scannedAt:new Date(now).toISOString(),sourceStartedAt:new Date(now-3000).toISOString(),size:12000,contentType:'video/mp4'};
const prepared=await call('/api/production-tracking/proofs',recording);assert.equal(prepared.status,200);const destination=new URL(prepared.data.signedUrl);assert.equal(destination.host,'joaoirpegnkexmktylop.supabase.co');assert.equal(destination.protocol,'https:');
const rebound=await call('/api/production-tracking/proofs',{...recording,orderId:fixture.otherOrderId,orderBarcode:other});assert.equal(rebound.status,400);
const proofs=await call('/api/production-tracking/proofs?orderId='+fixture.orderId);assert.equal(proofs.status,200);assert.equal(proofs.data.proofs.filter(p=>p.id===fixture.proofId).length,1);
// No bytes are uploaded, so the isolated fixture can be fully removed without
// leaving cloud storage objects behind. Actual encoding/upload recovery is
// verified by the native Android and packing upload integration test suites.
console.log(JSON.stringify({passed:true,lookupBytes:lookup.bytes,checks:['staff login','unauthenticated denial','live database and private bucket','bounded order lookup','Packed persistence','repeat scan safety','blank-profile card pairing','wrong-order rejection','private signed upload permission','recording cannot be rebound','proof attached to exact order']},null,2));
