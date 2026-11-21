package com.meaningfulplushies.packingstation;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.JSONObject;
import java.io.File;
import java.util.HashSet;
import java.util.concurrent.TimeUnit;
public final class UploadWorker extends Worker {
    private static final Object LOCK=new Object();
    public UploadWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    static void enqueue(Context context){
        WorkManager.getInstance(context).enqueueUniqueWork("packing-video-uploads",ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(UploadWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).build());
    }
    static void scheduleRecovery(Context context){WorkManager.getInstance(context).enqueueUniquePeriodicWork("packing-video-recovery",ExistingPeriodicWorkPolicy.KEEP,new PeriodicWorkRequest.Builder(UploadWorker.class,15,TimeUnit.MINUTES).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());}
    @NonNull @Override public Result doWork(){
        synchronized(LOCK){
            Context context=getApplicationContext();ProofQueue.recoverCompleted(context);String token=SessionStore.token(context);if(token.isEmpty())return Result.retry();
            PackingApi api=new PackingApi(token);boolean failed=false;HashSet<String> attempted=new HashSet<>();
            // Re-read between files so a clip completed during upload joins this run.
            for(;;){File selected=null;for(File f:ProofQueue.entries(context))if(!attempted.contains(f.getName())){selected=f;break;}if(selected==null || isStopped())break;attempted.add(selected.getName());
                try{
                    JSONObject meta=ProofQueue.read(selected);File video=new File(ProofQueue.folder(context),meta.getString("id")+".mp4");
                    JSONObject prepare=new JSONObject(meta.toString()).put("action","prepare");JSONObject ready=api.request(PackingApi.PROOFS,prepare);
                    if(!ready.optBoolean("ready")){
                        if(!video.isFile() || video.length()!=meta.getLong("size"))throw new Exception("Local video is incomplete. Keep this file and contact the administrator.");
                        if(!ready.optBoolean("uploaded"))PackingApi.upload(ready.getString("signedUrl"),video);
                        ready=api.request(PackingApi.PROOFS,new JSONObject().put("action","complete").put("id",meta.getString("id")));
                    }
                    if(!ready.optBoolean("ready")){failed=true;continue;}
                    if(meta.optBoolean("packAfterSave")&&!ready.optBoolean("packed"))throw new Exception("Video saving and Packed status were not both confirmed. Retrying safely.");
                    // Only a verified cloud 'ready' response releases the local source.
                    if(!selected.delete())throw new Exception("Video is saved online; local queue cleanup will retry.");
                    if(video.exists())video.delete();
                    android.content.SharedPreferences.Editor saved=context.getSharedPreferences("station",Context.MODE_PRIVATE).edit().putString("lastSaved",meta.optBoolean("packAfterSave")?"Video saved online and #"+meta.optString("orderNumber")+" marked Packed.":"Video saved to #"+meta.optString("orderNumber"));
                    if(meta.optBoolean("packAfterSave"))saved.putString("lastPackedProofId",meta.getString("id"));saved.apply();
                }catch(Exception error){failed=true;try{JSONObject meta=ProofQueue.read(selected);meta.put("lastError",error instanceof PackingApi.ApiError && ((PackingApi.ApiError)error).status==401?"Sign in again to resume uploads.":String.valueOf(error.getMessage()));ProofQueue.write(selected,meta);}catch(Exception ignored){} }
            }
            return failed?Result.retry():Result.success();
        }
    }
}
