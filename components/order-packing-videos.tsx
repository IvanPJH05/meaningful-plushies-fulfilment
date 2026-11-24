"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import type { PackingProofRow } from "@/lib/packing-proof";
import styles from "./order-packing-videos.module.css";
type Selection={id:string;url:string;request:number};
export function OrderPackingVideos({orderId,token}:{orderId:string;token:string}) {
  const [proofs,setProofs]=useState<PackingProofRow[]>([]),[error,setError]=useState(""),[selected,setSelected]=useState<Selection|null>(null);
  const [loading,setLoading]=useState(false),[opening,setOpening]=useState(false),[videoInfo,setVideoInfo]=useState("");
  const generation=useRef(0),previewRequest=useRef(0);
  const load=useCallback(async()=>{
    const current=generation.current;setLoading(true);setError("");
    try {
      const response=await fetch("/api/production-tracking/proofs?orderId="+encodeURIComponent(orderId),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load packing videos.");
      if(current!==generation.current)return null;
      const rows: PackingProofRow[]=Array.isArray(data.proofs)?data.proofs:[];setProofs(rows);return rows;
    } catch(error){if(current===generation.current)setError(error instanceof Error?error.message:"Could not load packing videos.");return null;}
    finally{if(current===generation.current)setLoading(false);}
  },[orderId,token]);
  useEffect(()=>{generation.current++;previewRequest.current++;setSelected(null);setVideoInfo("");setProofs([]);setOpening(false);void load();return()=>{generation.current++;previewRequest.current++;};},[load]);
  async function view(id:string) {
    const current=generation.current,request=++previewRequest.current;
    // Remount even if the refreshed signed URL happens to be identical.
    setSelected(null);setVideoInfo("");setError("");setOpening(true);
    try {
      const response=await fetch("/api/production-tracking/proofs",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action:"preview",id}),cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not open the video.");
      if(current===generation.current&&request===previewRequest.current)setSelected({id,url:data.url,request});
    } catch(error){if(current===generation.current&&request===previewRequest.current)setError(error instanceof Error?error.message:"Could not open the video.");}
    finally{if(current===generation.current&&request===previewRequest.current)setOpening(false);}
  }
  async function refresh(){
    const id=selected?.id;previewRequest.current++;setSelected(null);setVideoInfo("");
    const rows=await load();if(id&&rows?.some(proof=>proof.id===id&&proof.status==="ready"))await view(id);
  }
  return <section className="detail-section"><h3>Packing videos</h3>
    <p>Packing recordings saved to this order.</p>
    <button type="button" disabled={loading||opening} onClick={()=>void refresh()}>Refresh videos</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loading && !proofs.length && !error && <p>No packing video saved yet.</p>}
    <div className={styles.proofs}>{proofs.map(proof=><div className={styles.proofRow} key={proof.id}><div><strong>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium",timeStyle:"short"}).format(new Date(proof.scanned_at))}</strong><small>{proof.card_code} · {proof.status==="ready"?"Saved":proof.status==="failed"?"Waiting to retry at packing station":"Saving video"}</small></div><button type="button" disabled={proof.status!=="ready"||opening||loading} onClick={()=>void view(proof.id)}>View video</button></div>)}</div>
    {opening&&<p role="status">Opening video…</p>}
    {selected&&<div className={styles.viewer}>
      <div className={styles.playerBar}><small aria-live="polite">{videoInfo||"Loading saved recording…"}</small><a href={selected.url} target="_blank" rel="noopener noreferrer">Open full-size video ↗</a></div>
      <video key={selected.request} className={styles.player} controls autoPlay playsInline preload="auto" src={selected.url}
        onLoadedMetadata={event=>{if(selected.request!==previewRequest.current)return;const video=event.currentTarget;setVideoInfo(`${video.videoWidth} × ${video.videoHeight} · ${Math.round(video.duration)} seconds`);}}
        onError={()=>{if(selected.request===previewRequest.current)setError("The video could not play here. Try Open full-size video or Refresh videos.");}}/>
    </div>}
  </section>;
}
