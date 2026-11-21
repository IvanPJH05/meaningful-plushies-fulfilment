package com.meaningfulplushies.packingstation;

/** TextureView already applies Camera2 sensor orientation. Only undo its
 * stretching and compensate display rotation here; MP4 uses raw sensor axes. */
final class PreviewGeometry {
    final float scaleX,scaleY,width,height;
    final int previewRotation,recordingRotation;
    private PreviewGeometry(float x,float y,float width,float height,int preview,int recording){this.scaleX=x;this.scaleY=y;this.width=width;this.height=height;this.previewRotation=preview;this.recordingRotation=recording;}
    static int degrees(int angle){return (angle%360+360)%360;}
    static PreviewGeometry fit(int rawWidth,int rawHeight,int viewWidth,int viewHeight,int sensor,boolean front,int display,boolean usb,int correction){
        if(rawWidth<=0||rawHeight<=0||viewWidth<=0||viewHeight<=0)return null;
        boolean sensorSwapped=!usb&&degrees(sensor)%180!=0;
        float naturalWidth=sensorSwapped?rawHeight:rawWidth,naturalHeight=sensorSwapped?rawWidth:rawHeight;
        int preview=degrees((usb?0:-display)+correction);
        boolean swapped=preview%180!=0;
        float orientedWidth=swapped?naturalHeight:naturalWidth,orientedHeight=swapped?naturalWidth:naturalHeight;
        float scale=Math.min(viewWidth/orientedWidth,viewHeight/orientedHeight);
        int recording=degrees((usb?0:sensor+(front?display:-display))+correction);
        return new PreviewGeometry(naturalWidth/viewWidth*scale,naturalHeight/viewHeight*scale,orientedWidth*scale,orientedHeight*scale,preview,recording);
    }
}
