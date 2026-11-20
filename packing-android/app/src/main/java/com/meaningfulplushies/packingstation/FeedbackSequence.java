package com.meaningfulplushies.packingstation;

/** Serialises pairing feedback. Stale callbacks cannot play a previous order. */
final class FeedbackSequence {
    interface Output {
        void tone(boolean correct,Runnable finished);
        void speak(String problem,Runnable finished);
        void voice(String orderId,Runnable finished);
        void stop();
        void busy(boolean value);
    }
    private final Output output;
    private long generation;
    private boolean busy;
    FeedbackSequence(Output output){this.output=output;}
    boolean isBusy(){return busy;}
    void result(boolean correct,String problem,String orderId){
        stop();long run=++generation;busy=true;output.busy(true);
        output.tone(correct,once(run,()->{
            if(correct)voice(run,orderId);
            else output.speak(problem,once(run,()->voice(run,orderId)));
        }));
    }
    void replay(String orderId){stop();long run=++generation;busy=true;output.busy(true);voice(run,orderId);}
    private void voice(long run,String orderId){
        if(orderId==null||orderId.isEmpty()){finish(run);return;}
        output.voice(orderId,once(run,()->finish(run)));
    }
    private Runnable once(long run,Runnable action){
        return new Runnable(){boolean called;public void run(){if(called||run!=generation)return;called=true;action.run();}};
    }
    private void finish(long run){if(run!=generation)return;busy=false;output.stop();output.busy(false);}
    void stop(){generation++;output.stop();if(busy){busy=false;output.busy(false);}}
}
