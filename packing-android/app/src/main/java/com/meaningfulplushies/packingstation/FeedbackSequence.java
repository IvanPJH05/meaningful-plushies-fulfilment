package com.meaningfulplushies.packingstation;
/** The voice is an independent channel. Only errors pause it; successful
 * pairing tones mix over it. Stale speech callbacks cannot resume a new order. */
final class FeedbackSequence {
    interface Output {
        void correctTone();void wrongTone(Runnable done);void speak(String problem,Runnable done);
        void startVoice(String orderId);void pauseVoice();void resumeVoice();void stopVoice();void stopAlerts();void busy(boolean value);
    }
    private final Output output;private long generation;private boolean errorActive;private String orderId="";
    FeedbackSequence(Output output){this.output=output;}
    boolean isBusy(){return errorActive;}
    void order(String id){stop();orderId=id==null?"":id;if(!orderId.isEmpty())output.startVoice(orderId);}
    void replay(String id){order(id);}
    void result(boolean correct,String problem,String matchedOrder){
        if(correct){output.correctTone();return;}
        generation++;long run=generation;output.stopAlerts();
        boolean resume=!orderId.isEmpty()&&orderId.equals(matchedOrder);
        if(resume)output.pauseVoice();else{output.stopVoice();orderId="";}
        errorActive=true;output.busy(true);String pausedOrder=orderId;
        output.wrongTone(once(run,()->output.speak(problem,once(run,()->{
            errorActive=false;output.busy(false);
            if(resume&&orderId.equals(pausedOrder))output.resumeVoice();
        }))));
    }
    private Runnable once(long run,Runnable action){return new Runnable(){boolean called;public void run(){if(called||run!=generation)return;called=true;action.run();}};}
    void stop(){generation++;output.stopAlerts();output.stopVoice();orderId="";if(errorActive){errorActive=false;output.busy(false);}}
}
