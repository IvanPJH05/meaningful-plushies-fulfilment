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

/** All feedback uses tablet media volume and completes before order playback. */
final class PackingFeedback implements AutoCloseable {
    interface Listener {void busy(boolean busy);void notice(String message);}
    private final Context context;
    private final Listener listener;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final AudioManager manager;
    private final FeedbackSequence sequence;
    private TextToSpeech speech;
    private ToneGenerator tones;
    private MediaPlayer player;
    private AudioFocusRequest focus;
    private boolean speechReady,speechInitialised,closed;
    private int step;
    private Runnable timeout,speechDone;
    private String speechId="";
    PackingFeedback(Context context,Listener listener){
        this.context=context;this.listener=listener;manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        sequence=new FeedbackSequence(new FeedbackSequence.Output(){
            public void tone(boolean correct,Runnable done){playTone(correct,done);}
            public void speak(String problem,Runnable done){speakProblem(problem,done,0);}
            public void voice(String id,Runnable done){playVoice(id,done);}
            public void stop(){stopOutput();}
            public void busy(boolean busy){listener.busy(busy);}
        });
        try{tones=new ToneGenerator(AudioManager.STREAM_MUSIC,85);}catch(RuntimeException error){listener.notice("Feedback sounds are unavailable. Check tablet audio settings.");}
        try{speech=new TextToSpeech(context,status->main.post(()->{
            if(closed)return;speechInitialised=true;
            if(status==TextToSpeech.SUCCESS){
                int language=speech.setLanguage(Locale.ENGLISH);speechReady=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;
                speech.setAudioAttributes(attributes());
                if(speech.getVoices()!=null)for(android.speech.tts.Voice voice:speech.getVoices())if(voice.getLocale().getLanguage().equals("en")&&!voice.isNetworkConnectionRequired()){speech.setVoice(voice);speechReady=true;break;}
                speech.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                    public void onStart(String id){}
                    public void onDone(String id){main.post(()->speechFinished(id,false));}
                    public void onError(String id){main.post(()->speechFinished(id,true));}
                    public void onError(String id,int code){main.post(()->speechFinished(id,true));}
                });
            }
            if(!speechReady)listener.notice("Spoken alerts are unavailable. Enable an English text-to-speech voice in tablet settings.");
        }));}catch(RuntimeException error){speechInitialised=true;listener.notice("Spoken alerts are unavailable. Check tablet text-to-speech settings.");}
    }
    private AudioAttributes attributes(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();}
    void result(boolean correct,String problem,String orderId){if(!closed)sequence.result(correct,problem,orderId);}
    void replay(String orderId){if(!closed)sequence.replay(orderId);}
    boolean isBusy(){return sequence.isBusy();}
    void stop(){sequence.stop();}
    private boolean acquireFocus(){
        if(focus!=null)return true;
        AudioFocusRequest request=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes()).setOnAudioFocusChangeListener(change->{if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT){sequence.stop();listener.notice("Playback stopped because another app needs audio. Replay the order audio before continuing.");}},main).build();
        if(manager.requestAudioFocus(request)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){listener.notice("Audio is in use by another app. Stop it and replay the order audio.");return false;}
        focus=request;if(manager.getStreamVolume(AudioManager.STREAM_MUSIC)==0)listener.notice("Tablet media volume is muted. Turn it up to hear pairing feedback and order audio.");return true;
    }
    private void later(int current,long delay,Runnable action){
        if(timeout!=null)main.removeCallbacks(timeout);timeout=()->{if(current==step&&!closed){timeout=null;action.run();}};main.postDelayed(timeout,delay);
    }
    private void playTone(boolean correct,Runnable done){
        int current=++step;if(!acquireFocus()){sequence.stop();return;}
        int duration=correct?180:350;
        if(tones!=null)try{if(!tones.startTone(correct?ToneGenerator.TONE_PROP_ACK:ToneGenerator.TONE_PROP_NACK,duration))listener.notice("Feedback sound could not play. Check tablet media volume.");}catch(RuntimeException error){listener.notice("Feedback sound could not play. Check tablet media volume.");}
        later(current,duration+60,done);
    }
    private void speakProblem(String problem,Runnable done,int waited){
        int current=++step;
        if(!speechInitialised&&waited<4000){later(current,100,()->speakProblem(problem,done,waited+100));return;}
        if(!speechReady||speech==null){listener.notice("Spoken alert could not play. Read the problem on screen; enable English text-to-speech in tablet settings.");done.run();return;}
        speechId="packing-feedback-"+current;speechDone=done;
        if(speech.speak(problem,TextToSpeech.QUEUE_FLUSH,null,speechId)==TextToSpeech.ERROR){speechFinished(speechId,true);return;}
        later(current,20000,()->{speech.stop();speechFinished(speechId,true);});
    }
    private void speechFinished(String id,boolean failed){
        if(!id.equals(speechId)||speechDone==null||closed)return;
        Runnable done=speechDone;speechDone=null;speechId="";if(timeout!=null){main.removeCallbacks(timeout);timeout=null;}
        if(failed)listener.notice("The spoken alert could not finish. Read the problem on screen.");done.run();
    }
    private void playVoice(String id,Runnable done){
        int current=++step;if(!acquireFocus()){sequence.stop();return;}
        if(SessionStore.token(context).isEmpty()){listener.notice("Sign in again to play this order's voice recording.");done.run();return;}
        try{
            player=new MediaPlayer();MediaPlayer active=player;active.setAudioAttributes(attributes());
            active.setDataSource(context,Uri.parse(PackingApi.BASE+"/api/mobile/orders/"+PackingApi.encode(id)+"/assets?kind=voice"),Collections.singletonMap("Authorization","Bearer "+SessionStore.token(context)));
            active.setOnPreparedListener(p->{if(current!=step||closed)return;if(timeout!=null){main.removeCallbacks(timeout);timeout=null;}try{p.start();}catch(RuntimeException error){listener.notice("Order audio could not start. Use Replay order audio to try again.");done.run();}});
            active.setOnCompletionListener(p->{if(current==step&&!closed)done.run();});
            active.setOnErrorListener((p,what,extra)->{if(current==step&&!closed){listener.notice("This order's voice recording could not play. Check its audio and use Replay order audio.");done.run();}return true;});
            later(current,20000,()->{listener.notice("Order audio could not load. Check Wi-Fi and use Replay order audio.");done.run();});active.prepareAsync();
        }catch(Exception error){listener.notice("This order's voice recording could not play. Check its audio and use Replay order audio.");done.run();}
    }
    private void stopOutput(){
        step++;if(timeout!=null){main.removeCallbacks(timeout);timeout=null;}speechDone=null;speechId="";
        if(speech!=null)try{speech.stop();}catch(RuntimeException ignored){}
        if(tones!=null)tones.stopTone();if(player!=null){player.release();player=null;}
        if(focus!=null){manager.abandonAudioFocusRequest(focus);focus=null;}
    }
    public void close(){closed=true;sequence.stop();if(speech!=null){speech.shutdown();speech=null;}if(tones!=null){tones.release();tones=null;}}
}
