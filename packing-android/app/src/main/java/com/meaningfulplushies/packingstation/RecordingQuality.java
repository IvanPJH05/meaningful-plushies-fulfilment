package com.meaningfulplushies.packingstation;

/** Shared capture and queue limits: three minutes of 2K H.264 plus AAC. */
final class RecordingQuality {
    static final long MAX_FILE_BYTES=200L*1024*1024;
    static final long MAX_VIDEO_BYTES=196L*1024*1024;
    static final long MAX_RING_BYTES=24L*1024*1024;
    static boolean allowed(int width,int height){return width>0&&height>0&&width<=2560&&height<=1440;}
    static int bitrate(int width,int height){long pixels=(long)width*height;return pixels>1920L*1080?8_000_000:pixels>1280L*720?6_000_000:4_000_000;}
    static long preference(int width,int height,boolean mjpeg){return (long)width*height*2+(mjpeg?1:0);}
}
