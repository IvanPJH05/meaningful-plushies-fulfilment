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
  }finally{await rm(dir,{recursive:true,force:true});}
});
