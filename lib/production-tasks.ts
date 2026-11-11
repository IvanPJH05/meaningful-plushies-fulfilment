import {batchSchedule,type ProductionBatch,type ProductionItem,type ProductionStage} from "./production-tracking.ts";
export const taskInstructions:Partial<Record<ProductionStage,{title:string;instruction:string;done:string}>>={
 received:{title:"Print this plushie's shipping label",instruction:"Print the label and packing slip. Keep them with this plushie throughout production.",done:"Label printed"},
 labels_printed:{title:"Download the batch audio ZIP",instruction:"Download the MP3 ZIP for this batch, then upload each recording to its matching speaker. Downloading starts the Sewing stage for every included order.",done:"Download ZIP · start Sewing"},
 audio_ready:{title:"Attach the speaker and stuff the plushie",instruction:"Use this order's prepared speaker. Secure it inside the correct plushie, then add the stuffing.",done:"Speaker attached · stuffing complete"},
 stuffed:{title:"Hand this plushie to the tailor",instruction:"Keep the order label attached. Confirm only after the plushie has actually been handed over for sewing.",done:"Handed to tailor"},
 at_tailor:{title:"Scan the returned plushie and check its audio",instruction:"Scan its order barcode to play the saved reference. Play the plushie’s speaker and check the audio is correct. Pass moves it to Sewing Done.",done:"QC passed · Sewing Done"},
 returned:{title:"Check the finished plushie's audio",instruction:"Scan the order barcode. Listen to the saved reference, then play the plushie's speaker. Confirm the voice is correct and clear.",done:"Audio is correct"},
 audio_passed:{title:"Pack this plushie into its box",instruction:"Scan the order barcode, then its certificate card. Check the plushie and card belong together. Close the box before confirming.",done:"Box packed · link certificate"},

};
export function taskDue(batch:Pick<ProductionBatch,"production_date"|"pickup_date">,stage:string){const plan=batchSchedule(batch.production_date);return stage==="packed"?batch.pickup_date:["at_tailor","returned","audio_passed"].includes(stage)?plan.packingDate:batch.production_date;}
export function taskReady(batch:Pick<ProductionBatch,"production_date"|"pickup_date">,stage:string,day:string,hour=new Date(Date.now()+8*3600000).getUTCHours()){
 const due=taskDue(batch,stage);return due<day||(due===day&&(stage!=="audio_passed"||hour>=18));
}
export function actionableTasks(items:ProductionItem[],batch:ProductionBatch,day:string){const active=items.filter(i=>(!i.disposition||i.disposition==="active")&&taskInstructions[i.stage]);const earliest=active.reduce((n,i)=>Math.min(n,["received","labels_printed","audio_ready","stuffed","at_tailor","returned","audio_passed"].indexOf(i.stage)),99);return active.filter(i=>!i.issue&&["received","labels_printed","audio_ready","stuffed","at_tailor","returned","audio_passed"].indexOf(i.stage)===earliest&&taskReady(batch,i.stage,day)).sort((a,b)=>{
 const order=["received","labels_printed","audio_ready","stuffed","at_tailor","returned","audio_passed","packed"];return order.indexOf(a.stage)-order.indexOf(b.stage)||a.order_id.localeCompare(b.order_id,undefined,{numeric:true});});}
export function taskAction(item:ProductionItem){return ({received:"labels_printed",labels_printed:"at_tailor",audio_ready:"at_tailor",stuffed:"at_tailor",at_tailor:"audio_passed",returned:"audio_passed",audio_passed:"packed"} as Partial<Record<ProductionStage,ProductionStage>>)[item.stage];}
