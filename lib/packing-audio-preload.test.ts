import test from "node:test";
import assert from "node:assert/strict";
import {sewingAudioManifest,preloadSewingAudio} from "./packing-audio-preload.ts";

test("preloads the entire sewing queue beyond 40, 80 and the database row cap, with only two downloads in flight",async()=>{
 const all=Array.from({length:1241},(_,id)=>({id})),cursors:string[]=[],prepared:number[]=[];let active=0,peak=0,failures=0;
 const items=await sewingAudioManifest(async cursor=>{cursors.push(cursor);const offset=Number(cursor||0),items=all.slice(offset,offset+100);return{items,nextCursor:items.length===100?String(offset+100):null};},()=>true);
 assert.equal(items.length,1241);assert.equal(cursors.length,13);
 await preloadSewingAudio(items,async item=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;prepared.push(item.id);if(item.id===45||item.id===1130)throw Error("Missing audio");},()=>true,count=>{failures=count;});
 assert.equal(prepared.length,1241);assert.equal(new Set(prepared).size,1241);assert.equal(peak,2);assert.equal(failures,2);assert.ok(prepared.includes(1240));
});

test("stops on unmount and rejects repeated page cursors instead of silently keeping a partial queue",async()=>{
 let active=true,calls=0;
 const items=await sewingAudioManifest(async()=>{calls++;active=false;return{items:[1],nextCursor:"next"};},()=>active);
 assert.equal(calls,1);assert.deepEqual(items,[]);
 await assert.rejects(sewingAudioManifest(async()=>({items:[1],nextCursor:"same"}),()=>true),/could not be completed/);
 let prepared=0;await preloadSewingAudio([1,2,3],async()=>{prepared++;},()=>false,()=>{});assert.equal(prepared,0);
});
