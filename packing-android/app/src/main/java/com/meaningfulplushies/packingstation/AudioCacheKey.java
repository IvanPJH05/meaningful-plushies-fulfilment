package com.meaningfulplushies.packingstation;
final class AudioCacheKey {
    static String revision(String audioRevision,String updatedAt){return audioRevision!=null&&!audioRevision.isEmpty()?"audio:"+audioRevision:"order:"+updatedAt;}
    static boolean same(String id,String revision,String otherId,String otherRevision){return id.equals(otherId)&&revision.equals(otherRevision);}
}
