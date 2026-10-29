"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useLanguage} from './dashboard-language';
import {ugcCollections,type UgcCollection} from '../lib/marketing-ugc';
type Submission={id:string;status:string;customer_name:string;phone:string;email:string;order_number:string;notes:string;consent_text:string;video_name:string;reward_id:string|null;review_notes:string;reviewed_by:string;reviewed_at:string|null;submitted_at:string;updated_at:string};
export function UgcSubmissions({token,onApproved}:{token:string;onApproved:()=>void}){
 const {t}=useLanguage(),[rows,setRows]=useState<Submission[]>([]),[status,setStatus]=useState('pending'),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[hasMore,setHasMore]=useState(false),[selected,setSelected]=useState<Submission|null>(null),[video,setVideo]=useState(''),[notes,setNotes]=useState(''),[collection,setCollection]=useState<UgcCollection>('classics');
 const headers=useMemo(()=>({authorization:`Bearer ${token}`,'Content-Type':'application/json'}),[token]);
 const load=useCallback(async(offset=0)=>{setLoading(true);setError('');try{const response=await fetch(`/api/marketing/submissions?status=${status}&offset=${offset}`,{headers});const result=await response.json();if(!response.ok)throw new Error(result.error);setRows(current=>offset?[...current,...result.submissions]:result.submissions);setHasMore(result.hasMore);}catch(error){setError(error instanceof Error?error.message:'Could not load submissions.');}finally{setLoading(false);}},[headers,status]);
 useEffect(()=>{void load();},[load]);
 async function request(body:object){const response=await fetch('/api/marketing/submissions',{method:'POST',headers,body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
 async function open(row:Submission){setBusy(row.id);setError('');setVideo('');try{const result=await request({id:row.id,action:'video'});setVideo(result.url);setSelected(row);setNotes(row.review_notes);setCollection('classics');}catch(error){setError(error instanceof Error?error.message:'Could not open video.');}finally{setBusy('');}}
 async function review(action:'approve'|'reject'){
  if(!selected)return;setBusy(selected.id);setError('');
  try{const result=await request({id:selected.id,action,expectedUpdatedAt:selected.updated_at,notes,productCollection:collection});
   if(action==='approve'){
    // The approval links exactly one saved offer before Shopify is called. A failed
    // creation can be retried from the ledger without approving a second reward.
    onApproved();
    const response=await fetch('/api/marketing/ugc',{method:'POST',headers,body:JSON.stringify({id:result.rewardId})});const reward=await response.json();
    if(!response.ok||reward.error){setNotice(t('Submission approved. Retry code creation in the customer UGC ledger.'));setError(reward.error||'Could not create reward code.');}
    else setNotice(t('Submission approved. The reward code is ready in the customer UGC ledger.'));
    onApproved();
   }else setNotice(t('Submission rejected. No reward code was created.'));
   setSelected(null);setVideo('');await load();
  }catch(error){setError(error instanceof Error?error.message:'Could not review submission.');}finally{setBusy('');}
 }
 return <section className="card ugc-submissions"><div className="ugc-submissions-heading"><div><h3>{t('Customer submissions')}</h3><p>{t('Review customer videos before approving a thank-you gift.')}</p></div><button className="button secondary" disabled={loading||!!busy} onClick={()=>void load()}>{t('Refresh')}</button></div>
 <div className="ugc-review-tabs" role="group" aria-label={t('Submission status')}>{['pending','approved','rejected'].map(value=><button key={value} className={`button ${status===value?'primary':'secondary'}`} aria-pressed={status===value} disabled={!!busy} onClick={()=>setStatus(value)}>{t(value==='pending'?'Awaiting approval':value==='approved'?'Approved':'Rejected')}</button>)}</div>
 {error&&<p className="batch-error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
 {loading&&<p role="status">{t('Loading submissions...')}</p>}
 <div className="table-scroll"><table className="ugc-submissions-table"><thead><tr>{['Submitted','Customer','Original order','Video','Status','Review'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{new Date(row.submitted_at).toLocaleString()}<small>UGC-{row.id.slice(0,8).toUpperCase()}</small></td><td><strong>{row.customer_name}</strong><small>{row.phone}</small><small>{row.email}</small></td><td>{row.order_number}</td><td>{row.video_name}</td><td>{t(row.status==='pending'?'Awaiting approval':row.status==='approved'?'Approved':'Rejected')}</td><td><button className="button secondary small" disabled={!!busy} onClick={()=>void open(row)}>{t('View submission')}</button></td></tr>)}</tbody></table></div>
 {!loading&&!rows.length&&<p className="empty">{t('No submissions in this view.')}</p>}{hasMore&&<button className="button secondary" disabled={loading} onClick={()=>void load(rows.length)}>{t('Load more')}</button>}
 {selected&&<div className="document-preview-backdrop" role="dialog" aria-modal="true" aria-label={t('Review customer submission')}><section className="linked-transaction-modal ugc-review-modal"><header><div><p>{t('CUSTOMER SUBMISSION')}</p><h2>{selected.customer_name}</h2><span>{selected.order_number}</span></div><button className="button secondary" disabled={!!busy} onClick={()=>{setSelected(null);setVideo('');}}>{t('Close')}</button></header><div className="linked-transaction-body"><video controls preload="metadata" src={video}/><a href={video} target="_blank" rel="noreferrer">{t('Open or download video')}</a><p>{selected.phone} · {selected.email}</p><h3>{t('Customer notes')}</h3><p className="ugc-review-copy">{selected.notes||t('No notes')}</p><h3>{t('Content permission')}</h3><p>{selected.consent_text}</p>{selected.status==='pending'?<><label>{t('Reward collection')}<select value={collection} disabled={!!busy} onChange={event=>setCollection(event.target.value as UgcCollection)}>{Object.entries(ugcCollections).map(([value,item])=><option key={value} value={value}>{t(item.label)}</option>)}</select></label><p>{t('One single-use code for one item, with free shipping.')}</p><label>{t('Review notes')}<textarea maxLength={5000} disabled={!!busy} value={notes} onChange={event=>setNotes(event.target.value)}/></label></>:<><p>{selected.review_notes}</p><small>{selected.reviewed_by} · {selected.reviewed_at&&new Date(selected.reviewed_at).toLocaleString()}</small></>}</div>{selected.status==='pending'&&<footer className="manual-intake-editor-footer"><button className="button danger" disabled={!!busy} onClick={()=>void review('reject')}>{t('Reject submission')}</button><button className="button primary" disabled={!!busy} onClick={()=>void review('approve')}>{t(busy?'Saving...':'Approve and create reward code')}</button></footer>}</section></div>}
 </section>;
}
