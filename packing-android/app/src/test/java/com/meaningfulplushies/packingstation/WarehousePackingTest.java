package com.meaningfulplushies.packingstation;
import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;
public class WarehousePackingTest {
 private void frame(PacketRing ring,int n){ring.add(new PacketRing.Packet(new byte[100],n*100000L,n%5==0),n*100000L+5000000);}
 @Test public void recordingStartsAtOrderScanAndDoesNotAutoFinishAfterTheOldTail(){
  PacketRing ring=new PacketRing();for(int i=0;i<=52;i++)frame(ring,i);PacketRing.Capture clip=ring.beginWarehouse(10200000,100000);assertTrue(clip.warehouse);assertTrue(clip.packets.get(0).key);assertTrue(Math.abs(clip.sourceEpochMs()-clip.scanEpochMs)<=1000);
  for(int i=53;i<400;i++)frame(ring,i);assertNull(ring.takeFinished());assertFalse(clip.verified);
  try{ring.finishWarehouse(clip,"632205723770",134800);fail();}catch(IllegalStateException expected){}
  clip.verified=true;ring.finishWarehouse(clip,"632205723770",134800);assertSame(clip,ring.takeFinished());assertEquals("632205723770",clip.trackingNumber);assertTrue(clip.durationMs()>30000);
 }
 @Test public void trackingNeedsTheFullNumberOnTwoDistinctConsecutiveFrames(){
  TrackingConfirmation gate=new TrackingConfirmation();assertFalse(gate.observe(Arrays.asList("5723770"),"632205723770",1));assertFalse(gate.observe(Arrays.asList("632205723770"),"632205723770",2));assertFalse(gate.observe(Arrays.asList("632205723770"),"632205723770",2));assertTrue(gate.observe(Arrays.asList("632205723770"),"632205723770",3));
  gate.reset();assertFalse(gate.observe(Arrays.asList("632205723770"),"632205723770",4));assertFalse(gate.observe(Arrays.asList("632205723771"),"632205723770",5));assertFalse(gate.observe(Arrays.asList("632205723770"),"632205723770",6));
 }
 @Test public void interruptedOrOverlongRecordingsNeverBecomeSuccessfulProof(){
  PacketRing ring=new PacketRing();for(int i=0;i<=10;i++)frame(ring,i);PacketRing.Capture clip=ring.beginWarehouse(6000000,100000);
  for(int i=11;i<=1820;i++)frame(ring,i);assertSame(clip,ring.takeFinished());assertFalse(clip.error.isEmpty());
 }
}
