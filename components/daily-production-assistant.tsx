"use client";
import {useEffect,useState,type ReactNode} from "react";
import {ManualOrderIntakeRecords} from "./manual-order-intake-records";
import {malaysiaToday} from "@/lib/production-tracking";
import type {DailyManualPaymentSummary} from "@/lib/daily-manual-payments";
import styles from "./production-tracking.module.css";
import assistantStyles from "./daily-production-assistant.module.css";
export function DailyProductionAssistant({token,admin,importPanel,importDirty,production,onReviewOrders}:{token:string;admin:boolean;importPanel:ReactNode;importDirty:boolean;production:(startBatch:()=>void,reviewPreparedOrders:boolean)=>ReactNode;onReviewOrders:()=>void}){
 const [step,setStep]=useState(2),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [noTikTok,setNoTikTok]=useState(false),[count,setCount]=useState(""),[summary,setSummary]=useState<DailyManualPaymentSummary|null>(null);
 useEffect(()=>{
   try {
     const tally=JSON.parse(localStorage.getItem("mp-daily-manual-payment-count")||"null");
     if(tally?.day===malaysiaToday()&&typeof tally.count==="string")setCount(tally.count);
   }catch{}
 },[]);
 function go(next:number){setStep(next);setError("");}
 function startBatch(){setNoTikTok(false);setSummary(null);go(0);}
 async function checkPayments(){
   if(!/^\d+$/.test(count)||!Number.isSafeInteger(Number(count)))throw Error("Enter today's number of manual payment transactions, including 0 if there were none.");
   const r=await fetch(`/api/manual-order-intakes?paymentDay=${malaysiaToday()}`,{headers:{"x-dashboard-session":token},cache:"no-store"});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||"Could not check today's manual payments.");
   const result=d.summary as DailyManualPaymentSummary | undefined;
   if(!result || !Number.isSafeInteger(result.paymentCount) || !Number.isSafeInteger(result.orderCount) || !Array.isArray(result.missingOrders) || !Array.isArray(result.orders)) throw Error("The payment check returned incomplete data. Please try again.");
   setSummary(result);try{localStorage.setItem("mp-daily-manual-payment-count",JSON.stringify({day:result.day,count}));}catch{}
   return Number(count)===result.orderCount&&Number(count)===result.paymentCount&&!result.missingOrders.length;
 }
 async function check(){if(busy)return;setBusy(true);setError("");setSummary(null);try{await checkPayments();}catch(e){setError(e instanceof Error ? e.message : "Could not check manual payments. Please try again.");}finally{setBusy(false);}}
 async function next(){if(busy)return;setBusy(true);setError("");try{if(step===0){if(importDirty)throw Error("Save the TikTok import and details before continuing.");go(1);}else{if(!await checkPayments())throw Error("The manual payment count does not tally yet. Check the difference below and any paid orders still waiting to be created.");onReviewOrders();}}catch(e){setError(e instanceof Error ? e.message : "Could not check manual payments. Please try again.");}finally{setBusy(false);}}
 if(step>=2)return production(startBatch,false);
 const matches=summary&&Number(count)===summary.orderCount&&Number(count)===summary.paymentCount&&!summary.missingOrders.length;
 return <div className={assistantStyles.flow}><section className={styles.panel}><button type="button" disabled={busy||importDirty} onClick={()=>go(2)}>Back to batches</button><small>DAILY PRODUCTION · STEP {step+1} OF 7</small><h2>{step===0?"Review TikTok orders and customisation":"Approve manual orders and check payments"}</h2><p>{step===0?"Review the automatically imported TikTok orders and save their plushie information below. Then continue to manual payments.":"Enter how many bank transfer / receipt payments you received today. Awaiting approval means unpaid; those orders stay pending and do not block production."}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}</section>
 {step===0?<><div className="import-page">{importPanel}</div><section className={`${styles.panel} ${assistantStyles.controls}`}><label><input type="checkbox" checked={noTikTok} onChange={e=>setNoTikTok(e.target.checked)}/>I have reviewed TikTok orders, or there are none today</label><button type="button" disabled={busy||importDirty||!noTikTok} onClick={()=>void next()}>Continue to manual payments</button></section></>:<>
 <section className={styles.panel}><h2>Review manual orders</h2><div className="manual-orders-workspace"><ManualOrderIntakeRecords sessionToken={token}/></div></section>
 <section className={`${styles.panel} ${assistantStyles.controls}`}><h2>Today's transaction count</h2><p>Malaysia date: {malaysiaToday()}. Counts manual payments by receipt attachment date, once per order. Shopify checkout, TikTok and cash on delivery are excluded.</p>
 <label>Manual payment transactions received today<input type="number" min="0" step="1" inputMode="numeric" value={count} disabled={busy} onChange={e=>{setCount(e.target.value);setSummary(null);setError("");}} placeholder="Enter a number"/></label><button type="button" disabled={busy} onClick={()=>void check()}>{busy?"Checking…":"Check against my orders"}</button>
 {summary&&<div role="status" className={assistantStyles.result}><strong>{matches?"Tallies — all manual payments have orders.":"Does not tally yet"}</strong><p>You entered: {count} · Recorded payments: {summary.paymentCount} · Paid manual orders created: {summary.orderCount}</p>{Number(count)!==summary.orderCount&&<p>{Number(count)>summary.orderCount?`${Number(count)-summary.orderCount} fewer orders than transactions entered.`:`${summary.orderCount-Number(count)} more orders than transactions entered.`}</p>}{summary.missingOrders.length>0&&<><p>Payment recorded, but the Shopify order still needs to be created:</p><ul>{summary.missingOrders.map(row=><li key={row.id}>{row.customerName}</li>)}</ul></>}<details><summary>Paid orders included in this check</summary>{summary.orders.length?<ul>{summary.orders.map(row=><li key={row.id}>{row.orderName} · {row.customerName}</li>)}</ul>:<p>No paid manual orders for today.</p>}</details></div>}
 <p>Unpaid orders can wait until the customer pays. No reason is needed.</p><button type="button" disabled={busy||!matches} onClick={()=>void next()}>Payments checked · review all orders</button></section>
</>}
 </div>;
}
