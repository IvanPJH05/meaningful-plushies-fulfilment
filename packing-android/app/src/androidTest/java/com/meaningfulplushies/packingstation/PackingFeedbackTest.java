package com.meaningfulplushies.packingstation;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class PackingFeedbackTest {
    @Test public void nativeFeedbackCanStopAndCloseWhileSpeechEngineInitialises() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        AtomicReference<PackingFeedback> feedback=new AtomicReference<>();
        instrumentation.runOnMainSync(()->{
            PackingFeedback value=new PackingFeedback(context,new PackingFeedback.Listener(){public void busy(boolean busy){}public void notice(String message){}});feedback.set(value);
            value.result(false,"Scan a matching card.","");value.stop();assertFalse(value.isBusy());value.close();
        });
        Thread.sleep(700);instrumentation.waitForIdleSync();instrumentation.runOnMainSync(()->assertFalse(feedback.get().isBusy()));
    }
}
