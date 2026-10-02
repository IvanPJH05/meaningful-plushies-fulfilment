package com.meaningfulplushies.fulfilment;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "InAppUpdate")
public class InAppUpdatePlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("The downloaded update could not be found.");
            return;
        }

        Uri suppliedUri = Uri.parse(path);
        File apk = "file".equals(suppliedUri.getScheme()) ? new File(suppliedUri.getPath()) : new File(path);
        if (!apk.exists()) {
            call.reject("The downloaded update could not be found.");
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent installer = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(installer);
            call.resolve();
        } catch (Exception error) {
            call.reject("Android could not open the update installer.", error);
        }
    }
}
