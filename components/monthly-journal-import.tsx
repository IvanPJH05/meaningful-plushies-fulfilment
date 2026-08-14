"use client";
import { ChangeEvent, useState } from "react";
import { supabase } from "../lib/supabase";

const fingerprint=(row:{bank:string;paidDate:string;description:string;moneyIn:number;moneyOut:number})=>`${row.bank}|${row.paidDate}|${row.description.toLowerCase().replace(/\s+/g," ")}|${row.moneyIn}|${row.moneyOut}`;

export function MonthlyJournalImport(){
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function upload(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file||!supabase)return;setBusy(true);const form=new FormData();form.append("file",file);const response=await fetch("/api/monthly-journal/parse-statement",{method:"POST",body:form});const result=await response.json();if(!response.ok){setMessage(result.error||"Could not read this statement.");setBusy(false);return}let added=0,skipped=0;for(const row of result.rows){const {error}=await supabase.from("monthly_journal_bank_rows").insert({fingerprint:fingerprint({bank:result.bank,paidDate:row.paidDate,description:row.description,moneyIn:row.moneyIn,moneyOut:row.moneyOut}),bank:result.bank,paid_date:row.paidDate,accounting_date:row.paidDate,description:row.description,money_in:row.moneyIn,money_out:row.moneyOut,balance:row.balance});if(error?.code==="23505")skipped++;else if(!error)added++}setMessage(`${added} transactions imported; ${skipped} duplicate transactions skipped.`);setBusy(false)}
  return <section><p>Upload a Maybank or Public Bank statement. New transactions appear in Bank Statement Inbox for review before they are posted.</p><label className="mj-import">Import PDF statement<input type="file" accept="application/pdf" onChange={upload}/></label>{busy&&<p>Reading statement…</p>}{message&&<p className="notice">{message}</p>}</section>;
}
