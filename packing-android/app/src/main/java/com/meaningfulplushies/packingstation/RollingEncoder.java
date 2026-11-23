package com.meaningfulplushies.packingstation;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.view.Surface;
import java.io.File;
import java.nio.ByteBuffer;
final class RollingEncoder implements AutoCloseable {
    interface Listener {void finished(PacketRing.Capture capture,MediaFormat format);void error(String message);}
    final PacketRing ring=new PacketRing();
    private final MediaCodec codec;
    final Surface surface;
    private Thread drain;
    private volatile boolean running=true;
    private MediaFormat outputFormat;
    private MicrophoneEncoder microphone;
    RollingEncoder(int width,int height,Listener listener,android.media.AudioDeviceInfo device) throws Exception {
        this(width,height,listener);
        try{microphone=new MicrophoneEncoder(device,message->{ring.fail(message);listener.error(message);});}catch(Exception error){close();throw error;}
    }
    boolean warehouseReady(){return microphone!=null&&microphone.ready()&&ring.warehouseReady(System.nanoTime()/1000);}
    void saveWithAudio(File file,PacketRing.Capture capture,MediaFormat format,int rotation)throws Exception{
        if(microphone==null)throw new Exception("Microphone is not connected.");
        save(file,capture,format,rotation,microphone.clip(capture.sourceMonoUs(),capture.endMonoUs));
    }
    RollingEncoder(int width,int height,Listener listener) throws Exception {
        MediaFormat format=MediaFormat.createVideoFormat("video/avc",width,height);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        format.setInteger(MediaFormat.KEY_PROFILE,MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);
        format.setInteger(MediaFormat.KEY_BIT_RATE,RecordingQuality.bitrate(width,height));format.setInteger(MediaFormat.KEY_FRAME_RATE,24);format.setFloat(MediaFormat.KEY_I_FRAME_INTERVAL,.5f);
        codec=MediaCodec.createEncoderByType("video/avc");
        codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);surface=codec.createInputSurface();codec.start();
        drain=new Thread(()->{
            MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            try {
                while(running){
                    int index=codec.dequeueOutputBuffer(info,10000);
                    if(index==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){outputFormat=codec.getOutputFormat();continue;}
                    if(index>=0){
                        try{
                            if(info.size>0 && (info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0){
                                ByteBuffer data=codec.getOutputBuffer(index);if(data!=null){data.position(info.offset);data.limit(info.offset+info.size);byte[] bytes=new byte[info.size];data.get(bytes);
                                    ring.add(new PacketRing.Packet(bytes,info.presentationTimeUs,(info.flags&MediaCodec.BUFFER_FLAG_KEY_FRAME)!=0),System.nanoTime()/1000);
                                }
                            }
                        } finally{codec.releaseOutputBuffer(index,false);}
                    }
                    PacketRing.Capture done=ring.takeFinished();if(done!=null && outputFormat!=null)listener.finished(done,outputFormat);
                }
            } catch(Exception error){if(running){ring.fail("The camera encoder stopped. Reconnect the webcam and scan again.");PacketRing.Capture failed=ring.takeFinished();if(failed!=null)listener.finished(failed,outputFormat);listener.error("The camera encoder stopped. Reconnect the webcam.");}}
        },"packing-h264");drain.start();
    }
    static void save(File file,PacketRing.Capture capture,MediaFormat format) throws Exception {save(file,capture,format,0);}
    static void save(File file,PacketRing.Capture capture,MediaFormat format,int rotation) throws Exception {
        save(file,capture,format,rotation,null);
    }
    private static void save(File file,PacketRing.Capture capture,MediaFormat format,int rotation,MicrophoneEncoder.Clip audio) throws Exception {
        if(!capture.error.isEmpty() || !capture.verified || format==null || capture.packets.isEmpty() || !capture.packets.get(0).key)throw new Exception("No complete verified packing recording is available.");
        PacketRing.Packet last=capture.packets.get(capture.packets.size()-1);
        if(capture.warehouse?(capture.endPts==0||capture.trackingNumber.isEmpty()||capture.durationMs()<1000||capture.durationMs()>180000||audio==null):last.pts<capture.scanPts+20_750_000)throw new Exception("The recording ended before the parcel was completely captured.");
        MediaMuxer muxer=new MediaMuxer(file.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        boolean started=false;
        try{
            muxer.setOrientationHint(rotation);int track=muxer.addTrack(format),audioTrack=audio==null?-1:muxer.addTrack(audio.format);muxer.start();started=true;
            for(PacketRing.Packet packet:capture.packets){MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();info.set(0,packet.bytes.length,packet.pts-capture.startPts,packet.key?MediaCodec.BUFFER_FLAG_KEY_FRAME:0);muxer.writeSampleData(track,ByteBuffer.wrap(packet.bytes),info);}
            if(audio!=null)for(MicrophoneEncoder.Sample sample:audio.samples){MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();info.set(0,sample.data.length,sample.mono-capture.sourceMonoUs(),0);muxer.writeSampleData(audioTrack,ByteBuffer.wrap(sample.data),info);}
            muxer.stop();started=false;
        } finally{if(started)try{muxer.stop();}catch(Exception ignored){}muxer.release();}
        if(file.length()<=0 || file.length()>RecordingQuality.MAX_FILE_BYTES)throw new Exception("The local recording is empty or too large; scan again.");
    }
    @Override public void close(){
        if(microphone!=null){microphone.close();microphone=null;}
        running=false;if(drain!=null)try{drain.join(1500);}catch(InterruptedException error){Thread.currentThread().interrupt();}
        try{codec.stop();}catch(Exception ignored){}codec.release();surface.release();
    }
}
