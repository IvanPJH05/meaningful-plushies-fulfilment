package com.meaningfulplushies.packingstation;
import org.junit.Test;
import static org.junit.Assert.*;
public class RecordingQualityTest {
    @Test public void requestsRealTwoKWithoutUpscalingOrSelectingFourK(){assertTrue(RecordingQuality.allowed(2560,1440));assertTrue(RecordingQuality.allowed(2048,1080));assertTrue(RecordingQuality.allowed(1920,1080));assertTrue(RecordingQuality.allowed(1280,720));assertFalse(RecordingQuality.allowed(3840,2160));}
    @Test public void prefersHigherResolutionAndCompressedUsbForEqualSize(){assertTrue(RecordingQuality.preference(2560,1440,true)>RecordingQuality.preference(1920,1080,true));assertTrue(RecordingQuality.preference(1920,1080,true)>RecordingQuality.preference(1920,1080,false));}
    @Test public void highQualityFitsTheFullPackingWindow(){assertEquals(8_000_000,RecordingQuality.bitrate(2560,1440));assertEquals(6_000_000,RecordingQuality.bitrate(1920,1080));assertEquals(4_000_000,RecordingQuality.bitrate(1280,720));assertTrue((8_000_000L+96000)*180/8<RecordingQuality.MAX_FILE_BYTES);assertTrue(8_000_000L*11/8<RecordingQuality.MAX_RING_BYTES);}
    @Test public void highQualityRingDoesNotFailAtTheOldSixMegabyteLimit(){PacketRing ring=new PacketRing();for(int i=0;i<250;i++)ring.add(new PacketRing.Packet(new byte[42000],i*41667L,i%12==0),5_000_000+i*41667L);assertTrue(ring.bufferedBytes()>6*1024*1024);assertTrue(ring.warehouseReady(5_000_000+249*41667L));}
}
