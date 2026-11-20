import type { PackingCapture } from "./packing-proof";
export type QueuedPackingVideo={meta:PackingCapture;blob:Blob};
export async function packingQueue(action:"get"|"put"|"delete",job?:QueuedPackingVideo,id?:string):Promise<QueuedPackingVideo[]> {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open("meaningful-packing-videos",1);
    open.onupgradeneeded=()=>open.result.createObjectStore("uploads",{keyPath:"meta.id"});
    open.onerror=()=>reject(new Error("Browser video recovery is unavailable. Keep this page open until saving finishes."));
    open.onsuccess=()=>{
      const db=open.result,tx=db.transaction("uploads",action==="get"?"readonly":"readwrite"),store=tx.objectStore("uploads");
      const result=action==="get"?store.getAll():action==="put"?store.put(job):store.delete(id!);
      tx.oncomplete=()=>{db.close();resolve(action==="get"?result.result as QueuedPackingVideo[]:[]);};
      tx.onerror=()=>{db.close();reject(tx.error||new Error("Could not keep a recovery copy of this video."));};
    };
  });
}

export async function uploadPackingVideo(job:QueuedPackingVideo,token:string):Promise<boolean> {
  const request=async(body:object)=>{
    const response=await fetch("/api/production-tracking/proofs",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not save the packing video.");return data;
  };
  const prepared=await request({action:"prepare",...job.meta});
  if(prepared.ready)return true;
  if(!prepared.uploaded) {
    const response=await fetch(prepared.signedUrl,{method:"PUT",headers:{"Content-Type":job.meta.contentType},body:job.blob});
    // A lost upload response may leave the exact immutable object in Storage.
    // Retry prepare() rather than overwriting or linking a different recording.
    if(!response.ok)throw new Error("Video upload interrupted. It will retry automatically; keep this page open.");
  }
  const completed=await request({action:"complete",id:job.meta.id});
  return completed.ready===true;
}
