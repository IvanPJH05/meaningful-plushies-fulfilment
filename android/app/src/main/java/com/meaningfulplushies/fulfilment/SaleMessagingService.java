package com.meaningfulplushies.fulfilment;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import java.util.Map;

public class SaleMessagingService extends MessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        if (!"manual_orders".equals(data.get("workspace"))) return;
        String reference = data.get("reference");
        String title = data.get("title");
        String body = data.get("body");
        String summary = data.get("summary");
        if (body == null) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("manual-orders", "Manual orders", NotificationManager.IMPORTANCE_HIGH));
        String id = data.get("intakeId");
        int notificationId = (id == null ? message.getMessageId() == null ? body : message.getMessageId() : id).hashCode();
        Intent open = new Intent(this, MainActivity.class);
        open.setAction("sale:" + id);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> item : data.entrySet()) open.putExtra(item.getKey(), item.getValue());
        open.putExtra("google.message_id", message.getMessageId() == null ? String.valueOf(notificationId) : message.getMessageId());
        PendingIntent content = PendingIntent.getActivity(this, notificationId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, "manual-orders")
            .setSmallIcon(R.drawable.ic_sale_notification).setContentTitle(title == null ? "New Manual Order" : title)
            .setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body + (summary == null || summary.isEmpty() ? "" : "\n\n" + summary)))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(content).setAutoCancel(true);
        if (summary != null && !summary.isEmpty()) {
            Intent copy = new Intent(this, CopyOrderSummaryActivity.class);
            copy.setAction("copy-sale:" + id); copy.putExtra("summary", summary);
            copy.putExtra("reference", reference); copy.putExtra("language", data.get("language"));
            PendingIntent action = PendingIntent.getActivity(this, notificationId, copy, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(0, "ms".equals(data.get("language")) ? "Salin ringkasan" : "Copy summary", action);
        }
        try { NotificationManagerCompat.from(this).notify(notificationId, builder.build()); }
        catch (SecurityException ignored) { /* Notification permission is controlled by the user. */ }
    }
}
