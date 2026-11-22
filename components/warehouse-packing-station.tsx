"use client";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { packingQueue, uploadPackingVideo, type QueuedPackingVideo } from "@/lib/packing-upload-queue";
import { matchesProductionBarcode } from "@/lib/production-tracking";
import { trackingCode, createTrackingConfirmation, warehouseMaxDurationMs } from "@/lib/warehouse-packing";
import { sewingAudioManifest,preloadSewingAudio } from "@/lib/packing-audio-preload";
import styles from "./warehouse-packing-station.module.css";

type Item={order_id:string;batchId?:string;order:{id:string;orderNumber:string;updatedAt:string;character:string;plushName:string;trackingNumber:string;voiceLength:number}};
type Session={id:string;barcode:string;startedAt:number;epoch:number;recorder:MediaRecorder;chunks:Blob[];item:Item|null;card:string;paired:boolean;pairing:boolean;finishing:boolean;cancelled:boolean;tracking:string;timer:ReturnType<typeof setTimeout>};
type Decoder={detect:(frame:HTMLCanvasElement)=>Promise<{rawValue:string}[]>};
type DecoderApi={BarcodeDetector:new(options:{formats:string[]})=>Decoder;prepareZXingModule:(options:{overrides:{locateFile:()=>string};fireImmediately:true})=>Promise<unknown>};

