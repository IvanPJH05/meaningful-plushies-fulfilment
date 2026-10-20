import test from "node:test";
import assert from "node:assert/strict";
import {probeNfcHelper,waitForNfcHelper} from "./nfc-helper.ts";
test("helper probe validates identity, response status, and bounds the request",async()=>{
 let options:RequestInit|undefined;
 const running=(async (_url,init)=>{options=init;return Response.json({ok:true,helper:'windows-nfc-writer'});}) as typeof fetch;
 assert.equal(await probeNfcHelper(running),true);assert.ok(options?.signal);
 assert.equal(await probeNfcHelper((async()=>Response.json({ok:true,helper:'other'})) as typeof fetch),false);
 assert.equal(await probeNfcHelper((async()=>{throw Error('offline');}) as typeof fetch),false);
});
test("launch waits for a slow helper and stops polling once ready",async()=>{
 let probes=0,waits=0;
 assert.equal(await waitForNfcHelper(async()=>++probes===9,async()=>{waits++;}),true);
 assert.equal(probes,9);assert.equal(waits,8);
 probes=0;assert.equal(await waitForNfcHelper(async()=>{probes++;return false;},async()=>{}),false);assert.equal(probes,30);
});
