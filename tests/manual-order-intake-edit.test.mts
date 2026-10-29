import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {beforeEach,afterEach,it,expect} from 'vitest';
let db:PGlite;
const intakeId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const expected='2026-10-25T00:00:00Z';
const payload={customer_name:'Updated Customer',customer_email:'updated@example.test',phone_original:'0123456789',phone_normalized:'60123456789',character:'Hunnie',product_key:'plushie_10s',product_display_name:'Hunnie - 10 seconds',shopify_variant_id:'gid://shopify/ProductVariant/123',shipping_region:'WEST',shipping_address:{address1:'Updated street',city:'City',province:'State',zip:'12345',countryCode:'MY'},payment_receipts:[{fileName:'Receipt',url:'https://example.test/receipt'}]};
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema storage; create table storage.objects(bucket_id text,name text);
 create table public.customisation_sessions(id uuid primary key,order_id text,fulfilment_order_id text,form_data jsonb,voice_storage_path text,updated_at timestamptz);
 create table public.manual_order_intakes(id uuid primary key,customisation_session_id uuid,status text,shopify_order_id text,customer_name text,customer_email text,phone_original text,phone_normalized text,character text,product_key text,product_display_name text,shopify_variant_id text,shipping_region text,shipping_address jsonb,payment_receipts jsonb,paid_at timestamptz,updated_at timestamptz);
 insert into public.customisation_sessions values('${sessionId}',null,null,'{"plushName":"Original","other":"preserve"}','${sessionId}/original.webm','${expected}');
 insert into public.manual_order_intakes(id,customisation_session_id,status,customer_name,payment_receipts,updated_at) values('${intakeId}','${sessionId}','ready_to_create','Original Customer','[]','${expected}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261025170804_edit_manual_order_submissions.sql',import.meta.url),'utf8'));
});
afterEach(async()=>{await db.close();});
const save=(version=expected,voice:string|null=null)=>db.query('select public.edit_manual_order_submission($1,$2,$3,$4,$5)',[intakeId,version,JSON.stringify(payload),JSON.stringify({plushName:'Updated',gender:'Female'}),voice]);
it('saves customer and customisation atomically while preserving existing voice and extra fields',async()=>{
 await save();
 const i=(await db.query<any>('select * from public.manual_order_intakes')).rows[0];
 const s=(await db.query<any>('select * from public.customisation_sessions')).rows[0];
 expect(i.customer_name).toBe('Updated Customer');expect(i.status).toBe('ready_to_create');expect(i.shipping_address.zip).toBe('12345');
 expect(s.form_data).toEqual({plushName:'Updated',gender:'Female',other:'preserve'});expect(s.voice_storage_path).toBe(sessionId+'/original.webm');
});
it('rejects stale saves without changing either record',async()=>{
 await expect(save('2026-10-24T00:00:00Z')).rejects.toThrow('changed');
 expect((await db.query<any>('select form_data from public.customisation_sessions')).rows[0].form_data.plushName).toBe('Original');
});
it('will not edit a created Shopify order',async()=>{
 await db.exec("update public.manual_order_intakes set shopify_order_id='gid://shopify/Order/123'");
 await expect(save()).rejects.toThrow('already been created');
});
it('requires an existing replacement voice belonging to this session',async()=>{
 await expect(save(expected,'another-session/voice.webm')).rejects.toThrow('could not be verified');
 expect((await db.query<any>('select customer_name from public.manual_order_intakes')).rows[0].customer_name).toBe('Original Customer');
 await db.query('insert into storage.objects values($1,$2)',['customisation-audio',sessionId+'/replacement.webm']);
 await save(expected,sessionId+'/replacement.webm');
 expect((await db.query<any>('select voice_storage_path from public.customisation_sessions')).rows[0].voice_storage_path).toBe(sessionId+'/replacement.webm');
});
it('does not expose the edit function to public client roles',async()=>{
 const permissions=(await db.query<any>("select has_function_privilege('anon','public.edit_manual_order_submission(uuid,timestamptz,jsonb,jsonb,text)','EXECUTE') anon, has_function_privilege('authenticated','public.edit_manual_order_submission(uuid,timestamptz,jsonb,jsonb,text)','EXECUTE') authenticated")).rows[0];
 expect(permissions.anon).toBe(false);expect(permissions.authenticated).toBe(false);
});
