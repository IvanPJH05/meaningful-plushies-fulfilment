export const productionStages=["received","labels_printed","audio_ready","stuffed","at_tailor","returned","audio_passed","packed","collected","delivered"] as const;
export type ProductionStage=typeof productionStages[number];
export const stageLabels:Record<ProductionStage,string>={received:"Batch closed",labels_printed:"Labels printed",audio_ready:"Audio uploaded",stuffed:"Speaker attached & stuffed",at_tailor:"Sewing",returned:"Returned from tailor",audio_passed:"Sewing Done",packed:"Completed · awaiting J&T pickup",collected:"Collected by courier",delivered:"Delivered"};
export const customerLabels:Record<ProductionStage,string>={received:"Order confirmed for production",labels_printed:"Preparing your plushie",audio_ready:"Your voice message is ready",stuffed:"Your plushie is taking shape",at_tailor:"Your plushie is being sewn",returned:"Back from our tailor",audio_passed:"Quality check passed",packed:"Packed and ready for collection",collected:"With the courier",delivered:"Delivered"};
export function batchSchedule(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)!==day)throw new Error("Choose a valid production date.");
 const plus=(n:number)=>new Date(Date.parse(`${day}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
 return{cutoff:`${day}T22:00:00+08:00`,tailorDate:plus(1),packingDate:plus(1),pickupDate:plus(2),arrivalDate:plus(3)};
}
export function malaysiaToday(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
export function nextProductionStage(stage:string){const i=productionStages.indexOf(stage as ProductionStage);return i>=0?productionStages[i+1]:undefined;}
export function matchesProductionBarcode(order:{id?:unknown;orderNumber?:unknown},barcode:string){
 if (/^MPI-/i.test(barcode.trim())) return barcode.trim().slice(4).toUpperCase() === String(order.id||"").toUpperCase();
 if (/^\d+-\d+$/.test(String(order.id||"")) && !barcode.trim().toUpperCase().includes(String(order.id).toUpperCase())) return false;
 const scan=barcode.trim().replace(/^MP-?/i,"").replace(/^#/,"").toUpperCase();
 const number=String(order.orderNumber||"").replace(/^#/,"").toUpperCase();
 return Boolean(scan)&&(scan===String(order.id||"").toUpperCase()||scan===number||(/^TT\d+$/.test(scan)&&number.startsWith(scan+" ")));
}
export type ProductionBatch={id:string;batch_number?:number;production_date:string;cutoff_at:string;pickup_date:string;created_at:string};
export type ProductionItem={id:string;batch_id:string;order_id:string;stage:ProductionStage;issue:string;tracking_token:string;version:number;disposition?:"active"|"deferred"|"removed";deferred_until?:string|null;carried_issue?:string;certificate_code:string|null;nfc_paired?:boolean;playback_only?:boolean;order?:Record<string,unknown>};

export function productionBatchLabel(number?: number) {
  return number ? "Batch #" + String(number).padStart(4, "0") : "Batch";
}

export function productionBatchCreatedAt(timestamp: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(timestamp));
}
