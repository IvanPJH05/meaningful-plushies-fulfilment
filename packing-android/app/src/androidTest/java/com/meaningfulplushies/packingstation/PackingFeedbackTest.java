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
    @Test public void correctToneMixesAndErrorResumesTheActualMediaPlayerPosition() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        android.app.Activity activity=instrumentation.startActivitySync(new android.content.Intent(context,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));instrumentation.waitForIdleSync();
        java.io.File audio=new java.io.File(context.getCacheDir(),"packing-audio-test.wav");
        int samples=16000*8;java.nio.ByteBuffer wav=java.nio.ByteBuffer.allocate(44+samples*2).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        wav.put("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(36+samples*2).put("WAVEfmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1).putInt(16000).putInt(32000).putShort((short)2).putShort((short)16).put("data".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(samples*2);
        while(wav.hasRemaining())wav.putShort((short)0);java.nio.file.Files.write(audio.toPath(),wav.array());
        AtomicReference<PackingFeedback> feedback=new AtomicReference<>();java.util.concurrent.atomic.AtomicInteger position=new java.util.concurrent.atomic.AtomicInteger();java.util.concurrent.atomic.AtomicBoolean playing=new java.util.concurrent.atomic.AtomicBoolean();
        try{
            instrumentation.runOnMainSync(()->{PackingFeedback value=new PackingFeedback(activity,new PackingFeedback.Listener(){public void busy(boolean busy){}public void notice(String message){}},(player,id)->player.setDataSource(audio.getAbsolutePath()));feedback.set(value);value.playOrder("local-test-order");});
            long until=System.currentTimeMillis()+8000;while(System.currentTimeMillis()<until){instrumentation.runOnMainSync(()->{playing.set(feedback.get().isVoicePlaying());position.set(feedback.get().voicePosition());});if(playing.get()&&position.get()>800)break;Thread.sleep(50);}assertTrue(playing.get());assertTrue(position.get()>800);
            instrumentation.runOnMainSync(()->{feedback.get().result(true,"","local-test-order");assertTrue("Correct tone must not pause the voice",feedback.get().isVoicePlaying());});
            Thread.sleep(250);instrumentation.runOnMainSync(()->{feedback.get().result(false,"Wrong card.","local-test-order");assertFalse(feedback.get().isVoicePlaying());position.set(feedback.get().voicePosition());});int paused=position.get();
            instrumentation.runOnMainSync(()->feedback.get().result(true,"","local-test-order"));
            Thread.sleep(200);instrumentation.runOnMainSync(()->{assertFalse(feedback.get().isVoicePlaying());assertEquals(paused,feedback.get().voicePosition(),100);});
            until=System.currentTimeMillis()+25000;playing.set(false);while(System.currentTimeMillis()<until){instrumentation.runOnMainSync(()->{playing.set(feedback.get().isVoicePlaying());position.set(feedback.get().voicePosition());});if(playing.get())break;Thread.sleep(30);}assertTrue("Voice resumes after the error explanation",playing.get());assertTrue("Resume must not restart the recording",position.get()>=paused-100);assertTrue(position.get()<paused+700);
        }finally{instrumentation.runOnMainSync(()->{if(feedback.get()!=null)feedback.get().close();activity.finish();});audio.delete();}
    }
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
