"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { nfcCardScan, nfcCardUrl, type NfcBatch, type NfcCard, type NfcScanOrder } from "../lib/nfc-cards";
import { OrderBarcode } from "./order-barcode";
import styles from "./nfc-card-workspace.module.css";

type Log={id:number;card_id:number;order_id:string|null;action:string;actor:string;reason:string;created_at:string};
type Inventory={batches:NfcBatch[];cards:NfcCard[];logs:Log[];batchId?:string};
const publicOrigin=process.env.NEXT_PUBLIC_APP_URL || "https://meaningful-plushies-fulfilment.vercel.app";
function download(blob:Blob,name:string) {const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function NfcCardWorkspace({token,admin,onStartNfc}:{token:string;admin:boolean;onStartNfc:()=>void}) {
  const [tab,setTab]=useState<"pair"|"prepare"|"history">("pair");
  const [inventory,setInventory]=useState<Inventory>({batches:[],cards:[],logs:[]});
  const [batchId,setBatchId]=useState("");
  const [quantity,setQuantity]=useState(50);
  const generation=useRef<{id:string;quantity:number}|null>(null);
  const [busy,setBusy]=useState(false),busyRef=useRef(false);
  const [message,setMessage]=useState("");
  const [success,setSuccess]=useState(false);
  const [scan,setScan]=useState("");
  const [pendingOrder,setPendingOrder]=useState<{scan:string;order:NfcScanOrder}|null>(null);
  const [pendingCard,setPendingCard]=useState<number|null>(null);
  const [lastPair,setLastPair]=useState<{card:NfcCard;order:NfcScanOrder}|null>(null);
  const [lookup,setLookup]=useState("");
  const [verify,setVerify]=useState<NfcCard|null>(null),[verifyUrl,setVerifyUrl]=useState("");
  const [correction,setCorrection]=useState<{card:NfcCard;action:"unpair"|"void"}|null>(null),[reason,setReason]=useState("");
  const [labelFormat,setLabelFormat]=useState<"thermal"|"a4">("thermal");
  const input=useRef<HTMLInputElement>(null);
  async function request(body?:Record<string,unknown>, query="") {
    const response=await fetch(`/api/fulfilment/nfc${query}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"});
    const result=await response.json(); if(!response.ok) throw new Error(result.error || "NFC request failed."); return result;
  }
  async function load(id=batchId,card="") {
    const query=card?`?cardId=${encodeURIComponent(card)}`:id?`?batchId=${encodeURIComponent(id)}`:"";
    const data=await request(undefined,query) as Inventory; setInventory(data); if(!card) setBatchId(data.batchId || "");
  }
  useEffect(()=>{void load().catch(error=>setMessage(error.message)); /* initial load for this session */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token]);
  useEffect(()=>{if(tab==="pair"&&!busy)input.current?.focus();},[tab,busy]);
  async function run(action:()=>Promise<void>) {
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setMessage("");setSuccess(false);
    try{await action();}catch(error){setMessage(error instanceof Error?error.message:"Request failed. Please retry.");}
    finally{busyRef.current=false;setBusy(false);}
  }
  async function generate() {
    const pending=generation.current || {id:crypto.randomUUID(),quantity}; generation.current=pending;
    const result=await request({action:"generate",batchId:pending.id,quantity:pending.quantity});
    // Keep the same request ID after a lost response; retry cannot mint more cards.
    await load(result.batchId);generation.current=null;setMessage(`Generated ${pending.quantity} permanent card links. Write each link to its matching card before pairing.`);setSuccess(true);
  }
  async function programmed(card:NfcCard,source:string) {
    await request({action:"programmed",cardId:card.id,reason:source});await load(card.batch_id);
    setMessage(`NFC-${card.id} is verified and ready to pair.`);setSuccess(true);
  }
  async function write(card:NfcCard) {
    const passwordResponse=await fetch("/api/fulfilment/nfc-password",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
    const result=await passwordResponse.json();if(!passwordResponse.ok||!result.password)throw new Error(result.error||"Could not load NFC writer settings.");
    setMessage(`Hold card NFC-${card.id} on the reader until writing finishes.`);
    const response=await fetch("http://127.0.0.1:17654/write",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:nfcCardUrl(publicOrigin,card.public_token),label:`NFC-${card.id}`,password:result.password})});
    const written=await response.json();if(!response.ok||!written.ok)throw new Error(written.error||"The NFC helper did not confirm this card. Start the helper and retry.");
    await programmed(card,"Permanent link written and confirmed by Windows NFC helper");
  }
  async function submitScan(event:FormEvent) {
    event.preventDefault();const value=scan.trim();if(!value)return;
    await run(async()=>{
      const card=nfcCardScan(value);
      let nextCard=pendingCard,nextOrder=pendingOrder;
      if(card!==null){
        if(pendingCard!==null&&pendingCard!==card)throw new Error("A different card is already scanned. Clear the scans before switching boxes.");
        nextCard=card;setPendingCard(card);
      } else {
        if(pendingOrder&&pendingOrder.scan!==value)throw new Error("A plushie is already scanned. Clear the scans before switching orders.");
        const result=await request({action:"resolve",orderScan:value});nextOrder={scan:value,order:result.order};setPendingOrder(nextOrder);
      }
      setScan("");
      if(nextOrder&&nextCard!==null){
        const result=await request({action:"pair",orderScan:nextOrder.scan,cardId:nextCard});
        setLastPair(result);setPendingOrder(null);setPendingCard(null);setSuccess(true);
        setMessage(`Paired NFC-${result.card.id} with #${result.order.orderNumber}${result.order.plushName?` · ${result.order.plushName}`:""}. Move this box to the completed area.`);
      }
    });
  }
  async function labels() {
    const {nfcLabelsPdf}=await import("../lib/nfc-card-labels");
    const bytes=await nfcLabelsPdf(inventory.cards,labelFormat);
    download(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),`nfc-labels-${inventory.cards[0]?.id}-${labelFormat}.pdf`);
  }
  function csv() {
    const rows=[["card_id","barcode","url","status","programmed"],...inventory.cards.map(card=>[String(card.id),`NFC-${card.id}`,nfcCardUrl(publicOrigin,card.public_token),card.status,card.programmed_at?"yes":"no"])];
    download(new Blob([rows.map(row=>row.map(value=>`"${value.replace(/"/g,'""')}"`).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),`nfc-links-${inventory.cards[0]?.id}.csv`);
  }
  return <div className={styles.workspace}>
    <header><p className={styles.eyebrow}>NFC CARD SYSTEM</p><h2>Prepare once. Pair at packing.</h2><p>Write permanent links to cards in advance, then scan the plushie's packing-slip code and the box's NFC barcode to connect them.</p></header>
    <div className={styles.tabs} role="tablist" aria-label="NFC workflow">{([ ["pair","Pair at packing"],["prepare","Prepare cards"],["history","Pairing history"] ] as const).map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} disabled={busy} onClick={()=>{setTab(id);if(id!=="pair")void run(()=>load());}}>{label}</button>)}</div>
    {message&&<p role={success?"status":"alert"} className={success?styles.success:styles.notice}>{message}</p>}
    {tab==="pair"&&<>
      <form className={styles.card} onSubmit={submitScan}><h3>{pendingOrder?"Scan the box's NFC barcode":pendingCard?"Scan the plushie's packing slip":"Ready for two scans"}</h3><p>Either scan can come first. A scanner that sends Enter will pair automatically after the second scan.</p>
        <label>Scan packing slip or NFC barcode<input ref={input} autoComplete="off" disabled={busy} value={scan} onChange={event=>setScan(event.target.value)} placeholder="MPI-1970-1 or NFC-100001" /></label>
        <div className={styles.actions}><button className="button primary" disabled={busy||!scan.trim()}>Read scan</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setPendingCard(null);setPendingOrder(null);setScan("");setMessage("");input.current?.focus();}}>Clear scans</button></div>
        <div className={styles.scanSummary}><div><small>PLUSHIE</small><strong>{pendingOrder?`#${pendingOrder.order.orderNumber} · ${pendingOrder.order.plushName||pendingOrder.order.character}`:"Waiting for packing slip"}</strong>{pendingOrder&&<span>{pendingOrder.order.customerName}</span>}</div><div><small>NFC CARD</small><strong>{pendingCard?`NFC-${pendingCard}`:"Waiting for box barcode"}</strong></div></div>
        <p className={styles.help}>Older order barcodes work only when they identify one plushie. If a code matches multiple items, reprint the packing slip. Pairing does not change the production stage.</p>
      </form>
      {lastPair&&<div className={styles.card}><h3>Last successful pairing</h3><p>NFC-{lastPair.card.id} → #{lastPair.order.orderNumber} · {lastPair.order.plushName||lastPair.order.character}</p>{admin&&<button className="button secondary" disabled={busy} onClick={()=>{setReason("");setCorrection({card:lastPair.card,action:"unpair"});}}>Undo this pairing</button>}</div>}
    </>}
    {tab==="prepare"&&<>
      {admin&&<div className={styles.card}><h3>Generate a card batch</h3><p>Each card gets a permanent link and a matching barcode. Keep each card, sticker and box together.</p><div className={styles.actions}><label>Number of cards<input type="number" min={1} max={1000} disabled={busy||!!generation.current} value={quantity} onChange={event=>setQuantity(Number(event.target.value))}/></label><button className="button primary" disabled={busy||!Number.isInteger(quantity)||quantity<1||quantity>1000} onClick={()=>void run(generate)}>Generate links</button></div></div>}
      <div className={styles.card}><h3>Card inventory</h3><div className={styles.actions}><label>Batch<select value={batchId} disabled={busy} onChange={event=>{const id=event.target.value;setLookup("");void run(()=>load(id));}}><option value="">Choose a batch</option>{inventory.batches.map(batch=><option key={batch.id} value={batch.id}>Batch {batch.number} · {batch.quantity} cards</option>)}</select></label><button className="button secondary" disabled={busy} onClick={()=>void run(()=>load())}>Refresh inventory</button></div>
        <form className={styles.actions} onSubmit={event=>{event.preventDefault();const id=nfcCardScan(lookup);if(id===null){setMessage("Enter the card number or scan its NFC barcode.");return;}void run(()=>load("",String(id)));}}><label>Find a card<input value={lookup} onChange={event=>setLookup(event.target.value)} placeholder="NFC-100001" disabled={busy}/></label><button className="button secondary" disabled={busy||!lookup.trim()}>Find card</button></form>
        {!!inventory.cards.length&&<><div className={styles.actions}><button className="button secondary" disabled={busy} onClick={csv}>Download links CSV</button><label>Sticker layout<select value={labelFormat} onChange={event=>setLabelFormat(event.target.value as "thermal"|"a4")}><option value="thermal">50 × 25 mm thermal labels</option><option value="a4">A4 · 24 labels per sheet</option></select></label><button className="button secondary" disabled={busy} onClick={()=>void run(labels)}>Download barcode labels</button></div><p className={styles.help}>Print the PDF at actual size (100%). Exported links stay the same after pairing or a correction.</p></>}
        {admin&&<div className={styles.actions}><a className="button secondary" href="meaningful-nfc-helper://start" onClick={event=>{if(busy){event.preventDefault();return;}onStartNfc();}}>Start NFC Helper</a><a className="button secondary" href="/downloads/meaningful-plushies-nfc-helper.zip" download>Download NFC Helper</a></div>}
        <div className={styles.tableWrap}><table><thead><tr><th>Card</th><th>Status</th><th>Permanent link</th><th>Actions</th></tr></thead><tbody>{inventory.cards.map(card=><tr key={card.id}><td><OrderBarcode value={`NFC-${card.id}`} compact/></td><td>{card.status}{card.status==="available"&&<small>{card.programmed_at?"Written / verified":"Needs programming"}</small>}{card.order_id&&<small>Item: {card.order_id}</small>}</td><td><a href={nfcCardUrl(publicOrigin,card.public_token)} target="_blank" rel="noreferrer">Open permanent link</a><button className="button secondary small" disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(nfcCardUrl(publicOrigin,card.public_token));setMessage(`NFC-${card.id} link copied.`);setSuccess(true);})}>Copy link</button></td><td>{admin&&<div className={styles.rowActions}>{card.status==="available"&&<><button className="button primary small" disabled={busy} onClick={()=>void run(()=>write(card))}>{card.programmed_at?"Rewrite card":"Write card"}</button>{!card.programmed_at&&<button className="button secondary small" disabled={busy} onClick={()=>{setVerify(card);setVerifyUrl("");}}>Verify prewritten card</button>}</>}{card.status==="assigned"&&<button className="button secondary small" disabled={busy} onClick={()=>{setCorrection({card,action:"unpair"});setReason("");}}>Undo pairing</button>}{card.status!=="voided"&&<button className="button secondary small" disabled={busy} onClick={()=>{setCorrection({card,action:"void"});setReason("");}}>Void card</button>}</div>}</td></tr>)}</tbody></table></div>{!inventory.cards.length&&<p>No cards found. Generate a batch to begin.</p>}
      </div>
    </>}
    {verify&&<form className={styles.card} onSubmit={event=>{event.preventDefault();void run(async()=>{if(verifyUrl.trim()!==nfcCardUrl(publicOrigin,verify.public_token))throw new Error("The link read from the card does not match this card's permanent link. Rewrite the correct card.");await programmed(verify,"Prewritten card URL read and checked by administrator");setVerify(null);});}}><h3>Verify NFC-{verify.id}</h3><p>Read this physical card with your phone or NFC reader, then paste the link it contains. A matching barcode alone does not verify the card's contents.</p><label>Link read from the physical card<input value={verifyUrl} onChange={event=>setVerifyUrl(event.target.value)} disabled={busy}/></label><div className={styles.actions}><button className="button primary" disabled={busy||!verifyUrl.trim()}>Verify link</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setVerify(null)}>Cancel</button></div></form>}
    {correction&&<form className={styles.card} onSubmit={event=>{event.preventDefault();void run(async()=>{await request({action:correction.action,cardId:correction.card.id,expectedOrder:correction.card.order_id,reason});setCorrection(null);setLastPair(null);await load();setMessage(correction.action==="unpair"?"Pairing undone. The card is available again and its link no longer opens the previous plushie's page.":"Card voided. Its permanent link is inactive.");setSuccess(true);});}}><h3>{correction.action==="unpair"?"Undo pairing":"Void card"} · NFC-{correction.card.id}</h3><p>{correction.action==="unpair"?"The card's existing link will stop opening this plushie's page. You can pair it again after checking the box.":"This card will become unusable and its link will no longer open a plushie page."}</p><label>Reason<input maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/></label><div className={styles.actions}><button className="button primary" disabled={busy||!reason.trim()}>Confirm {correction.action==="unpair"?"undo":"void"}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setCorrection(null)}>Cancel</button></div></form>}
    {tab==="history"&&<div className={styles.card}><h3>Recent NFC activity</h3><button className="button secondary" disabled={busy} onClick={()=>void run(()=>load())}>Refresh history</button><div className={styles.tableWrap}><table><thead><tr><th>When</th><th>Card / item</th><th>Action</th><th>Staff</th><th>Reason</th></tr></thead><tbody>{inventory.logs.map(log=><tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td>NFC-{log.card_id}<small>{log.order_id}</small></td><td>{log.action}</td><td>{log.actor}</td><td>{log.reason}</td></tr>)}</tbody></table></div>{!inventory.logs.length&&<p>No NFC activity yet.</p>}</div>}
  </div>;
}
