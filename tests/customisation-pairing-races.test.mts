import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../extensions/meaningful-plushie-customisation/assets/deferred-customisation.js",import.meta.url),"utf8");
// Exercise the actual browser function bodies with controlled upload/save timing.
const uploadBody=source.slice(source.indexOf("    const uploadVoiceEarly = async () => {"),source.indexOf("    const openDraftDatabase"));
const saveBody=source.slice(source.indexOf("    const completeNowFingerprint ="),source.indexOf("    const scheduleCompleteNowSave"));
function deferred(){let resolve!: (v?:unknown)=>void;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
describe("customisation submission races",()=>{
 it("waits for the old upload and then uploads the currently selected replacement",async()=>{
  const gate=deferred(), files=[{name:"old.mp3",type:"audio/mpeg"},{name:"new.mp3",type:"audio/mpeg"}];
  let selected=files[0],created=0;const sent:unknown[]=[];
  class Transfer {upload={};status=200;onload!:()=>void;open(){}setRequestHeader(){}send(file:unknown){sent.push(file);if(file===files[0])gate.promise.then(()=>this.onload());else this.onload();}}
  const context=vm.createContext({selectedVoice:()=>selected,isLater:()=>false,apiUrl:"https://app.test",preparedUpload:null,uploadPromise:null,notice:{textContent:""},setVoiceProgress:()=>{},XMLHttpRequest:Transfer,request:async(path:string)=>path.endsWith("/sessions")?{token:`token${++created}`,sessionId:`session${created}`}:{upload:{signedUrl:"https://storage.test",path:`session${created}/voice.mp3`}}});
  vm.runInContext(uploadBody+"globalThis.run=uploadVoiceEarly",context);
  const first=context.run();await Promise.resolve();await Promise.resolve();selected=files[1];const second=context.run();gate.resolve();await first;const result=await second;
  expect(result.file).toBe(files[1]);expect(result.session.sessionId).toBe("session2");expect(sent).toEqual(files);expect(created).toBe(2);
 });
 it("a save waiting behind an earlier save uses the replacement audio even when the old form fingerprint matches",async()=>{
  const gate=deferred(),old={file:{},session:{token:"old"},voiceStoragePath:"old/voice.mp3"},fresh={file:{},session:{token:"new"},voiceStoragePath:"new/voice.mp3"};let selected=old.file,upload=old;const saves:any[]=[];
  const context=vm.createContext({isLater:()=>false,completeNowReady:()=>true,apiUrl:"app",uploadVoiceEarly:async()=>upload,earlySavePromise:gate.promise,selectedVoice:()=>selected,formData:()=>({plushName:"LATEST"}),savedCompleteNowFingerprint:JSON.stringify({details:{plushName:"LATEST"},voiceStoragePath:old.voiceStoragePath}),request:async(path:string,options:any)=>{saves.push({path,body:JSON.parse(options.body)});return {};}});
  vm.runInContext(saveBody+"globalThis.run=saveCompleteNowEarly",context);const pending=context.run();await Promise.resolve();selected=fresh.file;upload=fresh;context.earlySavePromise=null;gate.resolve();const result=await pending;
  expect(result).toBe(fresh);expect(saves).toHaveLength(1);expect(saves[0].path).toContain("new");expect(saves[0].body.voiceStoragePath).toBe(fresh.voiceStoragePath);
 });
 it("edits made during saving are saved again before checkout uses the result",async()=>{
  const gate=deferred(),entered=deferred(),upload={file:{},session:{token:"token"},voiceStoragePath:"s/voice.mp3"};let name="FIRST";const names:string[]=[];
  const context=vm.createContext({isLater:()=>false,completeNowReady:()=>true,apiUrl:"app",uploadVoiceEarly:async()=>upload,earlySavePromise:null,selectedVoice:()=>upload.file,formData:()=>({plushName:name}),savedCompleteNowFingerprint:"",request:async(_path:string,options:any)=>{names.push(JSON.parse(options.body).form.plushName);if(names.length===1){entered.resolve();await gate.promise;}return {};}});
  vm.runInContext(saveBody+"globalThis.run=saveCompleteNowEarly",context);const pending=context.run();await entered.promise;name="LATEST";gate.resolve();expect(await pending).toBe(upload);expect(names).toEqual(["FIRST","LATEST"]);
 });
});
