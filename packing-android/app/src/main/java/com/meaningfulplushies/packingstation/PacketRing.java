package com.meaningfulplushies.packingstation;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
// Pure Java timing model; hardware buffers are copied before returning them to MediaCodec.
final class PacketRing {
    static final long BEFORE_US=3_000_000,AFTER_US=21_000_000;
    static final class Packet {
        final byte[] bytes;final long pts;final boolean key;long observedUs;
        Packet(byte[] bytes,long pts,boolean key){this.bytes=bytes;this.pts=pts;this.key=key;}
    }
    static final class Capture {
        final long scanPts,scanEpochMs,startPts;
        final List<Packet> packets=new ArrayList<>();
        volatile boolean verified=false;
        boolean warehouse=false;long endPts,endMonoUs,trackingVerifiedAt,bytes;String trackingNumber="";
        String error="";
        Capture(long scanPts,long scanEpochMs,long startPts){this.scanPts=scanPts;this.scanEpochMs=scanEpochMs;this.startPts=startPts;}
        long sourceEpochMs(){return scanEpochMs-(scanPts-startPts)/1000;}
        long sourceMonoUs(){return packets.get(0).observedUs;}
        long durationMs(){return (endPts-startPts)/1000+40;}
    }
    private final ArrayDeque<Packet> ring=new ArrayDeque<>();
    private long lastArrivalUs,ringBytes;
    private Capture active,finished;
    synchronized void add(Packet packet,long arrivalUs) {
        Packet previous=ring.peekLast();
        if(previous!=null && (packet.pts<=previous.pts || packet.pts-previous.pts>750_000)) {
            fail("The webcam feed was interrupted. No complete video was saved; scan again.");ring.clear();ringBytes=0;
        }
        packet.observedUs=arrivalUs;ring.add(packet);ringBytes+=packet.bytes.length;lastArrivalUs=arrivalUs;
        long keep=Long.MIN_VALUE;
        for(Packet p:ring)if(p.key && p.pts<=packet.pts-10_000_000)keep=p.pts;
        while(!ring.isEmpty() && ring.peekFirst().pts<keep)ringBytes-=ring.removeFirst().bytes.length;
        if(ringBytes>RecordingQuality.MAX_RING_BYTES){fail("Camera buffer exceeded its limit. Restart the webcam.");ring.clear();ringBytes=0;return;}
        if(active!=null){
            active.packets.add(packet);
            active.bytes+=packet.bytes.length;
            if(active.warehouse){if(packet.pts-active.startPts>=180_000_000||active.bytes>RecordingQuality.MAX_VIDEO_BYTES)fail("Recording reached its safety limit. Scan this parcel again.");}
            else if(packet.pts>=active.scanPts+AFTER_US){finished=active;active=null;}
        }
    }
    synchronized boolean ready(long nowUs) {
        Packet last=ring.peekLast();if(last==null || nowUs-lastArrivalUs>750_000 || nowUs<lastArrivalUs)return false;
        long threshold=last.pts+(nowUs-lastArrivalUs)-BEFORE_US;
        for(Packet p:ring)if(p.key && p.pts<=threshold)return true;
        return false;
    }
    synchronized Capture begin(long scanMonoUs,long scanEpochMs) {
        if(active!=null)throw new IllegalStateException("Finish recording the current parcel first.");
        Packet anchor=null;for(Packet p:ring)if(p.observedUs<=scanMonoUs)anchor=p;
        if(anchor==null || scanMonoUs-anchor.observedUs>750_000)throw new IllegalStateException("Wait for live webcam history, then scan the ID card again.");
        long scanPts=anchor.pts+scanMonoUs-anchor.observedUs,start=Long.MIN_VALUE;
        for(Packet p:ring)if(p.key && p.pts<=scanPts-BEFORE_US)start=p.pts;
        if(start==Long.MIN_VALUE)throw new IllegalStateException("The full 3-second history is not ready. Scan the card again.");
        Capture next=new Capture(scanPts,scanEpochMs,start);
        for(Packet p:ring)if(p.pts>=start)next.packets.add(p);
        active=next;return next;
    }
    synchronized void cancel(Capture capture){if(active==capture)active=null;capture.error="Card verification failed. Scan again; no video was saved.";}
    synchronized boolean warehouseReady(long nowUs){Packet last=ring.peekLast();if(last==null||nowUs-lastArrivalUs>500000)return false;for(Packet p:ring)if(p.key&&last.pts+nowUs-lastArrivalUs-p.pts<=1000000)return true;return false;}
    synchronized Capture beginWarehouse(long mono,long epoch){
        if(active!=null||!warehouseReady(mono))throw new IllegalStateException("Wait for the camera and microphone to be READY.");
        Packet last=ring.peekLast();long at=last.pts+mono-last.observedUs;Packet key=null;for(Packet p:ring)if(p.key&&p.pts<=at)key=p;
        Capture next=new Capture(at,epoch,key.pts);next.warehouse=true;for(Packet p:ring)if(p.pts>=key.pts){next.packets.add(p);next.bytes+=p.bytes.length;}active=next;return next;
    }
    synchronized void finishWarehouse(Capture clip,String tracking,long verifiedAt){
        if(active!=clip||!clip.warehouse||!clip.verified||!clip.error.isEmpty())throw new IllegalStateException("Pair the NFC card before confirming the shipping label.");
        Packet last=ring.peekLast();if(last==null||last.pts-clip.startPts<1000000)throw new IllegalStateException("Keep the matching label in view while recording starts.");
        clip.endPts=last.pts;clip.endMonoUs=last.observedUs+40000;clip.trackingNumber=tracking;clip.trackingVerifiedAt=verifiedAt;finished=clip;active=null;
    }
    synchronized void fail(String reason){if(active!=null){active.error=reason;finished=active;active=null;}}
    synchronized Capture takeFinished(){Capture value=finished;finished=null;return value;}
    synchronized int bufferedBytes(){return (int)ringBytes;}
}
