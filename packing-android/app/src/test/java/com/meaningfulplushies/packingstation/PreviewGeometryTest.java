package com.meaningfulplushies.packingstation;
import org.junit.Test;
import static org.junit.Assert.*;
public class PreviewGeometryTest {
    @Test public void tabletFeedIsNeverStretchedOrCroppedAcrossSensorsAndWindowRotations(){
        int[][] windows={{320,280},{1280,720},{600,1100},{800,280}};
        for(int sensor:new int[]{0,90,270})for(boolean front:new boolean[]{false,true})for(int display:new int[]{0,90,180,270})for(int[] window:windows){
            PreviewGeometry frame=PreviewGeometry.fit(1280,720,window[0],window[1],sensor,front,display,false,0);
            assertNotNull(frame);assertTrue(frame.width<=window[0]+.001);assertTrue(frame.height<=window[1]+.001);
            float naturalW=sensor%180==0?1280:720,naturalH=sensor%180==0?720:1280;
            // After undoing TextureView's default stretch, a pixel is the same
            // length in both axes, so a circle remains a circle.
            assertEquals(frame.scaleX*window[0]/naturalW,frame.scaleY*window[1]/naturalH,.0001);
            assertEquals(PreviewGeometry.degrees(-display),frame.previewRotation);
        }
    }
    @Test public void sensorIsNotRotatedTwiceAndRecordingUsesItsOwnOrientation(){
        PreviewGeometry portrait=PreviewGeometry.fit(1280,720,600,1000,90,false,0,false,0);
        assertEquals(0,portrait.previewRotation);assertEquals(90,portrait.recordingRotation);
        PreviewGeometry landscape=PreviewGeometry.fit(1280,720,1000,600,90,false,90,false,0);
        assertEquals(270,landscape.previewRotation);assertEquals(0,landscape.recordingRotation);
    }
    @Test public void fixedUsbCameraDoesNotRotateWithTheTabletAndSupportsMountCorrection(){
        for(int display:new int[]{0,90,180,270}){
            PreviewGeometry normal=PreviewGeometry.fit(1280,720,600,280,0,false,display,true,0);
            assertEquals(0,normal.previewRotation);assertEquals(0,normal.recordingRotation);
            PreviewGeometry rotated=PreviewGeometry.fit(1280,720,600,280,0,false,display,true,90);
            assertEquals(90,rotated.previewRotation);assertEquals(90,rotated.recordingRotation);assertEquals(720f/1280,rotated.width/rotated.height,.0001);
        }
        assertNull(PreviewGeometry.fit(1280,720,0,0,90,false,0,false,0));
    }
}
