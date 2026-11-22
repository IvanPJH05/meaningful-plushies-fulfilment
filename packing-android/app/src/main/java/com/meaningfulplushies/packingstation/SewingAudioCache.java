package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.media.MediaPlayer;
import android.net.Uri;
import org.json.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
final class SewingAudioCache implements AutoCloseable {
 interface Listener{void progress(int ready,int total,int failed,boolean preparing);}
 private final Context context;private final ConcurrentMap<String,JSONObject> items=new ConcurrentHashMap<>();private final ExecutorService loader=Executors.newSingleThreadExecutor(),workers=Executors.newFixedThreadPool(2);private volatile boolean closed,loading;
 SewingAudioCache(Context context){this.context=context;}
 private File file(JSONObject item)throws Exception{String key=item.getString("order_id")+":"+item.getJSONObject("order").optString("updatedAt");byte[] hash=MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));StringBuilder name=new StringBuilder();for(byte b:hash)name.append(String.format("%02x",b));File dir=new File(context.getCacheDir(),"sewing-audio");dir.mkdirs();return new File(dir,name+".audio");}
 void remember(JSONObject item){items.put(item.optString("order_id"),item);}
 boolean current(JSONObject item){JSONObject before=items.get(item.optString("order_id"));return before!=null&&before.optJSONObject("order").optString("updatedAt").equals(item.optJSONObject("order").optString("updatedAt"));}
 JSONObject match(String barcode){JSONObject found=null;for(JSONObject item:items.values()){JSONObject o=item.optJSONObject("order");String id=item.optString("order_id").toUpperCase(Locale.ROOT),number=o.optString("orderNumber").replaceFirst("^#","").toUpperCase(Locale.ROOT),scan=barcode.replaceFirst("^MP-?","").replaceFirst("^#","");
  boolean matches=barcode.startsWith("MPI-")?barcode.substring(4).equals(id):scan.equals(id)||scan.equals(number)||(scan.matches("TT[0-9]+")&&number.startsWith(scan+" "));
  if(id.matches("[0-9]+-[0-9]+")&&!barcode.contains(id))matches=false;if(matches){if(found!=null)return null;found=item;}}return found;}
 void configure(MediaPlayer player,String id)throws Exception{JSONObject item=items.get(id);File saved=item==null?null:file(item);if(saved!=null&&saved.isFile()&&saved.length()>0)player.setDataSource(saved.getPath());else player.setDataSource(context,Uri.parse(PackingApi.BASE+"/api/mobile/orders/"+PackingApi.encode(id)+"/assets?kind=voice"),Collections.singletonMap("Authorization","Bearer "+SessionStore.token(context)));}
 synchronized void refresh(Listener listener){if(loading||closed)return;loading=true;loader.execute(()->{
  int total=0;AtomicInteger ready=new AtomicInteger(),failed=new AtomicInteger();
  try{PackingApi api=new PackingApi(SessionStore.token(context));Map<String,JSONObject> all=new LinkedHashMap<>();String cursor="";Set<String> seen=new HashSet<>();
   do{JSONObject page=api.request(PackingApi.WAREHOUSE+(cursor.isEmpty()?"":"?after="+PackingApi.encode(cursor)),null);JSONArray rows=page.getJSONArray("items");for(int i=0;i<rows.length();i++){JSONObject item=rows.getJSONObject(i);all.put(item.getString("order_id"),item);}cursor=page.isNull("nextCursor")?"":page.optString("nextCursor");if(!cursor.isEmpty()&&!seen.add(cursor))throw new Exception("Audio order list could not finish.");}while(!closed&&!cursor.isEmpty());
   if(closed)return;items.clear();items.putAll(all);total=all.size();final int count=total;listener.progress(0,count,0,true);List<Future<?>> jobs=new ArrayList<>();
   for(JSONObject item:all.values())jobs.add(workers.submit(()->{if(closed)return;try{File target=file(item);if(!target.isFile()){if(new android.os.StatFs(context.getFilesDir().getPath()).getAvailableBytes()<150*1024*1024L)throw new Exception("Tablet storage is low.");String batch=item.optString("batchId");boolean downloaded=false;if(!batch.isEmpty())try{api.downloadAudio("/api/production-tracking/audio?id="+PackingApi.encode(batch)+"&orderId="+PackingApi.encode(item.getString("order_id")),target);downloaded=true;}catch(Exception ignored){}if(!downloaded)api.downloadAudio("/api/mobile/orders/"+PackingApi.encode(item.getString("order_id"))+"/assets?kind=voice",target);}ready.incrementAndGet();}catch(Exception e){failed.incrementAndGet();}if(!closed)listener.progress(ready.get(),count,failed.get(),true);}));
   for(Future<?> job:jobs)job.get();
  }catch(Exception e){failed.incrementAndGet();}finally{loading=false;if(!closed)listener.progress(ready.get(),total,failed.get(),false);}
 });}
 public void close(){closed=true;loader.shutdownNow();workers.shutdownNow();}
}
