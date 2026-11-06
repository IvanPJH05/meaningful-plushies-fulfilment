"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {productionBatchLabel,productionBatchCreatedAt,batchSchedule,malaysiaToday,matchesProductionBarcode,stageLabels,productionStages,type ProductionItem,type ProductionBatch,type ProductionStage} from "@/lib/production-tracking";
import {ProductionLabelPreparation} from "./production-label-preparation";
import {ProductionTaskMode} from "./production-task-mode";
import {nextProductionStage,taskAction,taskReady,taskInstructions} from "@/lib/production-tasks";
import {OrderBarcode,packingItemBarcodeValue} from "./order-barcode";
import {prepareBatchAudioFiles} from "@/lib/prepare-batch-audio";
import {buildAudioZip} from "@/lib/batch-zip-client";
import type {Order} from "@/lib/types";
import styles from "./production-tracking.module.css";
type Batch=ProductionBatch&{production_items:{stage:ProductionStage;issue:string;disposition?:ProductionItem["disposition"];carried_issue?:string}[]};
function batchIsOpen(items: Pick<ProductionItem,"stage"|"disposition">[]) {
 return items.some(item=>(!item.disposition||item.disposition==="active")&&["received","labels_printed","audio_ready","stuffed"].includes(item.stage));
}
type Event={actorName?:string;id:number;item_id:string;stage:keyof typeof stageLabels;kind:string;note:string;created_at:string};
export function ProductionTrackingWorkspace({token,admin,onOpenScanner,onPrint,onOpenOrder,screen,onScreenChange,assistant=false,onCycleComplete,reviewPreparedOrders=false,onBatchCreated}:{onOpenScanner:()=>void;assistant?:boolean;onCycleComplete?:()=>void;reviewPreparedOrders?:boolean;onBatchCreated?:(id:string)=>void;screen:"today"|"manage";onScreenChange:(screen:"today"|"manage")=>void;token:string;admin:boolean;onPrint:(orders:Order[])=>Promise<unknown>;onOpenOrder:(order:Order)=>Promise<void>}){
 const [,tick]=useState(0);useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer);},[]);
 const setScreen=onScreenChange;const [taskMode,setTaskMode]=useState(false),[overview,setOverview]=useState(assistant);
 const [batches,setBatches]=useState<Batch[]>([]),[batch,setBatch]=useState<ProductionBatch|null>(null),[items,setItems]=useState<ProductionItem[]>([]),[events,setEvents]=useState<Event[]>([]),[current,setCurrent]=useState("");
 const [day,setDay]=useState(malaysiaToday),[pickup,setPickup]=useState(batchSchedule(malaysiaToday()).pickupDate),[candidates,setCandidates]=useState<Order[]>([]),[chosen,setChosen]=useState<string[]>([]),[review,setReview]=useState(false);
 const [scan,setScan]=useState(""),[card,setCard]=useState(""),[note,setNote]=useState(""),[filter,setFilter]=useState("all"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const requestId=useRef(crypto.randomUUID()),lock=useRef(false),cardInput=useRef<HTMLInputElement>(null);
 const selected=items.find(i=>i.id===current);const next=selected?taskAction(selected):undefined;
 async function request(path="",body?:object){const r=await fetch(`/api/production-tracking${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},cache:"no-store",body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load production.");return d;}
 async function list(){const rows=(await request()).batches as Batch[];setBatches(rows);return rows;}
 async function load(id:string){const d=await request(`?batch=${id}`);setBatch(d.batch);setItems(d.items);setEvents(d.events);return d.items as ProductionItem[];}
 async function run(work:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await work();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{void run(async()=>{if(reviewPreparedOrders)await loadNewOrderReview();else await list();});/* staff auth is supplied by dashboard */},[token,reviewPreparedOrders]); // eslint-disable-line react-hooks/exhaustive-deps
 async function candidatesForDay(){await run(async()=>{const d=await request(`?candidates=1&day=${day}`);setCandidates(d.orders);setChosen(d.orders.filter((o:Order&{productionCarryover?:string})=>o.productionCarryover).map((o:Order)=>o.id));setReview(true);requestId.current=crypto.randomUUID();});}
 async function create(){await run(async()=>{if(onBatchCreated){const {createFulfilmentBatch}=await import("./batch-fulfilment-workspace");onBatchCreated(await createFulfilmentBatch(token,requestId.current,chosen));return;}const d=await request("",{action:"create",id:requestId.current,day,pickupDate:assistant?batchSchedule(day).pickupDate:pickup,orderIds:chosen});await list();await load(d.id);setReview(false);setNotice("Batch closed. Review each handover in the production list below.");});}
 async function step(action:string){if(!selected)return;await run(async()=>{await request("",{action,itemId:selected.id,version:selected.version,cardCode:card,orderBarcode:scan,note});await load(selected.batch_id);await list();setCard("");setNote("");setNotice(action==="packed"?"Certificate linked and packing confirmed.":"Progress saved.");});}
 function scanned(e:FormEvent){e.preventDefault();const matches=items.filter(i=>matchesProductionBarcode({id:i.order_id,orderNumber:i.order?.orderNumber},scan));if(matches.length===1){setCurrent(matches[0].id);setCard("");setNote("");setNotice("Order selected. Confirm the next completed task below.");setTimeout(()=>cardInput.current?.focus(),0);}else setError(matches.length?"Multiple plushies match. Choose the correct row below.":"This barcode is not in the selected batch.");}
 const visible=items.filter(i=>filter==="all"||(filter==="issues"?Boolean(i.issue):i.stage===filter));
 async function startTasks(id:string){await run(async()=>{await load(id);setOverview(false);setTaskMode(true);});}
 async function loadNewOrderReview(){const d=await request(`?candidates=1&day=${day}`);setCandidates(d.orders);setChosen([]);requestId.current=crypto.randomUUID();setBatch(null);setItems([]);setReview(true);setOverview(false);}
 async function completeTask(item:ProductionItem,action:string,orderBarcode:string,cardCode:string,taskNote:string){await request("",{action,itemId:item.id,version:item.version,orderBarcode,cardCode,note:taskNote});const updated=await load(item.batch_id);await list();return updated;}
 async function downloadAudio(){if(!batch)throw Error("Choose a batch.");const cohort=items.filter(i=>(!i.disposition||i.disposition==="active")&&i.stage==="labels_printed");const controller=new AbortController();const result=await prepareBatchAudioFiles(cohort.map(i=>({...i.order,id:i.order_id} as Order)),batch.id,token,controller.signal,()=>{},"/api/production-tracking/audio");if(result.missing.length||!result.available)throw Error("Missing audio. Remove or leave behind affected orders before downloading.");const blob=await buildAudioZip(result.files);const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="production-"+batch.production_date+"-audio.zip";link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);await request("",{action:"audio_complete",batchId:batch.id,versions:Object.fromEntries(cohort.map(i=>[i.id,i.version]))});const updated=await load(batch.id);await list();return updated;}
 if (assistant && overview) {
   const activeBatches = batches.flatMap(batch => {
     const active = batch.production_items.filter(item => (!item.disposition || item.disposition === "active") && taskInstructions[item.stage]);
     const next = nextProductionStage(active);
     if (!next || ["at_tailor", "returned", "audio_passed"].includes(next)) return [];
     return [{
       batch, active, next,
       ready: active.filter(item => item.stage === next && !item.issue).length,
       issues: active.filter(item => item.issue).length,
     }];
   });
   return (
     <div className={styles.page}>
       <section className={styles.panel}>
         <h2>Today’s production</h2>
         <p>Start a batch from New Orders or pick up an existing batch at its next step.</p>
         {error && <p role="alert" className={styles.error}>{error}</p>}
         {reviewPreparedOrders && error && <button disabled={busy} onClick={()=>void run(loadNewOrderReview)}>Retry order selection</button>}
         <div className={styles.toolbar}>
           {admin && <button disabled={busy} onClick={onCycleComplete}>Start a new batch</button>}
           <button disabled={busy} onClick={() => void run(() => list())}>Refresh batches</button>

         </div>
       </section>
       {!busy && !error && activeBatches.length === 0 && <p>No batches in progress. Completed batches are in Batches &amp; history.</p>}
       {activeBatches.map(({batch, active, next, ready, issues}) => (
         <section className={styles.panel} key={batch.id}>
           <h2>{productionBatchLabel(batch.batch_number)}</h2>
           <p>Created {productionBatchCreatedAt(batch.created_at)} · Production date {batch.production_date}</p>
           <p>{active.length} orders in progress · {issues} need attention · Planned pickup {batch.pickup_date}</p>
           <p><strong>{taskInstructions[next]?.title}</strong> · {ready ? ready + " ready at this step" : "Resolve issues to continue"}</p>
           <button disabled={busy} onClick={() => void startTasks(batch.id)}>
             {ready ? "Continue this batch" : "Review batch issues"}
           </button>
         </section>
       ))}
     </div>
   );
 }
 if(assistant&&!batch)return <div className={styles.page}><section className={styles.panel}><small>STEP 3 OF 7 · REVIEW ORDERS</small><h2>Choose production orders</h2><button disabled={busy} onClick={()=>setOverview(true)}>Back to production overview</button><p>Only New Order items appear below, including Plush Charms. Orders already in production are excluded. Confirm the selection to open the batch in Batch Fulfilment.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.toolbar}><label>Production date<input type="date" value={day} onChange={e=>{setDay(e.target.value);setReview(false);setChosen([]);}}/></label><button disabled={busy} onClick={()=>void candidatesForDay()}>Refresh new orders</button><button disabled={busy||!review} onClick={()=>setChosen(candidates.map(o=>o.id))}>Select all</button></div>{review&&<><p>{chosen.length} selected · create this batch whenever you are ready</p><div className={styles.candidates}>{candidates.map(o=><label key={o.id}><input type="checkbox" checked={chosen.includes(o.id)} onChange={e=>setChosen(v=>e.target.checked?[...v,o.id]:v.filter(id=>id!==o.id))}/>#{o.orderNumber} · {o.customerName} · {o.plushName||o.character}{(o as Order&{productionCarryover?:string}).productionCarryover?" · ISSUE carried forward":""}</label>)}</div><button disabled={busy||!chosen.length||(!admin&&!onBatchCreated)} onClick={()=>void create()}>Create batch · prepare labels</button>{!candidates.length&&<p>No eligible new orders. Import orders or choose the correct production date.</p>}</>}</section></div>;
 if(assistant&&batch&&items.some(i=>(!i.disposition||i.disposition==="active")&&i.stage==="received"))return <><div className={styles.panel}><button disabled={busy} onClick={()=>setOverview(true)}>Back to production overview</button></div><ProductionLabelPreparation token={token} admin={admin} batch={batch} items={items} request={request} reload={async()=>{await load(batch.id);await list();}} onPrint={onPrint} decide={(item,action,reason)=>completeTask(item,action,"","",reason)}/></>;
 if((taskMode||assistant)&&batch)return <ProductionTaskMode onOpenScanner={onOpenScanner} batch={batch} initialItems={items} commit={completeTask} downloadAudio={downloadAudio} onPrint={onPrint} onExit={()=>{if(assistant){setTaskMode(false);setOverview(true);void run(()=>list());return;}setTaskMode(false);void run(async()=>{await list();await load(batch.id);});}}/>;
 return <div className={styles.page}>

 {screen==="today"&&<>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <section className={styles.panel}><h2>Today’s work · {malaysiaToday()}</h2><p>Choose a batch and press Start tasks. You’ll see one instruction at a time, with the correct order and a completion button.</p>{admin&&<button onClick={()=>setScreen("manage")}>Prepare a new batch</button>}</section>
 {!batches.length&&<section className={styles.panel}><h2>No production batches yet</h2><p>Prepare your first batch in Batches & history. Once closed, your guided tasks will appear here.</p></section>}
 {batches.map(b=>{const ready=b.production_items.filter(i=>(!i.disposition||i.disposition==="active")&&!i.issue&&taskInstructions[i.stage as keyof typeof taskInstructions]&&taskReady(b,i.stage,malaysiaToday()));const issues=b.production_items.filter(i=>i.issue).length;const upcoming=b.production_items.filter(i=>(!i.disposition||i.disposition==="active")&&!i.issue&&taskInstructions[i.stage as keyof typeof taskInstructions]&&!taskReady(b,i.stage,malaysiaToday())).length;return <section className={styles.panel} key={b.id}><h2>Production date · {b.production_date}</h2><p><strong>{ready.length} ready tasks</strong> · {issues} issues · {upcoming} unavailable · Pickup {b.pickup_date}</p><ul>{Object.entries(taskInstructions).map(([stage,task])=>{const count=ready.filter(i=>i.stage===stage).length;return count?<li key={stage}>{task.title} · {count}</li>:null;})}</ul><div className={styles.toolbar}><button disabled={busy||!ready.length} onClick={()=>void startTasks(b.id)}>Start tasks</button><button disabled={busy} onClick={()=>void run(async()=>{await load(b.id);setScreen("manage");})}>View batch / resolve issues</button></div></section>;})}
 </>}
 {screen==="manage"&&<section className={styles.panel}>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div className={styles.toolbar}>
     {batch&&<button disabled={busy} onClick={()=>{setBatch(null);setItems([]);}}>Back to batches</button>}
     <button disabled={busy} onClick={()=>void run(async()=>{await list();if(batch)await load(batch.id);})}>Refresh</button>
   </div>
   {batch ? <>
     <h2>{productionBatchLabel(batch.batch_number)}</h2>
     <p>Created {productionBatchCreatedAt(batch.created_at)} · {batchIsOpen(items) ? "Open" : "Closed"}</p>
     <div className="table-scroll"><table className="orders-table">
       <thead><tr><th>Order number</th><th>Status</th></tr></thead>
       <tbody>{items.map(item=><tr key={item.id}>
         <td><button onClick={()=>void run(()=>onOpenOrder({...item.order,id:item.order_id} as Order))}>#{String(item.order?.orderNumber||item.order_id)}</button></td>
         <td>{item.disposition==="removed"?"Removed":item.disposition==="deferred"?"Deferred":stageLabels[item.stage]}{item.issue && " · " + item.issue}</td>
       </tr>)}</tbody>
     </table></div>
     {!items.length&&<p>No orders in this batch.</p>}
   </> : <>
     <div className="table-scroll"><table className="orders-table">
       <thead><tr><th>Batch number</th><th>Created (Malaysia time)</th><th>Status</th></tr></thead>
       <tbody>{batches.map(row=><tr key={row.id}>
         <td><button disabled={busy} onClick={()=>void run(()=>load(row.id))}>{productionBatchLabel(row.batch_number)}</button></td>
         <td>{productionBatchCreatedAt(row.created_at)}</td>
         <td>{batchIsOpen(row.production_items) ? "Open" : "Closed"}</td>
       </tr>)}</tbody>
     </table></div>
     {!batches.length&&!error&&<p>{busy?"Loading batches…":"No batches yet."}</p>}
   </>}
 </section>}
 </div>;
}
