package com.meaningfulplushies.fulfilment;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InAppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
