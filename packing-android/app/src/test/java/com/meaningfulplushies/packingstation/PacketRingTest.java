package com.meaningfulplushies.packingstation;
import org.junit.Test;
import static org.junit.Assert.*;
public class PacketRingTest {
    private void frame(PacketRing ring,int n){ring.add(new PacketRing.Packet(new byte[100],n*100000L,n%10==0),n*100000L+5000000);}
    @Test public void fullHistoryIsRequiredAndClipBeginsOnAKeyframe(){
        PacketRing ring=new PacketRing();for(int i=0;i<30;i++)frame(ring,i);assertFalse(ring.ready(7900000));frame(ring,30);assertTrue(ring.ready(8000000));
        for(int i=31;i<=52;i++)frame(ring,i);PacketRing.Capture clip=ring.begin(10200000,100000);
        assertEquals(2000000,clip.startPts);assertTrue(clip.packets.get(0).key);assertEquals(96800,clip.sourceEpochMs());
        for(int i=53;i<=262;i++)frame(ring,i);assertSame(clip,ring.takeFinished());assertEquals(26200000,clip.packets.get(clip.packets.size()-1).pts);
    }
    @Test public void cardFirstLookupLatencyDoesNotShiftTheScanTime(){
        PacketRing ring=new PacketRing();for(int i=0;i<=65;i++)frame(ring,i);
        PacketRing.Capture clip=ring.begin(10200000,100000);assertEquals(5200000,clip.scanPts);assertEquals(2000000,clip.startPts);
    }
    @Test public void disconnectAndTimestampResetNeverProduceASuccessfulClip(){
        PacketRing ring=new PacketRing();for(int i=0;i<=40;i++)frame(ring,i);assertFalse(ring.ready(10000000));
        PacketRing.Capture clip=ring.begin(9000000,100000);ring.add(new PacketRing.Packet(new byte[100],6000000,true),11000000);
        assertSame(clip,ring.takeFinished());assertFalse(clip.error.isEmpty());assertFalse(ring.ready(11000000));
    }
    @Test public void aFailedPairCannotFinishARecording(){
        PacketRing ring=new PacketRing();for(int i=0;i<=40;i++)frame(ring,i);PacketRing.Capture clip=ring.begin(9000000,100000);ring.cancel(clip);
        for(int i=41;i<270;i++)frame(ring,i);assertNull(ring.takeFinished());assertFalse(clip.error.isEmpty());
    }
    @Test public void bufferMemoryIsBounded(){PacketRing ring=new PacketRing();for(int i=0;i<100;i++)ring.add(new PacketRing.Packet(new byte[1024*1024],i*100000L,true),i*100000L);assertTrue(ring.bufferedBytes()<=6*1024*1024);}
}
