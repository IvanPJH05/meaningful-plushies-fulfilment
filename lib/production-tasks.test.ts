import test from "node:test";
import assert from "node:assert/strict";
import {actionableTasks,taskReady,taskAction} from "./production-tasks.ts";
import type {ProductionBatch,ProductionItem,ProductionStage} from "./production-tracking.ts";
const batch={id:"b",production_date:"2026-10-26",pickup_date:"2026-10-28"} as ProductionBatch;
const item=(id:string,stage:ProductionStage,issue="")=>({id,order_id:id,batch_id:"b",stage,issue,version:1} as ProductionItem);
test("guided queue finishes labels across the batch before speaker preparation",()=>{
 const queue=actionableTasks([item("20","labels_printed"),item("10","received"),item("2","received"),item("5","received","bad label")],batch,"2026-10-26");
 assert.deepEqual(queue.map(i=>i.id),["2","10"]);
 assert.equal(taskAction(queue[0]),"labels_printed");
 const updated=queue.map(i=>i.id==="2"?{...i,stage:"labels_printed" as const}:i);
 assert.equal(actionableTasks(updated,batch,"2026-10-26")[0].id,"10");
});
test("actual work can continue on the same day, before planned dates and times",()=>{
 for(const stage of ["received","labels_printed","at_tailor","returned","audio_passed"]){
  assert.equal(taskReady(batch,stage,"2026-10-26",9),true);
 }
 assert.equal(taskReady(batch,"packed","2026-10-28",9),false);
 assert.equal(actionableTasks([item("1","at_tailor")],batch,"2026-10-26")[0].id,"1");
 assert.equal(actionableTasks([item("1","audio_passed")],batch,"2026-10-26")[0].id,"1");
});
test("completed or courier-managed work does not become a new production task",()=>{
 assert.deepEqual(actionableTasks([item("1","collected"),item("2","delivered"),item("3","returned","wrong audio")],batch,"2026-10-29"),[]);
});

test("earlier issues block advancement until removed or deferred",()=>{const blocked=item("1","received","missing label"),later=item("2","labels_printed");assert.deepEqual(actionableTasks([blocked,later],batch,"2026-10-29"),[]);for(const disposition of ["removed","deferred"] as const)assert.deepEqual(actionableTasks([{...blocked,disposition},later],batch,"2026-10-29").map(i=>i.id),["2"]);assert.equal(taskAction(later),"at_tailor");assert.equal(taskAction(item("3","at_tailor")),"audio_passed");assert.equal(taskAction(item("4","packed")),undefined);});
