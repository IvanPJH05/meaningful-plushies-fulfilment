package com.meaningfulplushies.packingstation;
import java.util.List;

/** UVC advertises modes only after the first camera-open callback. UI-thread owned. */
final class UsbCameraStartup<M> {
    interface Camera<M> {
        void openDefault();
        List<M> recordingModes();
        M currentMode();
        boolean sameMode(M a,M b);
        void reopen(M mode);
        void record(M mode) throws Exception;
        void failed(String message);
    }
    private enum Phase { DISCOVERING, OPENING, READY, STOPPED }
    private final Camera<M> camera;
    private Phase phase=Phase.STOPPED;
    private List<M> modes;
    private int next;
    private M requested;
    UsbCameraStartup(Camera<M> camera){this.camera=camera;}
    void start(){phase=Phase.DISCOVERING;next=0;modes=null;camera.openDefault();}
    void opened(){
        if(phase==Phase.STOPPED||phase==Phase.READY)return;
        if(phase==Phase.DISCOVERING){modes=camera.recordingModes();tryNext();return;}
        M actual=camera.currentMode();
        if(actual==null||!camera.sameMode(actual,requested)){tryNext();return;}
        record(actual);
    }
    private void tryNext(){
        if(modes==null||next>=modes.size()){fail("No compatible webcam recording mode opened. Reconnect the webcam and try again.");return;}
        requested=modes.get(next++);phase=Phase.OPENING;
        M actual=camera.currentMode();
        if(actual!=null&&camera.sameMode(actual,requested))record(actual);
        else camera.reopen(requested);
    }
    private void record(M mode){
        try{camera.record(mode);phase=Phase.READY;}
        catch(Exception error){tryNext();}
    }
    void error(String message){if(phase==Phase.OPENING)tryNext();else if(phase!=Phase.STOPPED)fail(message);}
    boolean switchingMode(){return phase==Phase.OPENING;}
    void cancel(){phase=Phase.STOPPED;}
    private void fail(String message){phase=Phase.STOPPED;camera.failed(message);}
}
