import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {isUgcOrder,normalizeUgcCode,ugcClaimLink} from "./marketing-ugc.ts";

test("UGC recognises exact registered codes, including historical codes and mixed case",()=>{
 assert.equal(isUgcOrder({discountCodes:[" ugc-sam "]},["UGC-SAM"]),true);
 assert.equal(isUgcOrder({discountCodeUsed:"UGC-SAM"},["UGC-SAM"]),true);
 assert.equal(isUgcOrder({discountCodeUsed:"UGC-SAM-EXTRA"},["UGC-SAM"]),false);
 assert.equal(isUgcOrder({discountCodeUsed:"FREE-CREATOR"},["UGC-SAM"]),false);
});
test("UGC claim codes are namespaced and cart links allow any product",()=>{
 assert.equal(normalizeUgcCode(" sam "),"UGC-SAM");
 assert.equal(normalizeUgcCode("ugc-sam"),"UGC-SAM");
 assert.throws(()=>normalizeUgcCode("bad code"));
 assert.equal(ugcClaimLink("UGC-SAM"),"https://meaningfulplushies.com/discount/UGC-SAM?redirect=/collections/all");
});
test("UGC records are shared, unique, and inaccessible to browser database roles",async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/migrations/20261017154739_marketing_customer_ugc.sql",import.meta.url),"utf8"));
  await db.exec("set role service_role;insert into marketing_ugc_samples(id,customer_name,sample_code,created_by) values('00000000-0000-4000-8000-000000000001','Customer','UGC-TEST','Admin');reset role;");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from marketing_ugc_samples")).rows[0].n,1);
  await assert.rejects(db.exec("insert into marketing_ugc_samples(id,customer_name,sample_code,created_by) values('00000000-0000-4000-8000-000000000002','Customer','UGC-TEST','Admin')"),/unique/);
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query("select * from marketing_ugc_samples"),/permission denied/);await assert.rejects(db.exec("insert into marketing_ugc_samples(id,customer_name,sample_code,created_by) values(gen_random_uuid(),'Customer','UGC-BAD','x')"),/permission denied/);await db.exec("reset role");}
 }finally{await db.close();}
});
