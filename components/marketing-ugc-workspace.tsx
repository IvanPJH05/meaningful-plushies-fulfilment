"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "./dashboard-language";
import { NotificationMessage } from "./notification-bar";
import { LoadingIndicator } from "./loading-indicator";
import { isUgcOrder, ugcClaimLink, type UgcSample } from "../lib/marketing-ugc";
import type { Order } from "../lib/types";

export function MarketingUgcWorkspace({token,orders}:{token:string;orders:Order[]}) {
  const {t}=useLanguage();
  const [samples,setSamples]=useState<UgcSample[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [hasMore,setHasMore]=useState(false),[query,setQuery]=useState("");
  const empty={customerName:"",customerUrl:"",sourceOrderNumber:"",code:"",notes:""};
  const [form,setForm]=useState(empty),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [edits,setEdits]=useState<Record<string,{notes:string;orderNumber:string}>>({});
  const headers=useMemo(()=>({authorization:`Bearer ${token}`,"Content-Type":"application/json"}),[token]);
  const load=useCallback(async(offset=0)=>{
    setLoading(true);setError("");
    try { const response=await fetch(`/api/marketing/ugc?offset=${offset}`,{headers});const result=await response.json();if(!response.ok)throw new Error(result.error);setSamples(current=>offset?[...current,...result.samples]:result.samples);setHasMore(result.hasMore); }
    catch(error){setError(error instanceof Error?error.message:"Could not load UGC records.");}
    finally{setLoading(false);}
  },[headers]);
  useEffect(()=>{void load();},[load]);
  async function mutate(method:string,body:object){
    const response=await fetch("/api/marketing/ugc",{method,headers,body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||"UGC request failed.");
    if(result.sample)setSamples(current=>[result.sample,...current.filter(item=>item.id!==result.sample.id)]);
    window.dispatchEvent(new Event("meaningful-plushies-free-creator-samples"));
    if(result.error)setError(result.error);return result;
  }
  async function create(event:FormEvent){event.preventDefault();setBusy("create");setError("");try{const result=await mutate("POST",{id:requestId,...form});if(result.sample){setForm(empty);setRequestId(crypto.randomUUID());setNotice(result.error?t("UGC entry saved. Retry code creation below."):t("UGC code created: one free product and free shipping."));}}catch(error){setError(error instanceof Error?error.message:"Could not create UGC offer.");}finally{setBusy("");}}
  async function action(sample:UgcSample,kind:"retry"|"edit"|"disable"){
    if(kind==="disable"&&!confirm(t("Disable this UGC code? The customer will no longer be able to use it.")))return;
    setBusy(sample.id);setError("");try{const edit=edits[sample.id]||{notes:sample.notes,orderNumber:sample.order_number};await mutate(kind==="retry"?"POST":"PATCH",{id:sample.id,action:kind,expectedUpdatedAt:sample.updated_at,...edit});setNotice(t(kind==="disable"?"UGC code disabled.":kind==="edit"?"UGC record saved.":"UGC code creation finished."));}catch(error){setError(error instanceof Error?error.message:"Could not save UGC record.");}finally{setBusy("");}
  }
  async function copy(sample:UgcSample){try{await navigator.clipboard.writeText(`${t("Here is your UGC thank-you gift: one free product of your choice, with free shipping.")}\n${ugcClaimLink(sample.sample_code)}\n${t("Code")}: ${sample.sample_code}\n${t("Valid for one use. Add one product to your cart before checkout.")}`);setNotice(t("UGC message copied."));}catch{setError(t("Could not copy. Select and copy the claim link below."));}}
  const shown=samples.filter(sample=>!query.trim()||[sample.customer_name,sample.sample_code,sample.source_order_number,sample.order_number,sample.notes].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="marketing-ugc-workspace">
    {notice&&<NotificationMessage><p className="notice">{notice}</p></NotificationMessage>}{error&&<NotificationMessage><p className="batch-error" role="alert">{error}</p></NotificationMessage>}
    {loading&&<NotificationMessage completionText={null}><LoadingIndicator>{t("Loading UGC records...")}</LoadingIndicator></NotificationMessage>}
    {busy&&<NotificationMessage completionText={t("UGC update finished")}><LoadingIndicator>{t("Saving UGC offer...")}</LoadingIndicator></NotificationMessage>}
    <section className="creator-hero card"><div><p>{t("MARKETING")}</p><h2>{t("Customer UGC")}</h2><span>{t("Thank real customers for their content with one free product and free shipping.")}</span></div><div className="accounting-status-pill">{samples.length} {t("customer offers")}</div></section>
    <section className="card ugc-offer-summary"><strong>{t("1 free product")}</strong><span>{t("Any product")}</span><span>{t("Free shipping")}</span><span>{t("Single-use code")}</span></section>
    <form className="creator-form card ugc-entry-form" onSubmit={create}>
      <h3>{t("Create customer UGC offer")}</h3><div className="ugc-form-grid">
      <label>{t("Customer name")}<input required maxLength={200} value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/></label>
      <label>{t("Original order number")}<input maxLength={100} value={form.sourceOrderNumber} onChange={e=>setForm({...form,sourceOrderNumber:e.target.value})} placeholder="#1912"/></label>
      <label>{t("Customer profile link")}<input type="url" value={form.customerUrl} onChange={e=>setForm({...form,customerUrl:e.target.value})} placeholder="https://www.tiktok.com/@customer"/></label>
      <label>{t("Discount code (optional)")}<input maxLength={60} value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder={t("Generate automatically")}/><small>{t("Codes use the UGC- prefix.")}</small></label>
      <label className="ugc-wide">{t("Notes")}<textarea maxLength={20000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div>
      <button className="button primary" disabled={!!busy||loading}>{t("Create free product + shipping code")}</button>
    </form>
    <section className="card"><div className="ugc-list-toolbar"><h3>{t("Customer UGC offers")}</h3><input type="search" aria-label={t("Search UGC offers")} placeholder={t("Search customer, code or order...")} value={query} onChange={e=>setQuery(e.target.value)}/><button className="button secondary" disabled={loading||!!busy} onClick={()=>void load()}>{t("Refresh")}</button></div>
    <div className="table-scroll"><table className="ugc-offers-table"><thead><tr>{["Customer","Code / claim link","Orders","Customer details","Notes","Actions"].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{shown.map(sample=>{const claims=orders.filter(order=>sample.shopify_discount_id&&isUgcOrder(order,[sample.sample_code]));const paired=claims.length===1?claims[0]:orders.find(order=>order.orderNumber.replace(/^#/,"")===sample.order_number.replace(/^#/,"")&&sample.order_number);const edit=edits[sample.id]||{notes:sample.notes,orderNumber:sample.order_number};return <tr key={sample.id}>
      <td><strong>{sample.customer_name}</strong>{sample.customer_url&&<a href={sample.customer_url} target="_blank" rel="noreferrer">{t("Profile")}</a>}<small>{new Date(sample.given_at).toLocaleDateString()}</small><small>{t("Original order")}: {sample.source_order_number||"—"}</small></td>
      <td><code>{sample.sample_code}</code><small>{t(sample.status==="pending"?"Code creation pending":sample.status==="disabled"?"Disabled":claims.length?"Claimed":"Ready to claim")}</small>{sample.shopify_discount_id&&sample.status!=="disabled"&&<><a href={ugcClaimLink(sample.sample_code)} target="_blank" rel="noreferrer">{t("Open claim link")}</a><button className="button secondary small" onClick={()=>void copy(sample)}>{t("Copy message")}</button></>}</td>
      <td><strong>{claims.length} {t("orders")}</strong>{claims.map(order=><small key={order.id}>#{order.orderNumber.replace(/^#/,"")}</small>)}<input aria-label={`${t("Order number")} ${sample.customer_name}`} value={edit.orderNumber} placeholder={paired?`#${paired.orderNumber}`:t("Order #")} onChange={e=>setEdits({...edits,[sample.id]:{...edit,orderNumber:e.target.value}})}/></td>
      <td>{paired?<><strong>{paired.customerName}</strong><small>{paired.phone}</small><small>{paired.address}</small></>:t("Waiting for claim")}</td>
      <td><textarea aria-label={`${t("Notes")} ${sample.customer_name}`} value={edit.notes} onChange={e=>setEdits({...edits,[sample.id]:{...edit,notes:e.target.value}})}/></td>
      <td>{sample.status==="pending"&&<button className="button primary small" disabled={!!busy} onClick={()=>void action(sample,"retry")}>{t("Retry code creation")}</button>}<button className="button secondary small" disabled={!!busy} onClick={()=>void action(sample,"edit")}>{t("Save")}</button>{sample.status!=="disabled"&&<button className="button danger small" disabled={!!busy} onClick={()=>void action(sample,"disable")}>{t("Disable code")}</button>}</td>
    </tr>;})}</tbody></table></div>{!loading&&!shown.length&&<p className="empty">{t("No customer UGC offers yet.")}</p>}{hasMore&&<button className="button secondary" disabled={loading} onClick={()=>void load(samples.length)}>{t("Load more")}</button>}</section>
  </div>;
}
