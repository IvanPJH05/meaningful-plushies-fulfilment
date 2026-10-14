import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { batchEnvelopePdf } from "./batch-envelope-pdf.ts";
test("large batches use even chunks, preserve name order and merge every envelope page", async () => {
  const names=Array.from({length:41},(_,i)=>String(i+1)),chunks:string[][]=[];
  const output=await batchEnvelopePdf(names,async selected=>{chunks.push(selected);const pdf=await PDFDocument.create();for(let i=0;i<selected.length;i+=2)pdf.addPage([Number(selected[i])+100,100]);return new Blob([Uint8Array.from(await pdf.save()).buffer]);});
  assert.deepEqual(chunks.map(chunk=>chunk.length),[20,20,1]);assert.deepEqual(chunks.flat(),names);
  const pdf=await PDFDocument.load(await output.arrayBuffer());assert.equal(pdf.getPageCount(),21);assert.equal(pdf.getPages()[10].getWidth(),121);assert.equal(pdf.getPages()[20].getWidth(),141);
});
test("an incomplete generated document cannot complete the envelope stage", async () => {
  await assert.rejects(batchEnvelopePdf(["FIRST","SECOND","THIRD"],async()=>{const pdf=await PDFDocument.create();pdf.addPage();return new Blob([Uint8Array.from(await pdf.save()).buffer]);}),/every selected name/);
});
