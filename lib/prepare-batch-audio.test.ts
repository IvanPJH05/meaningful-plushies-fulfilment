import test from "node:test";
import assert from "node:assert/strict";
import { prepareBatchAudioFiles } from "./prepare-batch-audio.ts";
import type { Order } from "./types";
const order = (id:string, source="") => ({id,orderNumber:id,character:"Billy",salesChannel:"tiktok",meaningfulMessage:"Gender: Male",tikTokFileDataUrl:source}) as Order;
test("missing submissions do not block the remaining batch audio", async () => {
 const original=globalThis.fetch, called:string[]=[];
 globalThis.fetch=async input=>{called.push(String(input));return new Response('ID3-audio',{headers:{'Content-Type':'audio/mpeg'}});};
 try {
  const result=await prepareBatchAudioFiles([order('missing'),order('ready','data:audio/mp3;base64,AA=='),order('later','data:audio/mp3;base64,AA==')],'batch','token',new AbortController().signal);
  assert.equal(result.available,2);assert.deepEqual(result.missing,['missing']);assert.equal(called.length,2);
  assert.equal(result.files.length,3);assert.equal(result.files[2].name,'voice-not-uploaded.txt');assert.match(new TextDecoder().decode(result.files[2].bytes),/#missing/);
 } finally {globalThis.fetch=original;}
});
test("all-missing batches finish preparation without downloading or building an empty ZIP", async()=>{
 const result=await prepareBatchAudioFiles([order('a'),order('b')],'batch','token',new AbortController().signal);
 assert.equal(result.available,0);assert.equal(result.files.length,0);assert.deepEqual(result.missing,['a','b']);
});
test("server-confirmed missing uploads are skipped, while genuine failures remain errors",async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({code:'VOICE_NOT_UPLOADED'},{status:400});
  assert.deepEqual((await prepareBatchAudioFiles([order('a','source')],'batch','token',new AbortController().signal)).missing,['a']);
  globalThis.fetch=async()=>Response.json({error:'Conversion failed'},{status:400});
  await assert.rejects(prepareBatchAudioFiles([order('a','source')],'batch','token',new AbortController().signal),/Conversion failed/);
 } finally {globalThis.fetch=original;}
});
