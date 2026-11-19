// Exercise the actual shipped WASM decoder against pixels, without a physical camera.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { code128Modules, code128UnitCount } from "../lib/code128.ts";
import { createCameraScan, confirmedCameraCode } from "../lib/nfc-camera-scan.ts";

globalThis.ImageData=class ImageData {
  constructor(data,width,height){this.data=data;this.width=width;this.height=height;}
};
globalThis.DOMRectReadOnly=class DOMRectReadOnly {
  constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}
};
const source=await readFile(new URL("../public/nfc-camera/decoder.js",import.meta.url),"utf8");
const api=new Function(`${source};return BarcodeDetectionAPI;`)();
await api.prepareZXingModule({overrides:{wasmBinary:await readFile(new URL("../public/nfc-camera/zxing_reader.wasm",import.meta.url))},fireImmediately:true});
const reader=new api.BarcodeDetector({formats:["code_128","code_39","qr_code"]});

async function fixture(codes,angle=0,lowContrast=false){
  const width=1280,height=720;
  const background=lowContrast?180:255,ink=lowContrast?135:0;
  let bars="";
  for(let row=0;row<codes.length;row++){
    const unit=700/code128UnitCount(codes[row]);let x=290;
    for(const segment of code128Modules(codes[row])){
      if(segment.black)bars+=`<rect x="${x}" y="${150+row*220}" width="${segment.width*unit}" height="130" fill="rgb(${ink},${ink},${ink})"/>`;
      x+=segment.width*unit;
    }
  }
  return sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="rgb(${background},${background},${background})"/><g transform="rotate(${angle} 640 360)">${bars}</g></svg>`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
async function detectPixels(image,pass){
  if(pass==="original")return reader.detect(new ImageData(new Uint8ClampedArray(image.data),image.info.width,image.info.height));
  let next=sharp(image.data,{raw:image.info});
  if(pass==="left"||pass==="right")next=next.rotate(pass==="left"?-10:10,{background:"white"});
  const enhanced=await next.greyscale().linear(2,-128).toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return reader.detect(new ImageData(new Uint8ClampedArray(enhanced.data),enhanced.info.width,enhanced.info.height));
}
for(const [name,codes,angle,lowContrast] of [
  ["clean",["NFC-100001"],0,false],
  ["tilted",["NFC-100002"],10,false],
  ["low contrast",["NFC-100003"],0,true],
  ["two visible stickers",["NFC-100001","NFC-100002"],0,false],
]){
  const image=await fixture(codes,angle,lowContrast),scan=createCameraScan();let calls=0;
  const detect=pass=>{calls++;return detectPixels(image,pass);};
  const signal=new AbortController().signal,start=performance.now();
  const first=await scan(detect,signal),second=await scan(detect,signal);
  assert.deepEqual(first.map(value=>value.rawValue).sort(),codes.slice().sort(),name);
  assert.equal(confirmedCameraCode(second,codes[0]).confirmed,codes.length===1,name);
  console.log(`${name}: ${calls} decoding passes for two fresh frames (${Math.round(performance.now()-start)} ms); ${codes.length===1?"confirmed":"writing blocked"}`);
}
