import { execFile } from "node:child_process";
import { mkdtemp,writeFile,readFile,rm,stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { packingSourceLimit } from "./packing-proof.ts";
const exec=promisify(execFile);
const outputLimit=12*1024*1024;

export async function trimPackingVideo(bytes: Buffer,offsetMs: number): Promise<Buffer> {
  if(!ffmpeg || !bytes.length || bytes.length>packingSourceLimit || !Number.isFinite(offsetMs) || offsetMs<0 || offsetMs>21_000) throw new Error("Invalid packing recording.");
  const dir=await mkdtemp(join(tmpdir(),"packing-proof-"));
  try {
    const source=join(dir,"source"),output=join(dir,"proof.mp4");
    await writeFile(source,bytes);
    const {stdout}=await exec(ffmpeg,["-hide_banner","-loglevel","error","-nostdin","-y",
      "-protocol_whitelist","file,pipe","-format_whitelist","mov,matroska,webm","-threads","1","-i",source,
      "-ss",String(offsetMs/1000),"-t","23","-map","0:v:0","-an","-sn","-dn","-map_metadata","-1",
      "-vf","scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
      "-c:v","libx264","-preset","veryfast","-crf","25","-maxrate","2500k","-bufsize","5000k","-pix_fmt","yuv420p","-threads","1",
      "-movflags","+faststart","-fs",String(outputLimit+1),"-progress","pipe:1",output],{timeout:45_000,maxBuffer:128*1024,windowsHide:true}).catch(()=>{throw new Error("This camera recording could not be prepared. Keep the webcam connected and scan again.");});
    const times=[...stdout.matchAll(/out_time_us=(\d+)/g)].map(m=>Number(m[1]));
    if(!times.length || Math.max(...times)<22_700_000) throw new Error("The camera stopped before all 23 seconds were captured. Scan again with the webcam running.");
    const size=(await stat(output)).size;
    if(!size || size>outputLimit) throw new Error("The packing video could not be saved completely.");
    const inspected=await exec(ffmpeg,["-hide_banner","-nostdin","-protocol_whitelist","file,pipe","-i",output,"-t","0","-f","null","-"],{timeout:5000,maxBuffer:64*1024,windowsHide:true});
    const duration=inspected.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if(!duration || Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3])<22.95) throw new Error("The camera stopped before all 23 seconds were captured. Please scan again.");
    return await readFile(output);
  } finally {await rm(dir,{recursive:true,force:true});}
}
