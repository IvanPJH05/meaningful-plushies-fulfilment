"use client";
import {useState,useRef,useEffect} from "react";
import {actionableTasks,taskInstructions,taskAction} from "@/lib/production-tasks";
import {productionBatchLabel,productionBatchCreatedAt,matchesProductionBarcode,malaysiaToday,type ProductionBatch,type ProductionItem} from "@/lib/production-tracking";
import type {Order} from "@/lib/types";
import {ProductionPairScanner} from "./production-pair-scanner";
import styles from "./production-task-mode.module.css";
export function ProductionTaskMode({batch,initialItems,audioSourceFor,checkCard,commit,downloadAudio,onPrint,onExit}:{batch:ProductionBatch;audioSourceFor:(order:Order)=>string;checkCard:(code:string)=>Promise<unknown>;initialItems:ProductionItem[];commit:(item:ProductionItem,action:string,scan:string,card:string,note:string)=>Promise<ProductionItem[]>;downloadAudio:()=>Promise<ProductionItem[]>;onPrint:(orders:Order[])=>Promise<unknown>;onExit:()=>void}){
 const [,tick]=useState(0);useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer);},[]);
 const [items,setItems]=useState(initialItems),[scan,setScan]=useState(""),[card,setCard]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");const lock=useRef(false);const audio=useRef<HTMLAudioElement>(null);const orderInput=useRef<HTMLInputElement>(null),cardInput=useRef<HTMLInputElement>(null);
 const tasks=actionableTasks(items,batch,malaysiaToday()),blocked=items.filter(i=>(!i.disposition||i.disposition==="active")&&Boolean(i.issue)),item=tasks[0]||blocked[0],task=item?taskInstructions[item.stage]:null;

 const needsScan=item&&["at_tailor","returned","audio_passed","packed"].includes(item.stage);
 const matched=item&&matchesProductionBarcode({id:item.order_id,orderNumber:item.order?.orderNumber},scan);
 function focusScanner(){if(!needsScan||busy)return;const field=item?.stage==="audio_passed"&&matched?cardInput.current:orderInput.current;field?.focus({preventScroll:true});field?.select();}
 useEffect(()=>{focusScanner();},[item?.id,item?.stage,matched,busy]); // eslint-disable-line react-hooks/exhaustive-deps
 async function finish(decision?:"remove"|"defer"){if(!item||lock.current)return;lock.current=true;setBusy(true);setError("");try{const updated=!decision&&item.stage==="labels_printed"?await downloadAudio():await commit(item,decision||taskAction(item)!,scan,card,note);setItems(updated);setScan("");setCard("");setNote("");}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 if ((item && ["at_tailor","returned","audio_passed"].includes(item.stage)) || (!item && items.some(row => row.stage === "packed"))) {
   return <section className={styles.screen} aria-label="Production barcode scanner">
     <header><strong>{productionBatchLabel(batch.batch_number)} · {productionBatchCreatedAt(batch.created_at)}</strong>
       <button disabled={busy} onClick={onExit}>Back to today’s work</button></header>
     <ProductionPairScanner items={items} audioSourceFor={audioSourceFor} checkCard={checkCard}
       onBusy={setBusy} save={async (...args) => {
         const updated = await commit(...args);
         setItems(updated);
         return updated;
       }} />
   </section>;
 }
 return <section className={styles.screen} onClick={e=>{if(!(e.target as HTMLElement).closest("button,a,input,textarea,select,audio,summary,label,[role=button]"))focusScanner();}} aria-label="Production task mode"><header><strong>{productionBatchLabel(batch.batch_number)} · {productionBatchCreatedAt(batch.created_at)}</strong><button disabled={busy} onClick={onExit}>Back to today’s work</button></header>
 {item&&task?<main key={item.id+item.stage}><span className={styles.kicker}>YOUR CURRENT TASK</span><h1>{task.title}</h1><div className={styles.identity}><strong>#{String(item.order?.orderNumber||item.order_id)}</strong><span>{String(item.order?.plushName||item.order?.character||"Plushie")} · {String(item.order?.character||"")}</span></div><p className={styles.instruction}>{task.instruction}</p>{item.issue&&<p role="alert" className={styles.error}>ISSUE: {item.issue}. Record a decision below to continue.</p>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 {item.stage==="received"&&<button disabled={busy} onClick={()=>void onPrint([{...item.order,id:item.order_id} as Order])}>Open label & packing slip PDF</button>}
 {["at_tailor","returned"].includes(item.stage)&&typeof item.order?.meaningfulMessage==="string"&&<div className={styles.audio}><audio ref={audio} controls src={item.order.meaningfulMessage}/><a href={item.order.meaningfulMessage} target="_blank" rel="noreferrer">Open / download saved audio</a></div>}
 {needsScan&&<p className={styles.scanHint}>Click anywhere on the page to scan {item.stage==="audio_passed"&&matched?"the certificate card":"the order barcode"}.</p>}{needsScan&&<label>Scan this order barcode<input ref={orderInput} autoFocus disabled={busy} value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&matched)void audio.current?.play().catch(()=>setError("Press Play to hear the reference audio."));}} placeholder="Scan order, then Enter"/>{scan&&!matched&&<small>This barcode does not match the displayed order.</small>}</label>}
 {item.stage==="audio_passed"&&matched&&<label>Scan the certificate card<input ref={cardInput} autoFocus disabled={busy} value={card} onChange={e=>setCard(e.target.value)} placeholder="NFC-100001 or legacy six-digit code"/></label>}
 <button className={styles.done} disabled={busy||Boolean(item.issue)||Boolean(needsScan&&!matched)||(item.stage==="audio_passed"&&!card.trim())} onClick={()=>void finish()}>{busy?"Saving…":task.done+" → Next task"}</button>
 <details><summary>Something is wrong / cannot complete</summary><label>Describe the problem<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000}/></label><button disabled={busy||note.trim().length<3} onClick={()=>void finish("remove")}>Remove from queue</button><button disabled={busy||note.trim().length<3} onClick={()=>void finish("defer")}>Leave for tomorrow</button></details><footer>{tasks.length} tasks ready in this batch · {items.filter(i=>i.issue).length} plushies need attention. Progress saves after each confirmation.</footer>
 </main>:<main><span className={styles.kicker}>YOU’RE UP TO DATE</span><h1>{items.every(i=>["packed","collected","delivered"].includes(i.stage)||["removed","deferred"].includes(i.disposition||""))?"Production completed · awaiting J&T pickup":"No active tasks in this batch"}</h1><p className={styles.instruction}>Your progress is saved. Return to the production overview to start new orders or continue another batch.</p><button className={styles.done} onClick={onExit}>Back to production overview</button></main>}</section>;
}
