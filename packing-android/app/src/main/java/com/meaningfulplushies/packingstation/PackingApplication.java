package com.meaningfulplushies.packingstation;
import android.app.Application;
import com.serenegiant.utils.UVCUtils;
public final class PackingApplication extends Application {
    @Override public void onCreate() { super.onCreate(); UVCUtils.init(this); UploadWorker.scheduleRecovery(this); }
}
