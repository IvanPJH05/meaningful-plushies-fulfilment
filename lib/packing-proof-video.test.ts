import test from "node:test";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import ffmpeg from "ffmpeg-static";
import {trimPackingVideo} from "./packing-proof-video.ts";
const exec=promisify(execFile);
test("a continuous camera buffer becomes a seekable 23-second MP4; partial clips fail",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"packing-video-test-"));
  try {
    const source=join(dir,"source.webm");
    await exec(ffmpeg!,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=24","-t","28","-c:v","libvpx","-deadline","realtime","-b:v","200k",source],{timeout:30000,windowsHide:true});
    const bytes=await readFile(source),output=await trimPackingVideo(bytes,5000);
    const saved=join(dir,"proof.mp4");await writeFile(saved,output);
    const result=await exec(ffmpeg!,["-hide_banner","-i",saved,"-f","null","-"],{timeout:15000,windowsHide:true});
    assert.match(result.stderr,/Duration: 00:00:23\.00/);
    assert.match(result.stderr,/Video: h264/);
    assert.ok(output.includes(Buffer.from("moov")) && output.indexOf(Buffer.from("moov"))<output.indexOf(Buffer.from("mdat")),"fast-start playback metadata precedes the video");
    await assert.rejects(trimPackingVideo(bytes,20000),/complete|23 seconds|stopped/);
    const warehouse=await trimPackingVideo(bytes,0,27000),warehousePath=join(dir,"warehouse.mp4");await writeFile(warehousePath,warehouse);
    const warehouseResult=await exec(ffmpeg!,["-hide_banner","-i",warehousePath,"-f","null","-"],{timeout:15000,windowsHide:true});
    assert.match(warehouseResult.stderr,/Duration: 00:00:27\.00/);
    await assert.rejects(trimPackingVideo(bytes,0,42000),/complete|stopped/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("packing MP4s preserve audible microphone sound and longer audio cannot hide truncated footage",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"packing-sound-test-"));
 try{
  const source=join(dir,"sound.webm");
  await exec(ffmpeg!,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=24","-f","lavfi","-i","sine=frequency=660:sample_rate=48000","-t","6","-c:v","libvpx","-deadline","realtime","-b:v","200k","-c:a","libopus",source],{timeout:30000,windowsHide:true});
  const output=await trimPackingVideo(await readFile(source),0,5000),saved=join(dir,"sound.mp4");await writeFile(saved,output);
  const decoded=await exec(ffmpeg!,["-hide_banner","-i",saved,"-map","0:a:0","-ac","1","-ar","8000","-f","s16le","pipe:1"],{encoding:"buffer",timeout:15000,maxBuffer:1024*1024,windowsHide:true});
  assert.match(decoded.stderr.toString(),/Audio: aac/);assert.ok(decoded.stdout.length>70000,"the saved audio covers the recording");
  let energy=0;for(let i=0;i<decoded.stdout.length;i+=2)energy+=decoded.stdout.readInt16LE(i)**2;
  assert.ok(Math.sqrt(energy/(decoded.stdout.length/2))>100,"microphone samples survive conversion, not just an empty audio track");
  const interrupted=join(dir,"interrupted.webm");
  await exec(ffmpeg!,["-hide_banner","-loglevel","error","-y","-i",source,"-f","lavfi","-i","sine=frequency=660:sample_rate=48000","-map","0:v:0","-map","1:a:0","-t","12","-c:v","copy","-c:a","libopus",interrupted],{timeout:15000,windowsHide:true});
  await assert.rejects(trimPackingVideo(await readFile(interrupted),0,10000),/complete|stopped/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("native 2K MP4 proof retains original pixels and microphone sound without another encode",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"packing-2k-test-"));
 try{
  const source=join(dir,"native.mp4"),saved=join(dir,"proof.mp4");
  await exec(ffmpeg!,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=2560x1440:rate=24","-f","lavfi","-i","sine=frequency=660:sample_rate=44100","-t","3","-c:v","libx264","-profile:v","baseline","-pix_fmt","yuv420p","-preset","ultrafast","-b:v","8000k","-c:a","aac","-b:a","96k",source],{timeout:30000,windowsHide:true});
  const bytes=await readFile(source);await writeFile(saved,await trimPackingVideo(bytes,0,3000));
  const inspect=await exec(ffmpeg!,["-hide_banner","-i",saved,"-f","null","-"],{timeout:15000,windowsHide:true});
  assert.match(inspect.stderr,/2560x1440/);assert.match(inspect.stderr,/Audio: aac/);assert.match(inspect.stderr,/Duration: 00:00:03/);
  const hash=async(file:string)=>(await exec(ffmpeg!,["-hide_banner","-loglevel","error","-i",file,"-map","0:v:0","-an","-f","hash","-hash","sha256","-"],{timeout:15000,windowsHide:true})).stdout;
  assert.equal(await hash(saved),await hash(source),"saved proof must have exactly the source's decoded video pixels");
  await assert.rejects(trimPackingVideo(bytes,0,10000),/complete|stopped/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
