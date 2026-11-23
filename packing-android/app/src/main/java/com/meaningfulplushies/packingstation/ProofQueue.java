package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
final class ProofQueue {
    static File folder(Context context){File dir=new File(context.getFilesDir(),"packing-uploads");if(!dir.exists())dir.mkdirs();return dir;}
    static File[] entries(Context context){
        File[] files=folder(context).listFiles((dir,name)->name.endsWith(".json")||name.endsWith(".json.bak"));
        java.util.TreeMap<String,File> unique=new java.util.TreeMap<>();if(files!=null)for(File f:files){String name=f.getName().replaceFirst("\\.bak$","");unique.put(name,new File(f.getParentFile(),name));}return unique.values().toArray(new File[0]);
    }
    static JSONObject read(File file) throws Exception {try(var input=new AtomicFile(file).openRead();var bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>100000)throw new Exception("Invalid local recording metadata.");bytes.write(buffer,0,n);}return new JSONObject(bytes.toString("UTF-8"));}}
    static void write(File file,JSONObject value) throws Exception {
        AtomicFile atomic=new AtomicFile(file);FileOutputStream output=atomic.startWrite();
        try{output.write(value.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(output);}catch(Exception error){atomic.failWrite(output);throw error;}
    }
    static JSONObject metadata(String id,String orderId,String number,String barcode,String card,PacketRing.Capture clip,File video) throws Exception {
        JSONObject meta=new JSONObject().put("id",id).put("orderId",orderId).put("orderNumber",number).put("orderBarcode",barcode).put("cardCode",card)
            .put("scannedAt",Instant.ofEpochMilli(clip.scanEpochMs).toString()).put("sourceStartedAt",Instant.ofEpochMilli(clip.sourceEpochMs()).toString())
            .put("size",video.length()).put("contentType","video/mp4");
        if(clip.warehouse)meta.put("captureMode","warehouse").put("durationMs",clip.durationMs()).put("trackingNumber",clip.trackingNumber).put("trackingVerifiedAt",Instant.ofEpochMilli(clip.trackingVerifiedAt).toString()).put("packAfterSave",true);
        return meta;
    }
    static void recoverCompleted(Context context){
        File[] pending=folder(context).listFiles((dir,name)->name.endsWith(".pending"));if(pending==null)return;
        for(File file:pending)try{
            JSONObject meta=read(file);String id=meta.getString("id");if(!id.matches("[a-f0-9-]{36}"))continue;
            File video=new File(folder(context),id+".mp4");if(!video.isFile()||video.length()==0||video.length()>RecordingQuality.MAX_FILE_BYTES)continue;
            android.media.MediaMetadataRetriever probe=new android.media.MediaMetadataRetriever();long duration;try{probe.setDataSource(video.getAbsolutePath());duration=Long.parseLong(probe.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));}finally{probe.release();}
            long before=Instant.parse(meta.getString("scannedAt")).toEpochMilli()-Instant.parse(meta.getString("sourceStartedAt")).toEpochMilli();
            if(meta.optString("captureMode").equals("warehouse")?duration<meta.optLong("durationMs")-250:duration<before+20700)continue;
            meta.put("size",video.length());write(new File(folder(context),id+".json"),meta);file.delete();
        }catch(Exception ignored){/* An incomplete file is retained, never uploaded as complete. */}
    }
}
