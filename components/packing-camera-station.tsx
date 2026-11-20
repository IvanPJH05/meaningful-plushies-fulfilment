"use client";
import { forwardRef,useEffect,useImperativeHandle,useRef,useState } from "react";
import { PackingCamera } from "@/lib/packing-camera";
import { packingAfterMs, type PackingCapture } from "@/lib/packing-proof";
import { packingQueue,uploadPackingVideo,type QueuedPackingVideo } from "@/lib/packing-upload-queue";
import type { ProductionItem } from "@/lib/production-tracking";
import styles from "./packing-camera-station.module.css";
export type PackingProofTicket={confirm:()=>void;cancel:()=>void};
export type PackingStationHandle={prepare:(item:ProductionItem,orderBarcode:string,cardCode:string,scannedAt:number)=>PackingProofTicket|null};

export const PackingCameraStation=forwardRef<PackingStationHandle,{token:string;onState:(enabled:boolean,recording:boolean)=>void}>(function PackingCameraStation({token,onState},ref) {
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState("");
  const [enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[starting,setStarting]=useState(false);
  const [recording,setRecording]=useState(false),[remaining,setRemaining]=useState(20),[order,setOrder]=useState("");
  const [message,setMessage]=useState("Start the webcam once. It stays ready for each order and card scan."),[queued,setQueued]=useState(0);
  const preview=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),camera=useRef<PackingCamera|null>(null);
  const recordingRef=useRef(false),enabledRef=useRef(false),mounted=useRef(true),jobs=useRef(new Map<string,QueuedPackingVideo>()),uploadLock=useRef(false);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null),cancelCapture=useRef<(()=>void)|null>(null);
  const stateChange=useRef(onState);stateChange.current=onState;

  function updateRecording(value:boolean) {recordingRef.current=value;if(mounted.current){setRecording(value);stateChange.current(enabledRef.current,value);}}
  async function retry() {
    if(uploadLock.current)return;
    uploadLock.current=true;
    try {
      for(const [id,job] of jobs.current) {
        try {
          if(mounted.current)setMessage(`Saving packing video for #${job.meta.orderNumber}...`);
          if(!await uploadPackingVideo(job,token))continue;
          jobs.current.delete(id);
          await packingQueue("delete",undefined,id).catch(()=>{});
          if(mounted.current){setQueued(jobs.current.size);setMessage(`Packing video saved to #${job.meta.orderNumber}. Ready for the next order.`);}
        } catch(error) {if(mounted.current)setMessage(error instanceof Error?error.message:"Saving failed. Your recording is waiting to retry.");}
      }
    } finally {uploadLock.current=false;}
  }

  useEffect(()=>{
    mounted.current=true;
    void packingQueue("get").then(rows=>{for(const job of rows)jobs.current.set(job.meta.id,job);if(mounted.current){setQueued(jobs.current.size);void retry();}}).catch(()=>{});
    const retryTimer=setInterval(()=>void retry(),15000);
    const unload=(event:BeforeUnloadEvent)=>{if(recordingRef.current || jobs.current.size){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",unload);
    const online=()=>void retry();window.addEventListener("online",online);
    return ()=>{
      mounted.current=false;clearInterval(retryTimer);if(timer.current)clearInterval(timer.current);
      // In-app navigation must not discard an in-flight order clip. Let its
      // 20-second capture finish, persist/upload it, then release the webcam.
      if(!recordingRef.current){camera.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());}
      window.removeEventListener("beforeunload",unload);window.removeEventListener("online",online);
    };
  },[token]); // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    if(recordingRef.current)return;
    camera.current?.stop();camera.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    enabledRef.current=false;setEnabled(false);setReady(false);stateChange.current(false,false);
    if(preview.current)preview.current.srcObject=null;
  }
  async function start(id=device) {
    if(recordingRef.current || starting)return;
    setStarting(true);stop();
    try {
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined")throw new Error("Use a current version of Chrome or Edge with webcam access.");
      const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30},...(id?{deviceId:{exact:id}}:{})}});
      if(!mounted.current){next.getTracks().forEach(t=>t.stop());return;}
      stream.current=next;
      if(preview.current){preview.current.srcObject=next;await preview.current.play();}
      const activeDevice=next.getVideoTracks()[0]?.getSettings().deviceId||id;
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput"));setDevice(activeDevice);
      camera.current=new PackingCamera(next,value=>{if(mounted.current)setReady(value);});
      next.getVideoTracks()[0]?.addEventListener("ended",()=>{setReady(false);setMessage("Webcam disconnected. Reconnect it before recording another order.");cancelCapture.current?.();});
      enabledRef.current=true;setEnabled(true);stateChange.current(true,false);setMessage("Building 3 seconds of camera history...");
    } catch(error) {stop();setMessage(error instanceof Error?error.message:"Could not start the webcam. Check camera permission.");}
    finally {setStarting(false);}
  }

  useImperativeHandle(ref,()=>({prepare(item,orderBarcode,cardCode,scannedAt) {
    if(!enabledRef.current)return null;
    if(recordingRef.current)throw new Error("Wait until the current 20-second packing recording finishes.");
    const capture=camera.current?.capture(scannedAt);
    if(!capture)throw new Error("Start the webcam and wait for the 3-second history first.");
    const id=crypto.randomUUID(),orderNumber=String(item.order?.orderNumber||item.order_id);
    let confirmed=false,cancelled=false;
    cancelCapture.current=()=>{cancelled=true;capture.cancel();};
    setOrder(orderNumber);updateRecording(true);setRemaining(Math.max(0,Math.ceil((scannedAt+packingAfterMs-performance.now())/1000)));
    timer.current=setInterval(()=>setRemaining(Math.max(0,Math.ceil((scannedAt+packingAfterMs-performance.now())/1000))),200);
    let confirm=()=>{};
    let verificationTimer:ReturnType<typeof setTimeout>;
    const verification=new Promise<void>((resolve,reject)=>{
      confirm=()=>{clearTimeout(verificationTimer);confirmed=true;resolve();};
      cancelCapture.current=()=>{clearTimeout(verificationTimer);cancelled=true;capture.cancel();reject(new Error("Card verification failed or timed out; no packing video was saved. Scan again."));};
      verificationTimer=setTimeout(()=>cancelCapture.current?.(),20000);
    });
    // Attach both rejection handlers immediately so a failed pairing never
    // becomes an unhandled browser promise while the 20-second timer runs.
    void Promise.all([capture.frame,verification]).then(async([frame])=>{
      if(cancelled || !confirmed)return;
      const meta:PackingCapture={id,orderId:item.order_id,orderNumber,orderBarcode,cardCode,scannedAt:new Date(frame.scannedAt).toISOString(),sourceStartedAt:new Date(frame.sourceStartedAt).toISOString(),size:frame.blob.size,contentType:frame.blob.type.split(";")[0]};
      const job={meta,blob:frame.blob};jobs.current.set(id,job);
      try {await packingQueue("put",job);}catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"Keep this page open until the video is saved.");}
      if(mounted.current)setQueued(jobs.current.size);
      void retry();
    }).catch(error=>{if(mounted.current)setMessage(error instanceof Error?error.message:"The recording was interrupted. Please scan again.");}).finally(()=>{
      clearTimeout(verificationTimer);if(timer.current)clearInterval(timer.current);timer.current=null;cancelCapture.current=null;updateRecording(false);
      if(!mounted.current){camera.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());}
    });
    return {confirm,cancel:()=>cancelCapture.current?.()};
  }}));

  return <section className={styles.station} aria-label="Packing camera">
    <div className={styles.heading}><div><h2>Packing camera</h2><p>3 seconds before the matching card scan + 20 seconds after. Saved automatically to the order.</p></div><span className={recording?styles.recording:ready?styles.ready:styles.badge}>{recording?"RECORDING":ready?"READY":enabled?"WARMING UP":"CAMERA OFF"}</span></div>
    <div className={styles.body}><div className={styles.preview}><video ref={preview} autoPlay muted playsInline />{!enabled && <span>Webcam preview</span>}{recording && <strong>#{order} · {remaining}s remaining</strong>}</div>
    <div className={styles.controls}><label>Webcam<select aria-label="Packing webcam" value={device} disabled={starting||recording} onChange={e=>{setDevice(e.target.value);if(enabled)void start(e.target.value);}}><option value="">Default webcam</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Webcam"}</option>)}</select></label>
    <div><button disabled={starting||recording} onClick={()=>enabled?stop():void start()}>{starting?"Connecting...":enabled?"Stop webcam":"Start webcam"}</button></div>
    <p role="status">{recording?(remaining?`Keep packing. Recording the next ${remaining} seconds for #${order}.`:"Completing the packing video..."):enabled&&ready&&message.startsWith("Building")?"Ready. Scan the order, then its matching ID card.":message}</p>
    {queued>0 && <div className={styles.waiting}><strong>{queued} video{queued===1?"":"s"} waiting to save</strong><p>Keep this page open. Recovery copies retry automatically on this computer.</p><button onClick={()=>void retry()}>Retry saving</button></div>}
    </div></div>
  </section>;
});
