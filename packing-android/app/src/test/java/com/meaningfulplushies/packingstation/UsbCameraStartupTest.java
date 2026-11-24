package com.meaningfulplushies.packingstation;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class UsbCameraStartupTest {
    static final class Webcam implements UsbCameraStartup.Camera<String> {
        boolean opened;String mode,recorded,failure;int discoveries;boolean rejectEncoder;
        List<String> modes=Arrays.asList("2K","1080p","VGA"),events=new ArrayList<>();
        public void openDefault(){events.add("open default");}
        public List<String> recordingModes(){assertTrue("formats do not exist before the first open",opened);discoveries++;return modes;}
        public String currentMode(){return mode;}
        public boolean sameMode(String a,String b){return a.equals(b);}
        public void reopen(String next){events.add("open "+next);mode=null;}
        public void record(String actual)throws Exception{if(rejectEncoder){rejectEncoder=false;throw new Exception("Rejected mode");}recorded=actual;events.add("record "+actual);}
        public void failed(String message){failure=message;}
        void arrive(UsbCameraStartup<String> startup,String actual){opened=true;mode=actual;startup.opened();}
    }
    @Test public void discoversOnlyAfterCameraOpenThenReopensAtHighestMode(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();
        assertEquals(0,camera.discoveries);assertNull(camera.recorded);
        camera.arrive(startup,"VGA");assertEquals(Arrays.asList("open default","open 2K"),camera.events);assertTrue(startup.switchingMode());assertNull(camera.recorded);
        camera.arrive(startup,"2K");assertEquals("2K",camera.recorded);assertFalse(startup.switchingMode());assertEquals(1,camera.discoveries);
    }
    @Test public void rejectedUsbModeFallsBackAndNeverRecordsWrongDimensions(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();camera.arrive(startup,"VGA");
        startup.error("USB rejected 2K");assertEquals("open 1080p",camera.events.get(2));assertNull(camera.recorded);
        camera.arrive(startup,"VGA");assertNull(camera.recorded);assertEquals("open VGA",camera.events.get(3));camera.arrive(startup,"VGA");assertEquals("VGA",camera.recorded);
    }
    @Test public void encoderFailureTriesTheNextMode(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();camera.arrive(startup,"VGA");camera.rejectEncoder=true;camera.arrive(startup,"2K");assertNull(camera.recorded);camera.arrive(startup,"1080p");assertEquals("1080p",camera.recorded);
    }
    @Test public void detachOrCancellationIgnoresLateCallbacks(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();startup.cancel();camera.arrive(startup,"VGA");startup.error("late");assertEquals(0,camera.discoveries);assertNull(camera.recorded);assertNull(camera.failure);
    }
    @Test public void activeRecordingErrorStopsInsteadOfChangingCamerasMidParcel(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();camera.arrive(startup,"VGA");camera.arrive(startup,"2K");startup.error("Disconnected");assertEquals("Disconnected",camera.failure);assertEquals(3,camera.events.size());
    }
    @Test public void exhaustsCandidatesWithoutAnInfiniteReconnectLoop(){
        Webcam camera=new Webcam();UsbCameraStartup<String> startup=new UsbCameraStartup<>(camera);startup.start();camera.arrive(startup,"VGA");startup.error("failed");startup.error("failed");startup.error("failed");int calls=camera.events.size();startup.error("late");assertEquals(calls,camera.events.size());assertNotNull(camera.failure);assertNull(camera.recorded);
    }
}
