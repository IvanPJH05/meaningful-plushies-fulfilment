package com.meaningfulplushies.packingstation;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class FeedbackSequenceTest {
    static final class Speaker implements FeedbackSequence.Output {
        List<String> events=new ArrayList<>();Runnable tone,speech,voice;
        public void tone(boolean correct,Runnable done){events.add(correct?"correct":"wrong");tone=done;}
        public void speak(String problem,Runnable done){events.add("speak:"+problem);speech=done;}
        public void voice(String id,Runnable done){events.add("voice:"+id);voice=done;}
        public void stop(){}
        public void busy(boolean busy){}
    }
    @Test public void correctToneCompletesBeforeOrderAudioAndNeverSpeaksSuccess(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(true,"","order-one");
        assertTrue(flow.isBusy());assertEquals(Arrays.asList("correct"),out.events);
        out.tone.run();assertEquals(Arrays.asList("correct","voice:order-one"),out.events);assertTrue(flow.isBusy());
        out.voice.run();assertFalse(flow.isBusy());assertNull(out.speech);
    }
    @Test public void wrongToneThenEntireProblemThenExactOrderAudio(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(false,"Wrong card","order-two");
        assertEquals(Arrays.asList("wrong"),out.events);out.tone.run();
        assertEquals(Arrays.asList("wrong","speak:Wrong card"),out.events);assertNull(out.voice);
        out.speech.run();assertEquals(Arrays.asList("wrong","speak:Wrong card","voice:order-two"),out.events);
        out.voice.run();assertFalse(flow.isBusy());
    }
    @Test public void stoppingOrReplacingSpeechCannotPlayAnOldOrdersRecording(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(false,"Wrong card","old-order");out.tone.run();Runnable oldSpeech=out.speech;
        flow.stop();oldSpeech.run();assertNull(out.voice);assertFalse(flow.isBusy());
        flow.result(false,"Other problem","second-old-order");out.tone.run();oldSpeech=out.speech;
        flow.result(true,"","new-order");oldSpeech.run();assertNull(out.voice);out.tone.run();assertEquals("voice:new-order",out.events.get(out.events.size()-1));
    }
    @Test public void repeatedCompletionsNeverDuplicateTheVoiceOrUnlockANewerSequence(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(true,"","first");Runnable firstTone=out.tone;firstTone.run();firstTone.run();assertEquals(2,out.events.size());Runnable firstVoice=out.voice;
        flow.result(true,"","second");firstVoice.run();assertTrue(flow.isBusy());out.tone.run();out.voice.run();assertFalse(flow.isBusy());
    }
    @Test public void unrecognisedOrdersOnlySpeakTheErrorAndNeverReuseAnEarlierOrder(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(false,"Order not found","");out.tone.run();out.speech.run();assertNull(out.voice);assertFalse(flow.isBusy());
    }
    @Test public void rawServerCodesBecomeSafeSpokenInstructions(){
        assertTrue(PairingProblem.explain("NFC_CARD_ALREADY_ASSIGNED").contains("different order"));
        assertTrue(PairingProblem.explain("NFC_CARD_NOT_PROGRAMMED").contains("not been written"));
        assertTrue(PairingProblem.explain("Unable to resolve host").contains("Wi-Fi"));
        assertEquals("Scan this order barcode.",PairingProblem.explain("Scan this order barcode."));
        assertFalse(PairingProblem.explain("SQL permission denied: https://private/token").contains("private"));
    }
}
