/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic React hook and browser hardware doubles for the VM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {createTrackingConfirmation,trackingCode,warehouseMaxDurationMs} from "../lib/warehouse-packing.ts";

// Exercise the actual component with delayed networking and browser hardware doubles.
test("rapid order/NFC scans survive lookup; completion requires pairing and label confirmation",async()=>{
 const code=ts.transpileModule(readFileSync("components/warehouse-packing-station.tsx","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const slots:any[]=[],calls:{url:string;body:any}[]=[],queued:any[]=[],recorders:any[]=[];let cursor=0,now=1000,lookupResolve:any,pairResolve:any;
 const react={useState:(init:any)=>{const at=cursor++;if(!(at in slots))slots[at]=init;return[slots[at],(next:any)=>{slots[at]=typeof next==="function"?next(slots[at]):next;}];},useRef:(init:any)=>{const at=cursor++;return slots[at]??(slots[at]={current:init});},useEffect:()=>{cursor++;}};
 class Recorder{state="inactive";mimeType="video/webm";ondataavailable:any;onstop:any;onerror:any;static isTypeSupported(){return true;}constructor(){recorders.push(this);}start(){this.state="recording";}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob(["video"])});this.onstop?.();}}
 const mod={exports:{} as any},jsx=(type:any,props:any)=>({type,props});
 runInNewContext(code,{module:mod,exports:mod.exports,require:(name:string)=>name==="react"?react:name==="react/jsx-runtime"?{jsx,jsxs:jsx}:name==="next/script"?{default:"script"}:name.endsWith(".css")?{default:{}}:name==="@/lib/warehouse-packing"?{createTrackingConfirmation,trackingCode,warehouseMaxDurationMs}:name==="@/lib/production-tracking"?{matchesProductionBarcode:()=>false}:name==="@/lib/packing-upload-queue"?{packingQueue:async(action:string,job:any)=>{if(action==="put")queued.push(job);return[];},uploadPackingVideo:async()=>false}:(()=>{throw Error(name);})(),fetch:async(url:string,options:any)=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(options.method==="POST")return new Promise(resolve=>{pairResolve=()=>resolve({ok:true,json:async()=>({paired:true})});});if(url.includes("scanBarcode"))return new Promise(resolve=>{lookupResolve=()=>resolve({ok:true,json:async()=>({item:{order_id:"test-order",order:{id:"test-order",orderNumber:"TEST-1",updatedAt:"v1",trackingNumber:"632205723770",character:"TOOTSIE",plushName:"Test"}}})});});return{ok:false};},Blob,URL,Map,Date,console,MediaRecorder:Recorder,performance:{now:()=>now,timeOrigin:Date.now()-1000},crypto:{randomUUID:()=>"test-proof"},setTimeout:()=>1,clearTimeout:()=>{},window:{}});
 const nodes=(n:any):any[]=>!n||typeof n!=="object"?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];let field:any;
 function render(){cursor=0;const list=nodes(mod.exports.WarehousePackingStation({token:"test",onSaved:()=>{}}));const form=list.find(n=>n.type==="form"),input=list.find(n=>n.type==="input"),player=list.find(n=>n.type==="audio");field??={value:"",focus(){}};input.props.ref.current=field;player.props.ref.current={paused:true,pause(){},play(){return Promise.resolve();}};return{form,input,list};}
 render();slots[2]=true;slots[4]=true;const refs=slots.filter(s=>s&&typeof s==="object"&&"current"in s);refs[3].current={getTracks:()=>[]};
 const scan=(value:string)=>{const {form,input}=render();assert.equal(Boolean(input.props.disabled),false);field.value=value;form.props.onSubmit({preventDefault(){}});assert.equal(field.value,"");};
 scan("MP-TEST-1");assert.equal(recorders[0].state,"recording");scan("NFC-100001");assert.equal(calls.length,1);assert.ok(JSON.stringify(render().list).includes("NFC-100001"));
 lookupResolve();for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
 const pairing=calls.filter(c=>c.body);assert.equal(pairing.length,1);assert.deepEqual(pairing[0].body,{action:"pair",orderId:"test-order",orderBarcode:"MP-TEST-1",cardCode:"NFC-100001"});
 scan("NFC-100002");assert.equal(calls.filter(c=>c.body).length,1);
 const session=refs[4].current,callbacks=refs.find(r=>r.current?.finish&&r.current?.pair)!.current;
 now=6000;await callbacks.finish(session,Date.now());assert.equal(queued.length,0);
 pairResolve();for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));assert.equal(session.paired,true);assert.equal(session.card,"NFC-100001");
 const confirmation=createTrackingConfirmation();assert.equal(confirmation.observe(["632205723771"],session.item.order.trackingNumber),false);assert.equal(recorders[0].state,"recording");assert.equal(confirmation.observe(["632205723770"],session.item.order.trackingNumber),false);assert.equal(confirmation.observe(["632205723770"],session.item.order.trackingNumber),true);
 await callbacks.finish(session,Date.now());assert.equal(recorders[0].state,"inactive");assert.equal(queued.length,1);assert.equal(queued[0].meta.cardCode,"NFC-100001");assert.equal(queued[0].meta.captureMode,"warehouse");assert.equal(queued[0].meta.packAfterSave,true);assert.equal(queued[0].meta.durationMs,5000);assert.equal(calls.some(c=>c.url.includes("scanner_pack")),false);
});


