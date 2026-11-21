package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.media.*;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.Collections;
import java.util.Locale;

/** Separate voice and feedback channels: correct tones mix, errors pause. */
final class PackingFeedback implements AutoCloseable {
    interface Listener {void busy(boolean busy);void notice(String message);}
    interface VoiceSource {void configure(MediaPlayer player,String id) throws Exception;}
    private final Context context;private final Listener listener;private final VoiceSource source;
    private final Handler main=new Handler(Looper.getMainLooper());private final AudioManager manager;private final FeedbackSequence sequence;
    private TextToSpeech speech;private ToneGenerator tones;private MediaPlayer player;private AudioFocusRequest focus;
    private boolean speechReady,speechInitialised,closed,prepared,voicePaused,alertActive;
    private int alertEpoch,voiceEpoch,focusEpoch;private Runnable alertTimeout,voiceTimeout,speechDone;private String speechId="";
    PackingFeedback(Context context,Listener listener){this(context,listener,(player,id)->{
        String token=SessionStore.token(context);if(token.isEmpty())throw new Exception("Sign in again to play order audio.");
        player.setDataSource(context,Uri.parse(PackingApi.BASE+"/api/mobile/orders/"+PackingApi.encode(id)+"/assets?kind=voice"),Collections.singletonMap("Authorization","Bearer "+token));
    });}
    PackingFeedback(Context context,Listener listener,VoiceSource source){
        this.context=context;this.listener=listener;this.source=source;manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        sequence=new FeedbackSequence(new FeedbackSequence.Output(){
            public void correctTone(){tone(true,()->{alertActive=false;releaseFocusIfIdle();});}
            public void wrongTone(Runnable done){tone(false,done);}
            public void speak(String problem,Runnable done){speakProblem(problem,done,0);}
            public void startVoice(String id){playVoice(id);}
            public void pauseVoice(){pauseOrderVoice();}
            public void resumeVoice(){resumeOrderVoice();}
            public void stopVoice(){releaseVoice();}
            public void stopAlerts(){stopAlertsOutput();}
            public void busy(boolean busy){listener.busy(busy);}
        });
        try{tones=new ToneGenerator(AudioManager.STREAM_MUSIC,85);}catch(RuntimeException error){listener.notice("Feedback sounds are unavailable. Check tablet audio settings.");}
        try{speech=new TextToSpeech(context,status->main.post(()->{
            if(closed)return;speechInitialised=true;
            try{if(status==TextToSpeech.SUCCESS){int language=speech.setLanguage(Locale.ENGLISH);speechReady=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;speech.setAudioAttributes(attributes());
                if(speech.getVoices()!=null)for(android.speech.tts.Voice voice:speech.getVoices())if(voice.getLocale().getLanguage().equals("en")&&!voice.isNetworkConnectionRequired()){speech.setVoice(voice);speechReady=true;break;}
                speech.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){main.post(()->speechFinished(id,false));}public void onError(String id){main.post(()->speechFinished(id,true));}public void onError(String id,int code){main.post(()->speechFinished(id,true));}});
            }}catch(RuntimeException error){speechReady=false;}
            if(!speechReady)listener.notice("Spoken alerts are unavailable. Enable an English text-to-speech voice in tablet settings.");
        }));}catch(RuntimeException error){speechInitialised=true;listener.notice("Spoken alerts are unavailable. Check tablet text-to-speech settings.");}
    }
    private AudioAttributes attributes(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();}
    void playOrder(String id){if(!closed)sequence.order(id);}
    void result(boolean correct,String problem,String orderId){if(!closed)sequence.result(correct,problem,orderId);}
    void replay(String id){if(!closed)sequence.replay(id);}
    boolean isBusy(){return sequence.isBusy();}
    void stop(){sequence.stop();}
    boolean isVoicePlaying(){try{return player!=null&&prepared&&player.isPlaying();}catch(RuntimeException ignored){return false;}}
    int voicePosition(){try{return player!=null&&prepared?player.getCurrentPosition():0;}catch(RuntimeException ignored){return 0;}}
    private boolean acquireFocus(){
        if(focus!=null)return true;final int current=++focusEpoch;
        AudioFocusRequest request=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes()).setOnAudioFocusChangeListener(change->{if(current!=focusEpoch)return;if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT){sequence.stop();listener.notice("Playback stopped because another app needs audio. Replay the order audio before continuing.");}},main).build();
        if(manager.requestAudioFocus(request)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){listener.notice("Audio is in use by another app. Stop it and replay the order audio.");return false;}
        focus=request;if(manager.getStreamVolume(AudioManager.STREAM_MUSIC)==0)listener.notice("Tablet media volume is muted. Turn it up to hear pairing feedback and order audio.");return true;
    }
    private void releaseFocusIfIdle(){if(player==null&&!alertActive&&focus!=null){focusEpoch++;AudioFocusRequest old=focus;focus=null;manager.abandonAudioFocusRequest(old);}}
    private void later(int current,long delay,Runnable action){if(alertTimeout!=null)main.removeCallbacks(alertTimeout);alertTimeout=()->{if(current==alertEpoch&&!closed){alertTimeout=null;action.run();}};main.postDelayed(alertTimeout,delay);}
    private void tone(boolean correct,Runnable done){
        int current=++alertEpoch;alertActive=true;if(!acquireFocus()){alertActive=false;if(correct)done.run();else sequence.stop();return;}
        int duration=correct?180:350;
        try{if(tones==null||!tones.startTone(correct?ToneGenerator.TONE_PROP_ACK:ToneGenerator.TONE_PROP_NACK,duration))listener.notice("Feedback sound could not play. Check tablet media volume.");}catch(RuntimeException error){listener.notice("Feedback sound could not play. Check tablet audio settings.");}
        later(current,duration+60,done);
    }
    private void speakProblem(String problem,Runnable done,int waited){
        int current=++alertEpoch;
        if(!speechInitialised&&waited<4000){later(current,100,()->speakProblem(problem,done,waited+100));return;}
        if(!speechReady||speech==null){listener.notice("Spoken alert could not play. Read the problem on screen; enable English text-to-speech in tablet settings.");alertActive=false;done.run();releaseFocusIfIdle();return;}
        speechId="packing-error-"+current;speechDone=done;
        if(speech.speak(problem,TextToSpeech.QUEUE_FLUSH,null,speechId)==TextToSpeech.ERROR){speechFinished(speechId,true);return;}
        later(current,20000,()->{speech.stop();speechFinished(speechId,true);});
    }
    private void speechFinished(String id,boolean failed){
        if(!id.equals(speechId)||speechDone==null||closed)return;
        Runnable done=speechDone;speechDone=null;speechId="";if(alertTimeout!=null){main.removeCallbacks(alertTimeout);alertTimeout=null;}
        alertActive=false;if(failed)listener.notice("The spoken alert could not finish. Read the problem on screen.");done.run();releaseFocusIfIdle();
    }
    private void playVoice(String id){
        releaseVoice();int current=++voiceEpoch;voicePaused=false;if(!acquireFocus())return;
        try{player=new MediaPlayer();MediaPlayer active=player;active.setAudioAttributes(attributes());source.configure(active,id);
            active.setOnPreparedListener(p->{if(current!=voiceEpoch||closed)return;if(voiceTimeout!=null){main.removeCallbacks(voiceTimeout);voiceTimeout=null;}prepared=true;if(!voicePaused)startPreparedVoice();});
            active.setOnCompletionListener(p->{if(current==voiceEpoch&&!closed)releaseVoice();});
            active.setOnErrorListener((p,what,extra)->{if(current==voiceEpoch&&!closed){listener.notice("This order's voice recording could not play. Check its audio and use Replay order audio.");releaseVoice();}return true;});
            voiceTimeout=()->{if(current==voiceEpoch&&!closed){listener.notice("Order audio could not load. Check Wi-Fi and use Replay order audio.");releaseVoice();}};main.postDelayed(voiceTimeout,20000);active.prepareAsync();
        }catch(Exception error){listener.notice("This order's voice recording could not play. Check its audio and use Replay order audio.");releaseVoice();}
    }
    private void startPreparedVoice(){if(player==null||!prepared||voicePaused)return;try{player.start();}catch(RuntimeException error){listener.notice("Order audio could not resume. Use Replay order audio to try again.");releaseVoice();}}
    private void pauseOrderVoice(){voicePaused=true;if(player!=null&&prepared)try{if(player.isPlaying())player.pause();}catch(RuntimeException error){listener.notice("Order audio could not pause safely. Replay it after checking the error.");releaseVoice();}}
    private void resumeOrderVoice(){voicePaused=false;startPreparedVoice();}
    private void releaseVoice(){voiceEpoch++;if(voiceTimeout!=null){main.removeCallbacks(voiceTimeout);voiceTimeout=null;}if(player!=null){player.release();player=null;}prepared=false;voicePaused=false;releaseFocusIfIdle();}
    private void stopAlertsOutput(){alertEpoch++;if(alertTimeout!=null){main.removeCallbacks(alertTimeout);alertTimeout=null;}speechDone=null;speechId="";if(speech!=null)try{speech.stop();}catch(RuntimeException ignored){}if(tones!=null)tones.stopTone();alertActive=false;releaseFocusIfIdle();}
    public void close(){closed=true;sequence.stop();if(speech!=null){speech.shutdown();speech=null;}if(tones!=null){tones.release();tones=null;}}
}
