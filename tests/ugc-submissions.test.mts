import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {ugcCustomerDetails,ugcVideoType,ugcVideoLimit} from '../lib/ugc-submission-validation';
import {verifyUgcProxy} from '../lib/shopify-proxy-auth';
it('requires content permission, contact information, and bounded video files',()=>{
 const details={customerName:' Customer ',phone:'0123456789',email:'test@example.com',orderNumber:'#123',consent:true};
 expect(ugcCustomerDetails(details).customer_name).toBe('Customer');
 expect(()=>ugcCustomerDetails({...details,consent:false})).toThrow('permission');
 expect(()=>ugcCustomerDetails({...details,email:'bad'})).toThrow('email');
 expect(ugcVideoType('clip.MOV','video/quicktime',123)).toBe('video/quicktime');
 expect(()=>ugcVideoType('file.html','text/html',123)).toThrow();
 expect(()=>ugcVideoType('file.mp4','video/mp4',ugcVideoLimit+1)).toThrow();
});
it('accepts signed storefront requests and rejects tampering, other stores and expiry',()=>{
 const url=new URL('https://app.test/closer-proxy/ugc-submission');
 url.searchParams.set('shop','shop.myshopify.com');url.searchParams.set('timestamp',String(Math.floor(Date.now()/1000)));url.searchParams.append('extra','1');url.searchParams.append('extra','2');
 const payload=[...new Set(url.searchParams.keys())].sort().map(key=>`${key}=${url.searchParams.getAll(key).join(',')}`).join('');
 url.searchParams.set('signature',createHmac('sha256','secret').update(payload).digest('hex'));
 expect(()=>verifyUgcProxy(url,'secret','shop.myshopify.com')).not.toThrow();
 expect(()=>verifyUgcProxy(url,'secret','other.myshopify.com')).toThrow();
 url.searchParams.set('extra','changed');expect(()=>verifyUgcProxy(url,'secret','shop.myshopify.com')).toThrow();
 url.searchParams.set('timestamp','1');expect(()=>verifyUgcProxy(url,'secret','shop.myshopify.com')).toThrow('expired');
});
it('approves exactly one linked reward, rejects stale reviews and protects submission data',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  for(const name of ['20261017154739_marketing_customer_ugc.sql','20261029104521_ugc_product_collection.sql','20261029114847_customer_ugc_submissions.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  const id='00000000-0000-4000-8000-000000000001';
  await db.query("insert into marketing_ugc_submissions(id,token_hash,client_hash,status,customer_name,order_number,consent,video_path,submitted_at) values($1,'hash','client','pending','Customer','#1',true,'video.mp4',now())",[id]);
  const timestamp=(await db.query<{updated_at:Date}>('select updated_at from marketing_ugc_submissions')).rows[0].updated_at;
  await expect(db.query("select review_ugc_submission($1,now()+interval '1 day','approve','Admin','','plush_charms_v1','UGC-TEST')",[id])).rejects.toThrow('changed');
  const review=()=>db.query("select review_ugc_submission($1,$2,'approve','Admin','Reviewed','plush_charms_v1','UGC-TEST')",[id,timestamp]);
  await review();await review();
  expect((await db.query('select id,product_collection from marketing_ugc_samples')).rows).toEqual([{id,product_collection:'plush_charms_v1'}]);
  expect((await db.query('select status,reward_id from marketing_ugc_submissions')).rows).toEqual([{status:'approved',reward_id:id}]);
  await expect(db.query("select review_ugc_submission($1,$2,'reject','Admin','','classics','UGC-NO')",[id,timestamp])).rejects.toThrow('changed');
  await db.exec("insert into marketing_ugc_submissions(token_hash,client_hash,status,customer_name,video_path,consent) values('h2','c2','pending','Other','video.mp4',true)");
  await db.exec("select review_ugc_submission(id,updated_at,'reject','Admin','No thank you','classics','UGC-NO') from marketing_ugc_submissions where token_hash='h2'");
  expect((await db.query('select count(*)::int n from marketing_ugc_samples')).rows[0]).toEqual({n:1});
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await expect(db.query('select * from marketing_ugc_submissions')).rejects.toThrow('permission');await expect(db.query("select start_ugc_submission('x','y')")).rejects.toThrow('permission');await db.exec('reset role');}
 }finally{await db.close();}
});
