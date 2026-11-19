import test from "node:test";
import assert from "node:assert/strict";
import { confirmedCameraCode, createCameraScan, type CameraPass } from "./nfc-camera-scan.ts";

test("a readable contrast frame needs three passes across two frames instead of eight", async () => {
  const scan=createCameraScan(), passes:CameraPass[]=[];
  const detect=async (pass:CameraPass)=>{passes.push(pass);return pass==="contrast"?[{rawValue:"NFC-100001"}]:[];};
  const signal=new AbortController().signal;
  const first=await scan(detect,signal), second=await scan(detect,signal);
  assert.deepEqual(passes,["original","contrast","contrast"]);
  assert.equal(confirmedCameraCode(first,null).confirmed,false);
  assert.equal(confirmedCameraCode(second,first[0].rawValue).confirmed,true);
});

test("a changed view can recover using every full-frame fallback", async () => {
  const scan=createCameraScan(), signal=new AbortController().signal;
  await scan(async pass=>pass==="right"?[{rawValue:"NFC-100001"}]:[],signal);
  const passes:CameraPass[]=[];
  assert.deepEqual(await scan(async pass=>{passes.push(pass);return pass==="original"?[{rawValue:"NFC-100002"}]:[];},signal),[{rawValue:"NFC-100002"}]);
  assert.deepEqual(passes,["right","original"]);
});

test("multiple codes, changing codes, and non-NFC codes never confirm", () => {
  for(const values of [[],[{rawValue:"NFC-100001"},{rawValue:"NFC-100002"}],[{rawValue:"NFC-100002"}],[{rawValue:"MPI-100001"}]]) {
    assert.equal(confirmedCameraCode(values,"NFC-100001").confirmed,false);
  }
});

test("stopping scanning discards a pending decode and skips further passes", async () => {
  const controller=new AbortController();let calls=0;
  const scan=createCameraScan();
  assert.deepEqual(await scan(async()=>{calls++;controller.abort();return [{rawValue:"NFC-100001"}];},controller.signal),[]);
  await scan(async()=>{calls++;return [];},controller.signal);
  assert.equal(calls,1);
});
