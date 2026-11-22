package com.meaningfulplushies.packingstation;
import android.media.*;
import java.nio.ByteBuffer;
import java.util.*;
/** Private AAC ring aligned to the same monotonic clock as the camera observations. */
final class MicrophoneEncoder implements AutoCloseable {
 static final class Sample {final byte[] data;final long mono;Sample(byte[] d,long t){data=d;mono=t;}}
 static final class Clip {final MediaFormat format;final List<Sample> samples;Clip(MediaFormat f,List<Sample> s){format=f;samples=s;}}
 private final AudioRecord recorder;private final MediaCodec codec;private final List<Sample> samples=new ArrayList<>();
 private volatile boolean running=true;private volatile MediaFormat format;private Thread thread;private volatile String failure="";private long last;
 @android.annotation.SuppressLint("MissingPermission")
 MicrophoneEncoder(AudioDeviceInfo device,java.util.function.Consumer<String> failed)throws Exception{
  int rate=44100,size=Math.max(8192,AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)*2);
  recorder=new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC).setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()).setBufferSizeInBytes(size).build();
  if(recorder.getState()!=AudioRecord.STATE_INITIALIZED){recorder.release();throw new Exception("Microphone could not open. Choose another microphone.");}
  if(device!=null&&!recorder.setPreferredDevice(device)){recorder.release();throw new Exception("This microphone cannot be selected. Choose another input.");}
  MediaFormat output=MediaFormat.createAudioFormat("audio/mp4a-latm",rate,1);output.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);output.setInteger(MediaFormat.KEY_BIT_RATE,96000);
  codec=MediaCodec.createEncoderByType("audio/mp4a-latm");
  try{codec.configure(output,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();recorder.startRecording();if(recorder.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new Exception("Microphone recording could not start.");}
  catch(Exception e){recorder.release();codec.release();throw e;}
  thread=new Thread(()->{long start=System.nanoTime()/1000,count=0;byte[] pcm=new byte[2048];MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
   try{while(running){int input=codec.dequeueInputBuffer(10000);if(input>=0){int n=recorder.read(pcm,0,pcm.length,AudioRecord.READ_BLOCKING);if(n<=0)throw new Exception("Microphone disconnected. Reconnect before packing.");ByteBuffer b=codec.getInputBuffer(input);b.clear();b.put(pcm,0,n);codec.queueInputBuffer(input,0,n,start+count*1000000/rate,0);count+=n/2;}
    for(;;){int index=codec.dequeueOutputBuffer(info,0);if(index==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){format=codec.getOutputFormat();continue;}if(index<0)break;try{if(info.size>0&&(info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0){ByteBuffer b=codec.getOutputBuffer(index);b.position(info.offset);b.limit(info.offset+info.size);byte[] data=new byte[info.size];b.get(data);synchronized(samples){samples.add(new Sample(data,info.presentationTimeUs));last=info.presentationTimeUs;while(!samples.isEmpty()&&samples.get(0).mono<last-190000000)samples.remove(0);}}}finally{codec.releaseOutputBuffer(index,false);}}
    if(device!=null&&count>rate&&recorder.getRoutedDevice()!=null&&recorder.getRoutedDevice().getId()!=device.getId())throw new Exception("Android could not route the selected microphone. Choose another input.");
   }}catch(Exception e){if(running){failure=e.getMessage();failed.accept(failure);}}
  },"packing-aac");thread.start();
 }
 boolean ready(){synchronized(samples){return failure.isEmpty()&&format!=null&&!samples.isEmpty()&&System.nanoTime()/1000-last<500000;}}
 Clip clip(long start,long end)throws Exception{
  synchronized(samples){List<Sample> copy=new ArrayList<>();for(Sample s:samples)if(s.mono>=start&&s.mono<=end)copy.add(s);
   if(!failure.isEmpty()||format==null||copy.isEmpty()||copy.get(0).mono-start>250000||end-copy.get(copy.size()-1).mono>250000)throw new Exception("The microphone recording is incomplete. Pack this parcel again.");return new Clip(format,copy);}
 }
 public void close(){running=false;try{recorder.stop();}catch(Exception ignored){}if(thread!=null)try{thread.join(1500);}catch(InterruptedException e){Thread.currentThread().interrupt();}recorder.release();try{codec.stop();}catch(Exception ignored){}codec.release();}
}
