import { execFile } from "node:child_process";
import { mkdtemp,writeFile,readFile,rm,stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { packingSourceLimit } from "./packing-proof.ts";
import { warehouseMaxDurationMs } from "./warehouse-packing.ts";
const exec=promisify(execFile);
const outputLimit=12*1024*1024;

export async function trimPackingVideo(bytes: Buffer,offsetMs: number,warehouseDurationMs?: number): Promise<Buffer> {
  if(!ffmpeg || !bytes.length || bytes.length>packingSourceLimit || !Number.isFinite(offsetMs) || offsetMs<0 || offsetMs>21_000) throw new Error("Invalid packing recording.");
  if (warehouseDurationMs!==undefined && (!Number.isInteger(warehouseDurationMs)||warehouseDurationMs<1000||warehouseDurationMs>warehouseMaxDurationMs||offsetMs!==0)) throw new Error("Invalid warehouse recording duration.");
  const durationMs=warehouseDurationMs??23000,limit=warehouseDurationMs===undefined?outputLimit:24*1024*1024;
  const dir=await mkdtemp(join(tmpdir(),"packing-proof-"));
  try {
    const source=join(dir,"source"),output=join(dir,"proof.mp4");
    await writeFile(source,bytes);
    const {stdout}=await exec(ffmpeg,["-hide_banner","-loglevel","error","-nostdin","-y",
      "-protocol_whitelist","file,pipe","-format_whitelist","mov,matroska,webm","-threads","1","-i",source,
      "-ss",String(offsetMs/1000),"-t",String(durationMs/1000),"-map","0:v:0","-map","0:a:0?","-sn","-dn","-map_metadata","-1",
      "-vf","scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
      "-c:v","libx264","-preset",warehouseDurationMs===undefined?"veryfast":"ultrafast","-crf","25","-maxrate",warehouseDurationMs===undefined?"2500k":"900k","-bufsize","2500k","-pix_fmt","yuv420p","-threads","1",
      "-c:a","aac","-b:a","96k","-ac","1",
      "-movflags","+faststart","-fs",String(limit+1),"-progress","pipe:1",output],{timeout:45_000,maxBuffer:128*1024,windowsHide:true}).catch(()=>{throw new Error("This camera recording could not be prepared. Keep the webcam connected and scan again.");});
    const times=[...stdout.matchAll(/out_time_us=(\d+)/g)].map(m=>Number(m[1]));
    if(!times.length || Math.max(...times)<durationMs*1000-300000) throw new Error("The camera stopped before the complete packing video was captured. Scan again with the webcam running.");
    const size=(await stat(output)).size;
    if(!size || size>limit) throw new Error("The packing video could not be saved completely.");
    // Inspect video frames independently: a longer audio track must not hide missing footage.
    const inspected=await exec(ffmpeg,["-hide_banner","-nostdin","-protocol_whitelist","file,pipe","-i",output,"-map","0:v:0","-an","-f","null","-","-progress","pipe:1"],{timeout:15000,maxBuffer:128*1024,windowsHide:true});
    const videoTimes=[...inspected.stdout.matchAll(/out_time_us=(\d+)/g)].map(m=>Number(m[1]));
    if(!videoTimes.length||Math.max(...videoTimes)<durationMs*1000-300000)throw new Error("The camera stopped before the complete packing video was captured. Please scan again.");
    const duration=inspected.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if(!duration || Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3])<(durationMs-(warehouseDurationMs===undefined?50:250))/1000) throw new Error("The camera stopped before the complete packing video was captured. Please scan again.");
    return await readFile(output);
  } finally {await rm(dir,{recursive:true,force:true});}
}
