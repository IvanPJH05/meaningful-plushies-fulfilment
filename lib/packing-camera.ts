import { packingWindow,packingWindowMs,packingWindowStepMs,packingAfterMs } from "./packing-proof.ts";
type Window = { startedAt:number; failed:boolean; recorder:MediaRecorder; chunks:Blob[] };
export type PackingFrame = { blob:Blob; sourceStartedAt:number; scannedAt:number };

// Every window starts a new encoder, preserving its own WebM/MP4 header.
// Arbitrarily slicing MediaRecorder chunks produces unplayable video.
export class PackingCamera {
  private windows:Window[]=[];
  private timer:ReturnType<typeof setInterval>;
  private pins=new Set<Window>();
  constructor(private stream:MediaStream,private changed:(ready:boolean)=>void) {
    this.open();
    this.timer=setInterval(()=>this.maintain(),250);
  }
  ready(at=performance.now()) {return Boolean(packingWindow(this.windows,at)) && this.stream.getVideoTracks().some(t=>t.readyState==="live");}
  private open() {
    const mimeType=["video/webm;codecs=vp8","video/webm","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
    const recorder=new MediaRecorder(this.stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:2_000_000});
    const window:Window={startedAt:performance.now(),failed:false,recorder,chunks:[]};
    recorder.ondataavailable=event=>{if(event.data.size)window.chunks.push(event.data);};
    recorder.onerror=()=>{window.failed=true;this.changed(false);};
    recorder.start(1000);this.windows.push(window);
  }
  private maintain() {
    if(!this.stream.getVideoTracks().some(t=>t.readyState==="live")){this.changed(false);return;}
    const now=performance.now(),last=this.windows.at(-1);
    if(!last || last.failed || now-last.startedAt>=packingWindowStepMs) this.open();
    for(const w of this.windows) if(now-w.startedAt>=packingWindowMs && w.recorder.state!=="inactive") {if(this.pins.has(w))w.failed=true;w.recorder.stop();}
    this.windows=this.windows.filter(w=>now-w.startedAt<packingWindowMs+1500 || this.pins.has(w));
    this.changed(this.ready(now));
  }
  capture(scannedAt=performance.now()):{frame:Promise<PackingFrame>;cancel:()=>void} {
    const w=packingWindow(this.windows,scannedAt);
    if(!w || !this.ready(scannedAt)) throw new Error("Wait for the webcam's full 3-second history before scanning the card.");
    this.pins.add(w);
    let cancel=()=>{};
    const frame=new Promise<PackingFrame>((resolve,reject)=>{
      let settled=false,flush:ReturnType<typeof setTimeout>|undefined;
      const cleanup=()=>{clearTimeout(deadline);if(flush)clearTimeout(flush);w.recorder.removeEventListener("dataavailable",done);this.pins.delete(w);};
      const done=()=>{
        if(settled)return;settled=true;cleanup();
        const blob=new Blob(w.chunks,{type:w.recorder.mimeType});
        if(w.failed || !blob.size || !this.stream.getVideoTracks().some(t=>t.readyState==="live"))reject(new Error("The webcam disconnected. A complete packing video was not saved. Scan again."));
        else resolve({blob,sourceStartedAt:performance.timeOrigin+w.startedAt,scannedAt:performance.timeOrigin+scannedAt});
      };
      const fail=(reason:string)=>{if(settled)return;settled=true;cleanup();reject(new Error(reason));};
      const deadline=setTimeout(()=>{
        if(w.failed || w.recorder.state!=="recording")return fail("The webcam stopped before the complete packing video was recorded.");
        w.recorder.addEventListener("dataavailable",done,{once:true});
        flush=setTimeout(()=>fail("The webcam could not finish the recording. Please scan again."),5000);
        w.recorder.requestData();
      // Allow the encoder's final frames to drain, then trim the saved video
      // to exactly 3 seconds before + 20 seconds after the scan on the server.
      },Math.max(0,scannedAt+packingAfterMs+1000-performance.now()));
      cancel=()=>fail("Packing recording cancelled.");
    });
    return {frame,cancel};
  }
  stop() {
    clearInterval(this.timer);
    for(const w of this.windows){w.failed=true;if(w.recorder.state!=="inactive")w.recorder.stop();}
    this.windows=[];this.changed(false);
  }
}
