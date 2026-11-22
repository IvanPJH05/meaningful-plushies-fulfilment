export type AudioManifestPage<T> = { items:T[]; nextCursor:string|null };

/** Follow every server page; the API's page size is not a limit on the queue. */
export async function sewingAudioManifest<T>(page:(cursor:string)=>Promise<AudioManifestPage<T>>,active:()=>boolean) {
 const items:T[]=[],seen=new Set<string>();let cursor="";
 while(active()) {
  const result=await page(cursor);if(!active())break;items.push(...result.items);
  if(!result.nextCursor)return items;
  if(seen.has(result.nextCursor))throw Error("The audio order list could not be completed. Refresh order audio.");
  seen.add(result.nextCursor);cursor=result.nextCursor;
 }
 return items;
}

/** Two downloads at a time keep scanning responsive, without dropping older orders. */
export async function preloadSewingAudio<T>(items:T[],prepare:(item:T)=>Promise<unknown>,active:()=>boolean,progress:(failed:number)=>void) {
 let cursor=0,failed=0;
 const worker=async()=>{while(active()&&cursor<items.length){const item=items[cursor++];try{await prepare(item);}catch{failed++;}if(active())progress(failed);}};
 await Promise.all([worker(),worker()]);
}
