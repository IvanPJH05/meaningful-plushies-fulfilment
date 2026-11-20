package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.media.*;
import android.opengl.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class NativeRecordingTest {
    @Test public void nativeEncoderKeepsHistoryAndWritesACompleteSeekableMp4() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        AtomicReference<PacketRing.Capture> completed=new AtomicReference<>();AtomicReference<MediaFormat> format=new AtomicReference<>();AtomicReference<String> failure=new AtomicReference<>();
        RollingEncoder encoder=new RollingEncoder(320,240,new RollingEncoder.Listener(){public void finished(PacketRing.Capture clip,MediaFormat f){completed.set(clip);format.set(f);}public void error(String message){failure.set(message);}});
        EGLDisplay display=EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);assertTrue(EGL14.eglInitialize(display,new int[2],0,new int[2],1));
        int[] attributes={EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT,EGL14.EGL_SURFACE_TYPE,EGL14.EGL_WINDOW_BIT,EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,0x3142,1,EGL14.EGL_NONE};
        EGLConfig[] configs=new EGLConfig[1];int[] count=new int[1];assertTrue(EGL14.eglChooseConfig(display,attributes,0,configs,0,1,count,0));assertTrue(count[0]>0);
        EGLContext gl=EGL14.eglCreateContext(display,configs[0],EGL14.EGL_NO_CONTEXT,new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE},0);
        EGLSurface surface=EGL14.eglCreateWindowSurface(display,configs[0],encoder.surface,new int[]{EGL14.EGL_NONE},0);assertTrue(EGL14.eglMakeCurrent(display,surface,surface,gl));
        File video=new File(context.getCacheDir(),"native-packing-test.mp4");
        try {
            long started=System.nanoTime();PacketRing.Capture clip=null;
            while(System.nanoTime()-started<32_000_000_000L && completed.get()==null){
                GLES20.glViewport(0,0,320,240);GLES20.glClearColor((float)((System.nanoTime()/100000000)%10)/10,.3f,.6f,1);GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);EGLExt.eglPresentationTimeANDROID(display,surface,System.nanoTime());assertTrue(EGL14.eglSwapBuffers(display,surface));Thread.sleep(40);
                if(clip==null && System.nanoTime()-started>4_000_000_000L && encoder.ring.ready(System.nanoTime()/1000)){clip=encoder.ring.begin(System.nanoTime()/1000,System.currentTimeMillis());clip.verified=true;}
            }
            assertNull(failure.get());assertNotNull("A complete clip must finish",completed.get());RollingEncoder.save(video,completed.get(),format.get());
            MediaExtractor extractor=new MediaExtractor();try{extractor.setDataSource(video.getAbsolutePath());assertEquals(1,extractor.getTrackCount());MediaFormat track=extractor.getTrackFormat(0);assertEquals("video/avc",track.getString(MediaFormat.KEY_MIME));assertTrue(track.getLong(MediaFormat.KEY_DURATION)>=23_750_000);extractor.selectTrack(0);assertTrue((extractor.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_SYNC)!=0);}finally{extractor.release();}
            assertTrue(video.length()>0);assertTrue(video.length()<25*1024*1024);
        } finally{EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT);EGL14.eglDestroySurface(display,surface);EGL14.eglDestroyContext(display,gl);EGL14.eglTerminate(display);encoder.close();video.delete();}
    }
}
