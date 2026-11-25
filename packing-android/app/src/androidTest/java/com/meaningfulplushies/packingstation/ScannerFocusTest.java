package com.meaningfulplushies.packingstation;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Handler;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class ScannerFocusTest {
    private static void set(Object target,String name,Object value)throws Exception{Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
    private static Object get(Object target,String name)throws Exception{Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);return field.get(target);}
    private static void send(MainActivity activity,String code){for(KeyEvent event:KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD).getEvents((code+"\n").toCharArray()))activity.dispatchKeyEvent(event);}
    @Test public void firstScanIsCapturedWithAButtonFocusedAndWhileInputIsDisabled()throws Exception{
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.waitForIdleSync();
        try{instrumentation.runOnMainSync(()->{try{
            ((Handler)get(activity,"ui")).removeCallbacksAndMessages(null);
            LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);
            EditText input=new EditText(activity);input.setSingleLine(true);input.setShowSoftInputOnFocus(false);root.addView(input);
            Button other=new Button(activity);other.setText("Another control");other.setFocusableInTouchMode(true);root.addView(other);
            TextView status=new TextView(activity);root.addView(status);activity.setContentView(root);
            set(activity,"scan",input);set(activity,"status",status);set(activity,"cameraState",new TextView(activity));set(activity,"cameraButton",new Button(activity));set(activity,"uploadLabel",new TextView(activity));set(activity,"serviceReady",false);
            other.requestFocus();assertTrue(other.hasFocus());input.setEnabled(false);
        }catch(Exception error){throw new AssertionError(error);}});
        // setContentView needs a window/layout turn before real keyboard events
        // can be dispatched. Do not manufacture input into an unfocused window.
        instrumentation.waitForIdleSync();
        long deadline=System.currentTimeMillis()+4000;
        while(!activity.hasWindowFocus()&&System.currentTimeMillis()<deadline)Thread.sleep(50);
        instrumentation.runOnMainSync(()->{try{
            assertTrue("The test window must own input",activity.hasWindowFocus());
            EditText input=(EditText)get(activity,"scan");TextView status=(TextView)get(activity,"status");
            send(activity,"MPI-2082");assertTrue("One complete scan must reach submit without a focus click",status.getText().toString().contains("Check the connection"));assertEquals("",input.getText().toString());
            set(activity,"savingLocal",true);input.clearFocus();send(activity,"MPI-2083");send(activity,"NFC-100332");
            ScannerInput saved=(ScannerInput)get(activity,"scannerInput");assertEquals(2,saved.waiting());assertEquals("MPI-2083",saved.poll());assertEquals("NFC-100332",saved.poll());
        }catch(Exception error){throw new AssertionError(error);}});
        }finally{instrumentation.runOnMainSync(()->{try{set(activity,"scan",null);}catch(Exception ignored){}activity.finish();});}
    }
}
