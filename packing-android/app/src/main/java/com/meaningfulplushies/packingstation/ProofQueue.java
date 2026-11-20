package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
final class ProofQueue {
    static File folder(Context context){File dir=new File(context.getFilesDir(),"packing-uploads");if(!dir.exists())dir.mkdirs();return dir;}
    static File[] entries(Context context){File[] files=folder(context).listFiles((dir,name)->name.endsWith(".json"));return files==null?new File[0]:files;}
    static JSONObject read(File file) throws Exception {return new JSONObject(new String(Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8));}
    static void write(File file,JSONObject value) throws Exception {
        AtomicFile atomic=new AtomicFile(file);FileOutputStream output=atomic.startWrite();
        try{output.write(value.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(output);}catch(Exception error){atomic.failWrite(output);throw error;}
    }
    static JSONObject metadata(String id,String orderId,String number,String barcode,String card,PacketRing.Capture clip,File video) throws Exception {
        return new JSONObject().put("id",id).put("orderId",orderId).put("orderNumber",number).put("orderBarcode",barcode).put("cardCode",card)
            .put("scannedAt",Instant.ofEpochMilli(clip.scanEpochMs).toString()).put("sourceStartedAt",Instant.ofEpochMilli(clip.sourceEpochMs()).toString())
            .put("size",video.length()).put("contentType","video/mp4");
    }
}
