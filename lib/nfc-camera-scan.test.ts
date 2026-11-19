import test from "node:test";
import assert from "node:assert/strict";
import { confirmedCameraCode, createCameraCardCycle, createCameraScan, type CameraPass } from "./nfc-camera-scan.ts";

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

test("continuous writing advances through cards even when a quick swap misses the empty poll", () => {
  const cycle=createCameraCardCycle(), written:string[]=[];
  for(const [uid,code] of [["UID1","NFC-100001"],["UID2","NFC-100002"],["UID3","NFC-100003"]]) {
    assert.equal(cycle.observe(uid),"ready");
    assert.equal(cycle.read([{rawValue:code}]).confirmed,false);
    assert.equal(cycle.observe(uid),"ready");
    assert.equal(cycle.read([{rawValue:code}]).confirmed,true);
    cycle.beginWrite();written.push(code);cycle.finishWrite(true);
    for(let poll=0;poll<5;poll++)assert.equal(cycle.observe(uid),"waiting-removal");
  }
  assert.deepEqual(written,["NFC-100001","NFC-100002","NFC-100003"]);
});

test("normal removal clears the previous barcode before the next card", () => {
  const cycle=createCameraCardCycle();
  cycle.observe("UID1");cycle.read([{rawValue:"NFC-100001"}]);
  assert.equal(cycle.observe(null),"empty");
  assert.equal(cycle.observe("UID2"),"ready");
  assert.equal(cycle.read([{rawValue:"NFC-100001"}]).confirmed,false);
});

test("swapping a card before writing blocks both cards until the reader is cleared", () => {
  const cycle=createCameraCardCycle();
  cycle.observe("UID1");cycle.read([{rawValue:"NFC-100001"}]);
  assert.equal(cycle.observe("UID2"),"changed");
  assert.equal(cycle.observe("UID1"),"waiting-removal");
  assert.equal(cycle.observe(null),"empty");
  assert.equal(cycle.observe("UID2"),"ready");
  assert.equal(cycle.read([{rawValue:"NFC-100001"}]).confirmed,false);
});

test("failed writes do not repeat or advance automatically until physical removal", () => {
  const cycle=createCameraCardCycle();
  cycle.observe("UID1");cycle.beginWrite();cycle.finishWrite(false);
  assert.equal(cycle.observe("UID1"),"waiting-removal");
  assert.equal(cycle.observe("UID2"),"changed");
  cycle.observe(null);
  assert.equal(cycle.observe("UID2"),"ready");
});

test("a temporary reader disconnect requires fresh barcode confirmation and retains write locks", () => {
  const cycle=createCameraCardCycle();
  cycle.observe("UID1");cycle.read([{rawValue:"NFC-100001"}]);
  cycle.interrupt();
  assert.equal(cycle.observe("UID1"),"ready");
  assert.equal(cycle.read([{rawValue:"NFC-100001"}]).confirmed,false);
  cycle.beginWrite();cycle.finishWrite(true);cycle.interrupt();
  assert.equal(cycle.observe("UID1"),"waiting-removal");
  assert.equal(cycle.observe("UID2"),"ready");
});
