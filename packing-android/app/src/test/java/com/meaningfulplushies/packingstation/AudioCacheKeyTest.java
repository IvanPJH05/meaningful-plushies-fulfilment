package com.meaningfulplushies.packingstation;
import org.junit.Test;
import static org.junit.Assert.*;
public class AudioCacheKeyTest {
    @Test public void statusAndTrackingEditsKeepTheSameAudio(){assertEquals(AudioCacheKey.revision("source-hash","old"),AudioCacheKey.revision("source-hash","new"));}
    @Test public void replacedRecordingInvalidatesTheOldCopy(){assertNotEquals(AudioCacheKey.revision("old-source","same-date"),AudioCacheKey.revision("new-source","same-date"));}
    @Test public void olderServerStillInvalidatesByOrderRevision(){assertNotEquals(AudioCacheKey.revision("","old"),AudioCacheKey.revision("","new"));}
    @Test public void differentOrdersCannotShareCacheIdentity(){assertFalse(AudioCacheKey.same("2082","audio:hash","2083","audio:hash"));}
}
