package com.meaningfulplushies.fulfilment;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "InAppUpdate")
public class InAppUpdatePlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        String fileName = call.getString("fileName", "Meaningful Fulfilment update.apk");
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("The update download link is missing.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File updateDirectory = new File(getContext().getCacheDir(), "updates");
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) throw new Exception("The update folder could not be created.");
                String safeName = fileName.replaceAll("[^a-zA-Z0-9 ._-]", "_");
                if (!safeName.toLowerCase().endsWith(".apk")) safeName += ".apk";
                File apk = new File(updateDirectory, safeName);

                connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Meaningful-Fulfilment-Android");
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(120000);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new Exception("The update server returned " + status + ".");
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                }
                getActivity().runOnUiThread(() -> openInstaller(call, apk));
            } catch (Exception error) {
                call.reject("The update could not be downloaded. Please check your connection and try again.", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

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

        openInstaller(call, apk);
    }

    private void openInstaller(PluginCall call, File apk) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                call.reject("Allow Meaningful Fulfilment to install updates, then return here and tap Download and install again.");
                return;
            }
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
