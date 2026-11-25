import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role; create table public.fulfilment_orders(id text,data jsonb);');
await db.exec(await readFile(new URL('../supabase/migrations/20261125084200_packing_audio_revision.sql',import.meta.url),'utf8'));
async function revision(data){return (await db.query('select public.packing_audio_revision(row($1,$2::jsonb)::public.fulfilment_orders) as value',['order',JSON.stringify(data)])).rows[0].value;}
const first=await revision({salesChannel:'shopify',meaningfulMessage:'supabase-storage:voice-one',updatedAt:'before'});
assert.equal(first,await revision({salesChannel:'shopify',meaningfulMessage:'supabase-storage:voice-one',updatedAt:'after',trackingNumber:'updated-label',status:'sent_for_sewing'}));
assert.notEqual(first,await revision({salesChannel:'shopify',meaningfulMessage:'supabase-storage:voice-two'}));
assert.equal(await revision({salesChannel:'tiktok',tikTokFileDataUrl:'data:audio/example',meaningfulMessage:'ignored'}),await revision({salesChannel:'tiktok',tikTokFileDataUrl:'data:audio/example',meaningfulMessage:'changed'}));
assert.notEqual(await revision({salesChannel:'tiktok',tikTokFileDataUrl:'one'}),await revision({salesChannel:'tiktok',tikTokFileDataUrl:'two'}));
assert.match(first,/^[a-f0-9]{32}$/);
assert.equal((await db.query("select has_function_privilege('anon','public.packing_audio_revision(public.fulfilment_orders)','execute') as allowed")).rows[0].allowed,false);
await db.close();console.log('Audio revisions survive status/tracking edits, invalidate changed recordings, use the correct channel source, and remain service-only.');