export function WarehousePackingStation({token,onSaved}:{token:string;onSaved:()=>void}){
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState("");
 const [microphones,setMicrophones]=useState<MediaDeviceInfo[]>([]),[microphone,setMicrophone]=useState("");
 const [cameraReady,setCameraReady]=useState(false),[connecting,setConnecting]=useState(false),[decoderReady,setDecoderReady]=useState(false);
 const [view,setView]=useState<Session|null>(null),[seconds,setSeconds]=useState(0),[message,setMessage]=useState("Start the webcam, then scan the order and its NFC card back-to-back."),[error,setError]=useState("");
 const [readyAudio,setReadyAudio]=useState(0),[waiting,setWaiting]=useState(0),[loadingAudio,setLoadingAudio]=useState(false);
 const [audioTotal,setAudioTotal]=useState(0),[audioFailed,setAudioFailed]=useState(0),[preparingAudio,setPreparingAudio]=useState(false);
 const video=useRef<HTMLVideoElement>(null),input=useRef<HTMLInputElement>(null),audio=useRef<HTMLAudioElement>(null),stream=useRef<MediaStream|null>(null);
 const session=useRef<Session|null>(null),mounted=useRef(true),manifest=useRef<Item[]>([]),decoder=useRef<Decoder|null>(null);
 const audioCache=useRef(new Map<string,{version:string;url:string}>()),audioJobs=useRef(new Map<string,Promise<string>>()),jobs=useRef(new Map<string,QueuedPackingVideo>()),uploading=useRef(false);
 const sound=useRef<AudioContext|null>(null),lastWrong=useRef(""),lastWrongAt=useRef(0),played=useRef("");
 const speech=useRef({generation:0,player:null as HTMLAudioElement|null,source:"",resume:false});
 const callbacks=useRef<{pair:(s:Session)=>Promise<void>;finish:(s:Session,at:number)=>Promise<void>;retry:()=>Promise<void>}>({pair:async()=>{},finish:async()=>{},retry:async()=>{}});
 const decoderStarting=useRef(false);
 const warmingAudio=useRef(false);
 const changed=useRef(onSaved);changed.current=onSaved;
 const publish=(s:Session)=>{if(mounted.current&&session.current===s)setView({...s});};
 const request=async(path:string,body?:object)=>{const response=await fetch(path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error||"The packing service is unavailable.");return data;};

 function cue(correct:boolean){
  try{sound.current??=new AudioContext();const context=sound.current;void context.resume();const oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);oscillator.type=correct?"sine":"square";oscillator.frequency.setValueAtTime(correct?880:180,context.currentTime);oscillator.frequency.setValueAtTime(correct?1320:120,context.currentTime+.1);gain.gain.setValueAtTime(.1,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.22);oscillator.start();oscillator.stop(context.currentTime+.23);}catch{}
 }
 function problem(text:string){
  if(!mounted.current)return;setError(text);cue(false);const player=audio.current,wasPlaying=player&&!player.paused;
  if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==="undefined")return;
  const source=player?.src||"",state=speech.current,generation=++state.generation;
  state.resume=Boolean(wasPlaying)||(state.resume&&state.player===player&&state.source===source);state.player=player;state.source=source;
  if(wasPlaying)player.pause();window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang="en-MY";
  const resume=()=>{if(state.generation===generation&&state.resume&&player===audio.current&&player?.src===source){state.resume=false;void player.play().catch(()=>{});}};utterance.onend=resume;utterance.onerror=resume;window.speechSynthesis.speak(utterance);
 }
 async function loadAudio(item:Item){
  const key=item.order_id+":"+item.order.updatedAt,cached=audioCache.current.get(item.order_id);
  if(cached?.version===item.order.updatedAt)return cached.url;
  if(audioJobs.current.has(key))return audioJobs.current.get(key)!;
  const promise=(async()=>{
   const headers={Authorization:"Bearer "+token};let response:Response;
   if(item.batchId){response=await fetch(`/api/production-tracking/audio?id=${encodeURIComponent(item.batchId)}&orderId=${encodeURIComponent(item.order_id)}`,{headers});if(!response.ok)response=await fetch(`/api/mobile/orders/${encodeURIComponent(item.order_id)}/assets?kind=voice`,{headers});}
   else response=await fetch(`/api/mobile/orders/${encodeURIComponent(item.order_id)}/assets?kind=voice`,{headers});
   if(!response.ok)throw Error("No playable order audio is available. Check the saved voice message.");
   const blob=await response.blob();if(!blob.size||blob.size>12*1024*1024)throw Error("The order audio could not be preloaded. Check its saved file.");
   if(!mounted.current)return "";
   const url=URL.createObjectURL(blob);if(cached)URL.revokeObjectURL(cached.url);audioCache.current.set(item.order_id,{version:item.order.updatedAt,url});
   setReadyAudio(manifest.current.filter(row=>audioCache.current.get(row.order_id)?.version===row.order.updatedAt).length);return url;
  })().finally(()=>audioJobs.current.delete(key));audioJobs.current.set(key,promise);return promise;
 }
 function playUrl(url:string,s:Session){if(!url||session.current!==s||!audio.current)return;audio.current.src=url;played.current=s.item?.order_id||"";void audio.current.play().catch(()=>setMessage("Press Play once to allow the customer audio."));}
 async function playOrder(item:Item,s:Session){
  const cached=audioCache.current.get(item.order_id);if(cached?.version===item.order.updatedAt){if(played.current!==item.order_id)playUrl(cached.url,s);return;}
  if(played.current===item.order_id)audio.current?.pause();setLoadingAudio(true);
  try{const url=await loadAudio(item);playUrl(url,s);}catch(e){if(session.current===s)setError((e as Error).message);}finally{if(mounted.current)setLoadingAudio(false);}
 }
 async function retry(){
  if(uploading.current)return;uploading.current=true;
  try{for(const[id,job]of jobs.current){try{if(!await uploadPackingVideo(job,token))continue;jobs.current.delete(id);await packingQueue("delete",undefined,id).catch(()=>{});if(mounted.current){setWaiting(jobs.current.size);setMessage(`Video saved. #${job.meta.orderNumber} is Packed and ready for pickup.`);}changed.current();}catch(e){if(mounted.current)setError((e as Error).message+" The video is kept on this device and will retry.");}}}finally{uploading.current=false;}
 }
 callbacks.current.retry=retry;

 async function prepareQueueAudio(){
  if(warmingAudio.current)return;warmingAudio.current=true;setPreparingAudio(true);setAudioFailed(0);
  try{
   const items=await sewingAudioManifest<Item>(cursor=>request("/api/production-tracking/warehouse"+(cursor?"?after="+encodeURIComponent(cursor):"")),()=>mounted.current);
   if(!mounted.current)return;manifest.current=items;setAudioTotal(items.length);
   const ids=new Set(items.map(item=>item.order_id));
   for(const[id,entry]of audioCache.current){if(!ids.has(id)&&id!==session.current?.item?.order_id&&audio.current?.src!==entry.url){URL.revokeObjectURL(entry.url);audioCache.current.delete(id);}}
   setReadyAudio(items.filter(row=>audioCache.current.get(row.order_id)?.version===row.order.updatedAt).length);
   await preloadSewingAudio(items,loadAudio,()=>mounted.current,setAudioFailed);
  }catch(e){if(mounted.current)setError((e as Error).message);}finally{warmingAudio.current=false;if(mounted.current)setPreparingAudio(false);}
 }

 useEffect(()=>{
  mounted.current=true;const cache=audioCache.current;
  void prepareQueueAudio();
  void packingQueue("get").then(rows=>{for(const job of rows)jobs.current.set(job.meta.id,job);if(mounted.current){setWaiting(jobs.current.size);void callbacks.current.retry();}}).catch(()=>{});
  const retryTimer=setInterval(()=>void callbacks.current.retry(),15000),clock=setInterval(()=>{const s=session.current;if(s)setSeconds(Math.floor((performance.now()-s.startedAt)/1000));},500);
  const unload=(event:BeforeUnloadEvent)=>{if(session.current||jobs.current.size){event.preventDefault();event.returnValue="";}};const online=()=>void callbacks.current.retry();window.addEventListener("beforeunload",unload);window.addEventListener("online",online);
  input.current?.focus();
  return()=>{mounted.current=false;clearInterval(clock);clearInterval(retryTimer);window.removeEventListener("beforeunload",unload);window.removeEventListener("online",online);const s=session.current;if(s){s.cancelled=true;clearTimeout(s.timer);if(s.recorder.state!=="inactive")s.recorder.stop();}stream.current?.getTracks().forEach(t=>t.stop());for(const entry of cache.values())URL.revokeObjectURL(entry.url);cache.clear();};
 },[token]); // eslint-disable-line react-hooks/exhaustive-deps

 async function setupDecoder(){
  if(decoder.current||decoderStarting.current)return;decoderStarting.current=true;
  try{const api=(window as unknown as {BarcodeDetectionAPI:DecoderApi}).BarcodeDetectionAPI;await api.prepareZXingModule({overrides:{locateFile:()=>"/nfc-camera/zxing_reader.wasm"},fireImmediately:true});if(!mounted.current)return;decoder.current=new api.BarcodeDetector({formats:["code_128","code_39","itf","qr_code"]});setDecoderReady(true);}catch{if(mounted.current)setError("The shipping-label reader could not start. Refresh this page before packing.");}finally{decoderStarting.current=false;}
 }
 useEffect(()=>{
  if(!cameraReady||!decoderReady)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const frame=document.createElement("canvas"),context=frame.getContext("2d",{willReadFrequently:true}),confirmation=createTrackingConfirmation();let lastFrame=-1;
  const detect=async()=>{
   const s=session.current,camera=video.current;
   if(!stopped&&s?.paired&&!s.finishing&&s.item&&camera&&context&&camera.readyState>=2&&camera.currentTime!==lastFrame){
    lastFrame=camera.currentTime;if(frame.width!==camera.videoWidth)frame.width=camera.videoWidth;if(frame.height!==camera.videoHeight)frame.height=camera.videoHeight;context.drawImage(camera,0,0);
    try{const values=(await decoder.current!.detect(frame)).map(value=>value.rawValue);if(stopped||session.current!==s)return;
     if(confirmation.observe(values,s.item.order.trackingNumber)){void callbacks.current.finish(s,Date.now());}
     else{const wrong=values.map(trackingCode).find(code=>code&&/^\d{10,24}$/.test(code)&&code!==trackingCode(s.item!.order.trackingNumber));if(wrong&&(wrong!==lastWrong.current||Date.now()-lastWrongAt.current>8000)){lastWrong.current=wrong;lastWrongAt.current=Date.now();problem("Wrong shipping label. Show the label for order "+s.item.order.orderNumber+".");}}
    }catch{confirmation.reset();}
   }else confirmation.reset();
   if(!stopped)timer=setTimeout(()=>void detect(),180);
  };void detect();return()=>{stopped=true;clearTimeout(timer);};
 },[cameraReady,decoderReady]); // eslint-disable-line react-hooks/exhaustive-deps

 async function startCamera(id=device,micId=microphone){
  if(session.current||connecting)return;setConnecting(true);setError("");
  try{stream.current?.getTracks().forEach(t=>t.stop());setCameraReady(false);const next=await navigator.mediaDevices.getUserMedia({audio:{...(micId?{deviceId:{exact:micId}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:true},video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30},...(id?{deviceId:{exact:id}}:{})}});if(!mounted.current){next.getTracks().forEach(t=>t.stop());return;}stream.current=next;if(!next.getAudioTracks().some(track=>track.readyState==="live"))throw Error("No microphone is available. Connect a microphone and allow camera and microphone access.");video.current!.srcObject=next;await video.current!.play();const available=await navigator.mediaDevices.enumerateDevices();setDevices(available.filter(d=>d.kind==="videoinput"));setMicrophones(available.filter(d=>d.kind==="audioinput"));setDevice(next.getVideoTracks()[0].getSettings().deviceId||id);setMicrophone(next.getAudioTracks()[0].getSettings().deviceId||micId);setCameraReady(true);next.getTracks().forEach(track=>track.addEventListener("ended",()=>{setCameraReady(false);cancel("Camera or microphone disconnected. The order has not been completed.");}));setMessage("Camera and microphone ready. Scan the order, then its NFC card.");input.current?.focus();}
  catch(e){stream.current?.getTracks().forEach(t=>t.stop());setError((e as Error).message);setCameraReady(false);}finally{setConnecting(false);}
 }
 function cancel(reason="Packing cancelled. The order has not been marked Packed."){
  const s=session.current;if(s?.finishing)return;if(s){s.cancelled=true;clearTimeout(s.timer);if(s.recorder.state!=="inactive")s.recorder.stop();}session.current=null;setView(null);speech.current.generation++;speech.current.resume=false;window.speechSynthesis?.cancel();audio.current?.pause();setMessage(reason);input.current?.focus();
 }
 async function pair(s:Session){
  if(!s.item||!s.card||s.pairing||s.paired||s.cancelled||session.current!==s)return;s.pairing=true;publish(s);
  try{await request("/api/production-tracking/warehouse",{action:"pair",orderId:s.item.order_id,orderBarcode:s.barcode,cardCode:s.card});if(session.current!==s||s.cancelled)return;s.paired=true;setError("");cue(true);setMessage("NFC card paired. Stick on the shipping label, then show its tracking barcode to the camera.");}
  catch(e){if(session.current===s){s.card="";problem((e as Error).message+" Scan the correct NFC card again.");}}
  finally{s.pairing=false;publish(s);}
 }
 callbacks.current.pair=pair;
 async function finish(s:Session,verifiedAt:number){
  if(session.current!==s||!s.item||!s.paired||s.finishing||s.cancelled||performance.now()-s.startedAt<1000)return;s.finishing=true;s.tracking=trackingCode(s.item.order.trackingNumber);clearTimeout(s.timer);publish(s);setError("");cue(true);setMessage("Shipping label matched. Saving the packing video…");
  const durationMs=Math.round(performance.now()-s.startedAt);
  try{
   const blob=await new Promise<Blob>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("The webcam did not finish the recording. Scan this parcel again.")),8000);s.recorder.onstop=()=>{clearTimeout(timeout);resolve(new Blob(s.chunks,{type:s.recorder.mimeType}));};s.recorder.onerror=()=>{clearTimeout(timeout);reject(Error("The packing recording was interrupted."));};s.recorder.stop();});
   if(s.cancelled||!blob.size)throw Error("No complete video was captured. Scan this order again.");
   const job:QueuedPackingVideo={meta:{id:s.id,orderId:s.item.order_id,orderNumber:s.item.order.orderNumber,orderBarcode:s.barcode,cardCode:s.card,scannedAt:new Date(s.epoch).toISOString(),sourceStartedAt:new Date(s.epoch).toISOString(),size:blob.size,contentType:blob.type.split(";")[0],captureMode:"warehouse",durationMs,trackingNumber:s.tracking,trackingVerifiedAt:new Date(verifiedAt).toISOString(),packAfterSave:true},blob};
   jobs.current.set(job.meta.id,job);setWaiting(jobs.current.size);try{await packingQueue("put",job);}catch{setError("Keep this page open. Browser recovery storage is unavailable.");}
   if(session.current===s){session.current=null;setView(null);setMessage(`Label verified for #${job.meta.orderNumber}. Video saving; Packed is confirmed only after upload succeeds.`);input.current?.focus();}void callbacks.current.retry();
  }catch(e){if(session.current===s){s.finishing=false;cancel();problem((e as Error).message);}}
 }
 callbacks.current.finish=finish;
 function submit(event:FormEvent){
  event.preventDefault();const value=input.current?.value.trim()||"";if(input.current)input.current.value="";if(!value)return;
  const current=session.current;
  if(/^NFC-\d{6,12}$/i.test(value)||Boolean(current&&/^\d{6}$/.test(value))){
   if(!current){problem("Scan the order barcode first.");return;}if(current.finishing)return;if(current.paired||current.pairing){if(current.card!==value.toUpperCase())problem("This order already has its NFC card. Wait for its check, then show the shipping label to the camera.");return;}current.card=value.toUpperCase();publish(current);setError("");setMessage(current.item?"Checking NFC card…":"NFC scan saved. Waiting for the order lookup…");void callbacks.current.pair(current);return;
  }
  if(current){if(current.barcode.toUpperCase()!==value.toUpperCase())problem("Finish or cancel the current parcel before scanning another order.");return;}
  if(!cameraReady||!stream.current||!decoderReady){problem("Start the webcam and wait for the shipping-label reader before scanning.");return;}
  if(!stream.current.getAudioTracks().some(track=>track.readyState==="live")){setCameraReady(false);problem("Microphone disconnected. Reconnect the webcam and microphone before packing.");return;}
  speech.current.generation++;speech.current.resume=false;audio.current?.pause();window.speechSynthesis?.cancel();
  try{
   const mimeType=["video/webm;codecs=vp8,opus","video/webm","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));const recorder=new MediaRecorder(stream.current,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:800000,audioBitsPerSecond:96000});
   const now=performance.now(),s:Session={id:crypto.randomUUID(),barcode:value,startedAt:now,epoch:performance.timeOrigin+now,recorder,chunks:[],item:null,card:"",paired:false,pairing:false,finishing:false,cancelled:false,tracking:"",timer:setTimeout(()=>cancel("The recording reached its safety limit. Verify the label and start this parcel again."),warehouseMaxDurationMs)};
   recorder.ondataavailable=event=>{if(event.data.size)s.chunks.push(event.data);};recorder.onerror=()=>{if(session.current===s){cancel();problem("The webcam could not record. Reconnect it and scan again.");}};recorder.start(1000);session.current=s;setView({...s});setSeconds(0);setError("");setMessage("Order scan saved. Recording started. Scan the NFC card now.");played.current="";
   const cached=manifest.current.filter(item=>matchesProductionBarcode({id:item.order_id,orderNumber:item.order.orderNumber},value));
   if(cached.length===1){s.item=cached[0];const entry=audioCache.current.get(cached[0].order_id);if(entry)playUrl(entry.url,s);s.item=null;}
   void request("/api/production-tracking/warehouse?scanBarcode="+encodeURIComponent(value)).then(async data=>{
    if(session.current!==s||s.cancelled)return;const item=data.item as Item|null;if(!item)throw Error("Order barcode not recognised. Scan an individual packing slip.");if(!trackingCode(item.order.trackingNumber))throw Error("This order has no tracking number. Add its shipping label before packing.");s.item={...item,batchId:cached.find(row=>row.order_id===item.order_id)?.batchId};publish(s);void playOrder(s.item,s);setMessage(s.card?"Order loaded. Checking the saved NFC scan…":"Order loaded. Scan its NFC card while packing.");void callbacks.current.pair(s);
   }).catch(e=>{if(session.current===s){cancel();problem(e.message);}});
  }catch(e){problem((e as Error).message);}
 }

 return <section className={styles.station} aria-label="Warehouse packing station">
  <Script src="/nfc-camera/decoder.js" onLoad={()=>void setupDecoder()} onReady={()=>{if(!decoder.current)void setupDecoder();}}/>
  <header className={styles.heading}><div><span className={styles.kicker}>WAREHOUSE PACKING STATION</span><h2>Scan. Pair. Verify. Pack.</h2><p>Recording starts with the order scan and ends when the camera confirms its shipping label.</p></div><span className={view?styles.live:styles.badge}>{view?`● RECORDING · ${seconds}s`:cameraReady&&decoderReady?"READY":"SET UP CAMERA"}</span></header>
  <div className={styles.layout}><div className={styles.preview}><video ref={video} autoPlay muted playsInline/>{!cameraReady&&<span>Overhead packing camera</span>}{view&&<strong>{view.item?"#"+view.item.order.orderNumber:view.barcode} · {view.paired?"Show the matching shipping label":"Scan the NFC card"}</strong>}</div>
  <div className={styles.controls}><label>Webcam<select aria-label="Packing webcam" value={device} disabled={connecting||Boolean(view)} onChange={e=>{setDevice(e.target.value);if(cameraReady)void startCamera(e.target.value);}}><option value="">Default webcam</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Webcam"}</option>)}</select></label><label>Microphone<select aria-label="Packing microphone" value={microphone} disabled={connecting||Boolean(view)} onChange={e=>{setMicrophone(e.target.value);if(cameraReady)void startCamera(device,e.target.value);}}><option value="">Default microphone</option>{microphones.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select></label><button type="button" className="button secondary" disabled={connecting||Boolean(view)} onClick={()=>void startCamera()}>{connecting?"Connecting…":cameraReady?"Reconnect webcam + microphone":"Start webcam + microphone"}</button><small>{cameraReady?"Microphone recording enabled · ":"Allow camera and microphone access · "}{decoderReady?"Shipping-label reader ready":"Preparing shipping-label reader…"} · {readyAudio} of {audioTotal} order recordings preloaded{preparingAudio?" · preparing…":""}</small>
  {audioFailed>0&&<small>{audioFailed} order recording{audioFailed===1?"":"s"} unavailable. Check the saved audio or retry.</small>}<button type="button" className="button secondary" disabled={preparingAudio} onClick={()=>void prepareQueueAudio()}>{preparingAudio?"Preparing all order audio…":"Refresh order audio"}</button><form onSubmit={submit}><label>Scan order or NFC card<input ref={input} autoFocus autoComplete="off" placeholder="Scan order, then NFC card — no waiting" disabled={Boolean(view?.finishing)}/></label><button type="submit" className="button primary" disabled={Boolean(view?.finishing)}>Read scan</button></form>
  <div className={styles.steps}><div><span>1</span><strong>{view?view.item?"#"+view.item.order.orderNumber:view.barcode:"Order scan"}</strong><small>{view?.item?view.item.order.plushName+" · "+view.item.order.character:view?"Saved · loading order…":"Starts video and plays the order audio"}</small></div><div><span>2</span><strong>{view?.card||"NFC card"}</strong><small>{view?.paired?"Paired ✓":view?.pairing?"Checking pairing…":view?.card?"Scan saved · waiting for order":"Scan immediately after the order"}</small></div><div><span>3</span><strong>Shipping-label check</strong><small>{view?.item?"Expected: "+view.item.order.trackingNumber:"Show the J&T tracking barcode to the camera"}</small></div></div>
  <audio ref={audio} controls preload="auto" className={styles.audio}/>{loadingAudio&&<small>Loading this order’s audio…</small>}{view&&!view.finishing&&<button type="button" className="button secondary" onClick={()=>cancel()}>Cancel this parcel</button>}</div></div>
  <p role="status" className={styles.status}>{message}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}{waiting>0&&<div className={styles.waiting}><strong>{waiting} packing video{waiting===1?"":"s"} waiting to save</strong><p>Keep this station open. Orders move to Packed only after their verified video is saved.</p><button className="button secondary" onClick={()=>void callbacks.current.retry()}>Retry saving</button></div>}
 </section>;
}
