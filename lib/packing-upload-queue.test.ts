import test from "node:test";
import assert from "node:assert/strict";
import {uploadPackingVideo} from "./packing-upload-queue.ts";
import type {QueuedPackingVideo} from "./packing-upload-queue.ts";
const job:QueuedPackingVideo={meta:{id:"00000000-0000-4000-8000-000000000001",orderId:"2059-2",orderNumber:"2059-2",orderBarcode:"MPI-2059-2",cardCode:"NFC-100001",scannedAt:new Date().toISOString(),sourceStartedAt:new Date(Date.now()-5000).toISOString(),size:5,contentType:"video/webm"},blob:new Blob(["video"],{type:"video/webm"})};
test("direct uploads keep the blob outside Vercel and confirm the completed private video",async()=>{
  const original=globalThis.fetch,calls:{url:string;init?:RequestInit}[]=[];
  globalThis.fetch=async(input,init)=>{
    calls.push({url:String(input),init});
    return Response.json(calls.length===1?{signedUrl:"https://storage.example/signed"}:calls.length===2?{}:{ready:true});
  };
  try {
    assert.equal(await uploadPackingVideo(job,"staff-token"),true);
    assert.equal(calls.length,3);assert.equal(calls[1].url,"https://storage.example/signed");assert.equal(calls[1].init?.body,job.blob);
    assert.equal((calls[1].init?.headers as Record<string,string>).Authorization,undefined);
    assert.equal(JSON.parse(calls[2].init?.body as string).id,job.meta.id);
  }finally{globalThis.fetch=original;}
});
test("retries resume an uploaded source; ready and processing states never duplicate attachments",async()=>{
  const original=globalThis.fetch;
  try {
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(calls===1?{uploaded:true}:{ready:true});};
    assert.equal(await uploadPackingVideo(job,"staff"),true);assert.equal(calls,2);
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ready:true});};
    assert.equal(await uploadPackingVideo(job,"staff"),true);assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json(calls===1?{uploaded:true}:{processing:true});};
    assert.equal(await uploadPackingVideo(job,"staff"),false);
    calls=0;globalThis.fetch=async()=>{calls++;return calls===1?Response.json({signedUrl:"https://storage.example/signed"}):new Response("offline",{status:503});};
    await assert.rejects(uploadPackingVideo(job,"staff"),/interrupted/);assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
});
