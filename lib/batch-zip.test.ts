import assert from "node:assert/strict";
import test from "node:test";
import { audioZip, crc32 } from "./batch-zip.ts";
test("ZIP contains intact audio bytes, CRCs, UTF-8 names and a valid directory", async () => {
  const bytes=new TextEncoder().encode("123456789"); assert.equal(crc32(bytes),0xcbf43926);
  const zip=audioZip([{name:"001-1887.mp3",bytes},{name:"002-Nessa ❤️.wav",bytes:new Uint8Array([0,1,2,255])}]);
  const data=new Uint8Array(await zip.arrayBuffer()),view=new DataView(data.buffer),end=data.length-22;
  assert.equal(view.getUint32(0,true),0x04034b50); assert.equal(view.getUint16(6,true),0x800); assert.equal(view.getUint32(14,true),0xcbf43926);
  const length=view.getUint16(26,true); assert.equal(new TextDecoder().decode(data.slice(30,30+length)),"001-1887.mp3"); assert.deepEqual(data.slice(30+length,30+length+bytes.length),bytes);
  assert.equal(view.getUint32(end,true),0x06054b50); assert.equal(view.getUint16(end+10,true),2);
  const directory=view.getUint32(end+16,true); assert.equal(view.getUint32(directory,true),0x02014b50);
  assert.equal(directory+view.getUint32(end+12,true),end);
});
test("ZIP rejects duplicate filenames and traversal paths", () => {
  const bytes=new Uint8Array([1]); assert.throws(()=>audioZip([{name:"../voice.mp3",bytes}])); assert.throws(()=>audioZip([{name:"voice.mp3",bytes},{name:"voice.mp3",bytes}])); assert.throws(()=>audioZip([]));
});
