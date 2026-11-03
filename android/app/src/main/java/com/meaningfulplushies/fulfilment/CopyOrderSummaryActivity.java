package com.meaningfulplushies.fulfilment;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Bundle;
import android.widget.Toast;

/** A notification action opens a focused activity so clipboard access works on modern Android. */
public class CopyOrderSummaryActivity extends Activity {
    private boolean copied;
    @Override protected void onCreate(Bundle savedInstanceState) { super.onCreate(savedInstanceState); }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus || copied) return;
        copied = true;
        String summary = getIntent().getStringExtra("summary");
        if (summary != null && !summary.isEmpty()) {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("Order summary", summary));
            if (android.os.Build.VERSION.SDK_INT < 33) Toast.makeText(this, "ms".equals(getIntent().getStringExtra("language")) ? "Ringkasan disalin" : "Order summary copied", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
