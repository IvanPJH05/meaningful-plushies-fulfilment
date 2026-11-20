"use client";
import { useCallback,useEffect,useState } from "react";
import type { PackingProofRow } from "@/lib/packing-proof";
import styles from "./packing-camera-station.module.css";
export function OrderPackingVideos({orderId,token}:{orderId:string;token:string}) {
  const [proofs,setProofs]=useState<PackingProofRow[]>([]),[error,setError]=useState(""),[url,setUrl]=useState(""),[loading,setLoading]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/production-tracking/proofs?orderId="+encodeURIComponent(orderId),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load packing videos.");setProofs(data.proofs);
    } catch(error){setError(error instanceof Error?error.message:"Could not load packing videos.");}
    finally{setLoading(false);}
  },[orderId,token]);
  useEffect(()=>{void load();},[load]);
  async function view(id:string) {
    setError("");
    try {
      const response=await fetch("/api/production-tracking/proofs",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action:"preview",id})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not open the video.");setUrl(data.url);
    } catch(error){setError(error instanceof Error?error.message:"Could not open the video.");}
  }
  return <section className="detail-section"><h3>Packing videos</h3>
    <p>23-second webcam proof, saved by the packing station.</p>
    <button type="button" disabled={loading} onClick={()=>void load()}>Refresh videos</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loading && !proofs.length && !error && <p>No packing video saved yet.</p>}
    <div className={styles.proofs}>{proofs.map(proof=><div className={styles.proofRow} key={proof.id}><div><strong>{new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium",timeStyle:"short"}).format(new Date(proof.scanned_at))}</strong><small>{proof.card_code} · {proof.status==="ready"?"Saved · 23 seconds":proof.status==="failed"?"Waiting to retry at packing station":"Saving video"}</small></div><button type="button" disabled={proof.status!=="ready"} onClick={()=>void view(proof.id)}>View video</button></div>)}</div>
    {url && <video key={url} className={styles.player} controls autoPlay playsInline src={url} />}
  </section>;
}
