package com.meaningfulplushies.packingstation;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.MediaCodec;
import android.os.Handler;
import android.os.Looper;
import android.util.Size;
import android.view.Surface;
import android.view.TextureView;
import java.util.*;

/** Camera2 sends the same frames to the preview and existing rolling recorder. */
final class TabletCamera implements AutoCloseable {
    interface Listener {
        Surface prepare(int width,int height,int rotation) throws Exception;
        void ready();
        void error(String message);
    }
    private CameraDevice device;
    private CameraCaptureSession session;
    private Surface previewSurface;
    private boolean closed;
    int sensorOrientation;
    boolean frontFacing;
    @SuppressLint("MissingPermission")
    void open(Context context,String id,TextureView preview,int displayDegrees,Listener listener) throws Exception {
        CameraManager manager=(CameraManager)context.getSystemService(Context.CAMERA_SERVICE);
        CameraCharacteristics characteristics=manager.getCameraCharacteristics(id);
        StreamConfigurationMap map=characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        if(map==null)throw new Exception("This camera does not offer a video stream.");
        Size[] outputs=map.getOutputSizes(MediaCodec.class), previews=map.getOutputSizes(SurfaceTexture.class);
        if(outputs==null||previews==null)throw new Exception("This camera cannot record video.");
        List<Size> common=new ArrayList<>();
        for(Size size:outputs)if(size.getWidth()<=1280&&size.getHeight()<=720&&Arrays.asList(previews).contains(size))common.add(size);
        common.sort((a,b)->Long.compare((long)b.getWidth()*b.getHeight(),(long)a.getWidth()*a.getHeight()));
        if(common.isEmpty())throw new Exception("No compatible camera recording size was found.");
        Size size=common.get(0);Integer sensor=characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
        Integer facing=characteristics.get(CameraCharacteristics.LENS_FACING);
        sensorOrientation=sensor==null?0:sensor;frontFacing=Integer.valueOf(CameraCharacteristics.LENS_FACING_FRONT).equals(facing);
        int rotation=((sensor==null?0:sensor)+(Integer.valueOf(CameraCharacteristics.LENS_FACING_FRONT).equals(facing)?displayDegrees:-displayDegrees)+360)%360;
        SurfaceTexture texture=preview.getSurfaceTexture();if(texture==null)throw new Exception("Camera preview is not ready. Try choosing the camera again.");
        texture.setDefaultBufferSize(size.getWidth(),size.getHeight());previewSurface=new Surface(texture);
        Surface recording=listener.prepare(size.getWidth(),size.getHeight(),rotation);
        Handler main=new Handler(Looper.getMainLooper());
        manager.openCamera(id,new CameraDevice.StateCallback(){
            public void onOpened(CameraDevice camera){
                if(closed){camera.close();return;}device=camera;
                try{camera.createCaptureSession(Arrays.asList(previewSurface,recording),new CameraCaptureSession.StateCallback(){
                    public void onConfigured(CameraCaptureSession configured){
                        if(closed){configured.close();return;}session=configured;
                        try{CaptureRequest.Builder request=camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);request.addTarget(previewSurface);request.addTarget(recording);
                            int[] focus=characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
                            if(focus!=null)for(int mode:focus)if(mode==CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO){request.set(CaptureRequest.CONTROL_AF_MODE,mode);break;}
                            configured.setRepeatingRequest(request.build(),null,main);listener.ready();
                        }catch(Exception error){if(!closed)listener.error("Could not start tablet recording: "+error.getMessage());}
                    }
                    public void onConfigureFailed(CameraCaptureSession failed){if(!closed)listener.error("This camera could not start a recording stream. Try another camera.");}
                },main);}catch(Exception error){if(!closed)listener.error("Could not configure tablet camera: "+error.getMessage());}
            }
            public void onDisconnected(CameraDevice camera){camera.close();if(!closed)listener.error("Camera disconnected. Choose a camera again.");}
            public void onError(CameraDevice camera,int error){camera.close();if(!closed)listener.error("Camera is unavailable ("+error+"). Close other camera apps and try again.");}
        },main);
    }
    public void close(){closed=true;if(session!=null){session.close();session=null;}if(device!=null){device.close();device=null;}if(previewSurface!=null){previewSurface.release();previewSurface=null;}}
}
