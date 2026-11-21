package com.meaningfulplushies.packingstation;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class FeedbackSequenceTest {
    static final class Speaker implements FeedbackSequence.Output {
        List<String> events=new ArrayList<>();Runnable wrong,speech;boolean paused;int position;int starts,resumes;
        public void correctTone(){events.add("correct");}
        public void wrongTone(Runnable done){events.add("wrong");wrong=done;}
        public void speak(String problem,Runnable done){events.add("speak:"+problem);speech=done;}
        public void startVoice(String id){events.add("voice:"+id);starts++;position=0;paused=false;}
        public void pauseVoice(){events.add("pause");paused=true;}
        public void resumeVoice(){events.add("resume");paused=false;resumes++;}
        public void stopVoice(){events.add("stop-voice");}
        public void stopAlerts(){}
        public void busy(boolean value){}
    }
    @Test public void orderScanStartsAudioAndCorrectToneNeverPausesOrRestartsIt(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.order("one");out.position=1250;flow.result(true,"","one");
        assertEquals(Arrays.asList("stop-voice","voice:one","correct"),out.events);assertFalse(out.paused);assertEquals(1250,out.position);assertEquals(1,out.starts);assertFalse(flow.isBusy());assertNull(out.speech);
    }
    @Test public void errorPausesThenSpeaksThenResumesAtTheExactPosition(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.order("two");out.position=2200;flow.result(false,"Wrong card","two");
        assertTrue(flow.isBusy());assertTrue(out.paused);assertEquals(2200,out.position);assertEquals("wrong",out.events.get(out.events.size()-1));assertEquals(0,out.resumes);
        out.wrong.run();assertEquals("speak:Wrong card",out.events.get(out.events.size()-1));assertTrue(out.paused);
        out.speech.run();assertFalse(flow.isBusy());assertFalse(out.paused);assertEquals(2200,out.position);assertEquals(1,out.starts);assertEquals(1,out.resumes);
    }
    @Test public void aStoppedOrReplacedErrorCannotResumeAnOldOrder(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.order("old");flow.result(false,"Wrong","old");out.wrong.run();Runnable stale=out.speech;
        flow.order("new");stale.run();assertEquals(0,out.resumes);assertEquals("voice:new",out.events.get(out.events.size()-1));
        flow.result(false,"Other","new");out.wrong.run();stale=out.speech;flow.stop();stale.run();assertEquals(0,out.resumes);assertFalse(flow.isBusy());
    }
    @Test public void duplicateSpeechCallbacksResumeOnlyOnce(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.order("one");flow.result(false,"Wrong","one");out.wrong.run();out.wrong.run();out.speech.run();out.speech.run();assertEquals(1,out.resumes);assertEquals(1,out.starts);
    }
    @Test public void anUnknownOrderCannotLoadOrResumeAnotherRecording(){
        Speaker out=new Speaker();FeedbackSequence flow=new FeedbackSequence(out);flow.result(false,"Order not found","");out.wrong.run();out.speech.run();assertEquals(0,out.starts);assertEquals(0,out.resumes);
        flow.order("one");flow.result(false,"Wrong order","other");out.wrong.run();out.speech.run();assertEquals(1,out.starts);assertEquals(0,out.resumes);
    }
    @Test public void rawServerCodesBecomeSafeSpokenInstructions(){
        assertTrue(PairingProblem.explain("NFC_CARD_ALREADY_ASSIGNED").contains("different order"));assertTrue(PairingProblem.explain("NFC_CARD_NOT_PROGRAMMED").contains("not been written"));assertTrue(PairingProblem.explain("Unable to resolve host").contains("Wi-Fi"));assertEquals("Scan this order barcode.",PairingProblem.explain("Scan this order barcode."));assertFalse(PairingProblem.explain("SQL permission denied: https://private/token").contains("private"));
    }
}
