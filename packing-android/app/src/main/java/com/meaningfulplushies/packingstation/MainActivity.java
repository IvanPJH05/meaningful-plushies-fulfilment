package com.meaningfulplushies.packingstation;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.hardware.usb.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.view.inputmethod.*;
import android.widget.*;
import com.herohan.uvcapp.*;
import com.serenegiant.usb.Size;
import org.json.JSONObject;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final int NAVY=Color.rgb(20,38,60),BLUE=Color.rgb(37,99,235),MUTED=Color.rgb(98,119,142);
    private EditText scan;private TextView cameraState,status,orderLabel,uploadLabel;private TextureView preview;
    private TextView connectionLabel;private boolean serviceReady=false;
    private Button cameraButton;private boolean networkBusy=false,savingLocal=false,cameraRequested=false,foreground=false;
    private int previewWidth,previewHeight,previewDisplay=-1,previewCorrection;private String previewKey="";private Button rotateCameraButton;
    private TabletCamera tabletCamera;private String activeCamera="Camera";private int videoRotation,clipRotation;
    private ICameraHelper helper;private UsbDevice selectedUsb;private RollingEncoder encoder;
    private PackingFeedback feedback;private TextView audioLabel;private String lastOrderId="";private boolean audioWarning;
    private JSONObject pendingOrder;private String pendingBarcode="",pendingCard="";private long pendingUntil;
    private PacketRing.Capture capture;private JSONObject clipOrder;private String clipBarcode,clipCard,clipId;
    private long scanAtMono,scanAtEpoch;private int ticks=0;
    private final Runnable heartbeat=new Runnable(){public void run(){if(!foreground)return;if(preview!=null&&preview.getDisplay()!=null&&preview.getDisplay().getRotation()!=previewDisplay)refreshCameraPreview();refreshState();if(++ticks%60==0)UploadWorker.enqueue(MainActivity.this);ui.postDelayed(this,250);}};

    @Override public void onCreate(Bundle state){super.onCreate(state);feedback=new PackingFeedback(this,new PackingFeedback.Listener(){public void busy(boolean busy){if(audioLabel!=null&&!audioWarning)audioLabel.setText(busy?"Playing pairing feedback / order audio...":"Audio finished. Check the plushie before continuing.");refreshState();focusScan();}public void notice(String message){audioWarning=true;if(audioLabel!=null){audioLabel.setText(message);audioLabel.setTextColor(Color.rgb(170,45,45));}}});getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(SessionStore.token(this).isEmpty())loginScreen();else stationScreen();}
    @Override public void onStart(){super.onStart();foreground=true;ui.post(heartbeat);}
    @Override public void onStop(){foreground=false;ui.removeCallbacks(heartbeat);if(feedback!=null)feedback.stop();stopCamera("Webcam stopped because the app left the packing screen. Reconnect before scanning.");super.onStop();}
    @Override public void onDestroy(){if(feedback!=null)feedback.close();if(helper!=null)helper.release();io.shutdown();super.onDestroy();}
    private int dp(float value){return (int)(value*getResources().getDisplayMetrics().density+.5f);}
    private GradientDrawable background(int color){GradientDrawable drawable=new GradientDrawable();drawable.setColor(color);drawable.setCornerRadius(dp(16));return drawable;}
    private TextView text(String value,int size,int color){TextView view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setPadding(0,dp(5),0,dp(5));return view;}
    private TextView title(String value,int size){TextView view=text(value,size,NAVY);view.setTypeface(null,android.graphics.Typeface.BOLD);return view;}
    private LinearLayout column(){LinearLayout view=new LinearLayout(this);view.setOrientation(LinearLayout.VERTICAL);return view;}
    private LinearLayout card(){LinearLayout view=column();view.setPadding(dp(22),dp(18),dp(22),dp(18));view.setBackground(background(Color.WHITE));LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.setMargins(0,dp(12),0,dp(12));view.setLayoutParams(params);return view;}
    private Button button(String label,Runnable action){Button button=new Button(this);button.setText(label);button.setAllCaps(false);button.setTextColor(Color.WHITE);button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(BLUE));button.setOnClickListener(v->action.run());return button;}
    private EditText field(String hint,boolean password){EditText field=new EditText(this);field.setSingleLine(true);field.setHint(hint);field.setTextSize(18);field.setPadding(dp(14),dp(12),dp(14),dp(12));field.setBackground(background(Color.rgb(241,245,250)));if(password)field.setInputType(129);return field;}
    private LinearLayout root(){ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(242,246,251));LinearLayout root=column();root.setPadding(dp(26),dp(20),dp(26),dp(20));scroll.addView(root);setContentView(scroll);return root;}

    private void loginScreen(){
        serviceReady=false;lastOrderId="";audioLabel=null;pendingOrder=null;pendingCard="";scan=null;LinearLayout root=root();root.addView(title("MEANINGFUL PLUSHIES",15));root.addView(title("Packing Station · 1.4",32));root.addView(text("A dedicated station for your Bluetooth scanner and USB webcam.",16,MUTED));
        LinearLayout box=card();root.addView(box);box.addView(title("Staff sign-in",23));EditText name=field("Username",false),password=field("Password",true);box.addView(name);box.addView(password);TextView message=text("Use your existing fulfilment staff account.",15,MUTED);box.addView(message);
        Button sign=button("Sign in",()->{});box.addView(sign);sign.setOnClickListener(v->{sign.setEnabled(false);message.setText("Signing in...");io.execute(()->{try{JSONObject result=new PackingApi("").request("/api/mobile/login",new JSONObject().put("username",name.getText().toString().trim()).put("password",password.getText().toString()));SessionStore.save(this,result.getString("token"));getSharedPreferences("station",MODE_PRIVATE).edit().putString("staff",result.optString("displayName","Staff")).apply();runOnUiThread(()->{password.setText("");stationScreen();UploadWorker.enqueue(this);});}catch(Exception error){runOnUiThread(()->{message.setText(error.getMessage());sign.setEnabled(true);});}});});
    }

    private void stationScreen(){
        pendingOrder=null;pendingCard="";LinearLayout root=root();root.addView(title("MEANINGFUL PLUSHIES  /  LIVE PACKING · 1.4",14));root.addView(title("Scan. Check. Pack.",32));root.addView(text("Packed only after the matching ID card is paired and its packing video is saved online.",15,MUTED));
        connectionLabel=text("Checking order service...",15,MUTED);root.addView(connectionLabel);root.addView(button("Check connection",this::checkConnection));
        LinearLayout row=new LinearLayout(this);row.setOrientation(getResources().getConfiguration().screenWidthDp>=850?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL);root.addView(row);
        LinearLayout left=card(),right=card();if(row.getOrientation()==LinearLayout.HORIZONTAL){left.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));right.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));((LinearLayout.LayoutParams)right.getLayoutParams()).leftMargin=dp(18);}row.addView(left);row.addView(right);
        left.addView(title("Camera",22));cameraState=text("CAMERA OFF",14,MUTED);left.addView(cameraState);preview=new TextureView(this);preview.setOpaque(false);FrameLayout cameraFrame=new FrameLayout(this);cameraFrame.setBackgroundColor(Color.BLACK);cameraFrame.addView(preview,new FrameLayout.LayoutParams(-1,-1));left.addView(cameraFrame,new LinearLayout.LayoutParams(-1,dp(280)));preview.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->refreshCameraPreview());
        preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){public void onSurfaceTextureAvailable(SurfaceTexture s,int w,int h){if(helper!=null&&helper.isCameraOpened())helper.addSurface(s,false);}public void onSurfaceTextureSizeChanged(SurfaceTexture s,int w,int h){if(previewWidth>0)s.setDefaultBufferSize(previewWidth,previewHeight);refreshCameraPreview();}public boolean onSurfaceTextureDestroyed(SurfaceTexture s){stopCamera("Camera preview closed. Reconnect before scanning.");return true;}public void onSurfaceTextureUpdated(SurfaceTexture s){}});
        cameraButton=button("Choose camera",this::connectCamera);left.addView(cameraButton);rotateCameraButton=button("Rotate camera 90°",()->{if(encoder==null)return;previewCorrection=(previewCorrection+90)%360;getSharedPreferences("station",MODE_PRIVATE).edit().putInt(previewKey,previewCorrection).apply();refreshCameraPreview();});left.addView(rotateCameraButton);left.addView(text("3 seconds before the matching scan + 20 seconds after. Video only; no microphone.",14,MUTED));
        right.addView(title("Barcode scanner",22));orderLabel=title("Waiting for an order",23);right.addView(orderLabel);scan=field("Scan order or ID-card barcode",false);scan.setShowSoftInputOnFocus(false);scan.setImeOptions(EditorInfo.IME_ACTION_DONE);scan.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(512)});right.addView(scan);
        scan.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_DONE || (event!=null&&event.getKeyCode()==KeyEvent.KEYCODE_ENTER&&event.getAction()==KeyEvent.ACTION_DOWN)){submit();return true;}return false;});scan.setOnKeyListener((v,key,event)->{if(key==KeyEvent.KEYCODE_ENTER&&event.getAction()==KeyEvent.ACTION_DOWN){submit();return true;}return false;});
        right.addView(button("Submit scan",this::submit));status=text("Choose a camera, wait for READY, then scan the order and its matching ID card.",17,MUTED);right.addView(status);
        Button keyboard=button("Type a code manually",()->{scan.setShowSoftInputOnFocus(true);scan.requestFocus();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(scan,InputMethodManager.SHOW_IMPLICIT);});right.addView(keyboard);
        audioLabel=text("Pairing sounds and spoken problems use tablet media volume.",14,MUTED);right.addView(audioLabel);right.addView(button("Stop audio",()->{feedback.stop();if(audioLabel!=null)audioLabel.setText("Audio stopped.");focusScan();}));right.addView(button("Replay order audio",()->{if(lastOrderId.isEmpty()){tell("Scan a recognised order first.");return;}if(feedback.isBusy()){tell("Wait for the pairing feedback, or press Stop audio first.");return;}audioWarning=false;audioLabel.setTextColor(MUTED);feedback.replay(lastOrderId);}));
        LinearLayout uploads=card();root.addView(uploads);uploads.addView(title("Video uploads",21));uploadLabel=text("",15,MUTED);uploads.addView(uploadLabel);uploads.addView(button("Retry uploads now",()->{UploadWorker.enqueue(this);tell("Retry requested. Local videos stay safe until the server confirms saving.");}));
        LinearLayout actions=new LinearLayout(this);root.addView(actions);actions.addView(button("Bluetooth settings",()->startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS))));actions.addView(button("Sign out",()->{if(capture!=null||savingLocal||networkBusy){tell("Finish this parcel before signing out.");return;}feedback.stop();stopCamera("");SessionStore.clear(this);loginScreen();}));
        root.setOnClickListener(v->focusScan());focusScan();refreshState();checkConnection();
    }

    private void checkConnection(){
        if(scan==null||networkBusy||capture!=null||savingLocal)return;
        networkBusy=true;serviceReady=false;connectionLabel.setText("Connecting to live order database and private video storage...");refreshState();
        io.execute(()->{try{JSONObject result=new PackingApi(SessionStore.token(this)).request(PackingApi.PACKING,null);
            if(!result.optBoolean("connected")||result.optInt("protocol")!=2||!result.optBoolean("packingRequiresSavedVideo"))throw new Exception("The packing service needs an update. Contact the administrator.");
            runOnUiThread(()->{if(scan==null)return;serviceReady=true;networkBusy=false;JSONObject staff=result.optJSONObject("staff");connectionLabel.setText("CONNECTED · Live orders and private video storage\nSigned in as "+(staff==null?"Staff":staff.optString("displayName")));connectionLabel.setTextColor(Color.rgb(19,125,84));focusScan();refreshState();});
        }catch(Exception error){runOnUiThread(()->{if(connectionLabel!=null){connectionLabel.setText("NOT CONNECTED · "+error.getMessage());connectionLabel.setTextColor(Color.rgb(170,45,45));}});fail(error);}});
    }
    private void tell(String message){if(status!=null)status.setText(message);}
    private void focusScan(){if(scan!=null&&!networkBusy&&capture==null&&!savingLocal&&!feedback.isBusy()){scan.requestFocus();scan.selectAll();}}
    private void refreshState(){
        if(scan==null)return;
        long now=System.nanoTime()/1000;boolean ready=encoder!=null&&encoder.ring.ready(now);
        cameraState.setText(capture!=null?"RECORDING - "+Math.max(0,21-(System.currentTimeMillis()-capture.scanEpochMs)/1000)+"s":ready?"READY - "+activeCamera:encoder!=null?"WARMING UP - 3-second history":"CAMERA OFF");
        cameraState.setTextColor(capture!=null?Color.rgb(170,45,45):ready?Color.rgb(19,125,84):MUTED);
        scan.setEnabled(!networkBusy&&capture==null&&!savingLocal&&!feedback.isBusy());cameraButton.setEnabled(capture==null&&!savingLocal&&!networkBusy);if(rotateCameraButton!=null)rotateCameraButton.setEnabled(encoder!=null&&capture==null&&!savingLocal&&!networkBusy);
        {File[] files=ProofQueue.entries(this);String summary=files.length==0?getSharedPreferences("station",MODE_PRIVATE).getString("lastSaved","No videos waiting to upload."):files.length+" video(s) safely on this tablet, waiting to finish uploading.";
            if(files.length>0)try{String error=ProofQueue.read(files[0]).optString("lastError","");if(!error.isEmpty())summary+="\n"+error;}catch(Exception ignored){}uploadLabel.setText(summary);
        }
        if(clipId!=null&&clipId.equals(getSharedPreferences("station",MODE_PRIVATE).getString("lastPackedProofId",""))&&lastOrderId.equals(clipOrder==null?"":clipOrder.optString("order_id"))){orderLabel.setText("#"+clipOrder.optJSONObject("order").optString("orderNumber")+" - PACKED\nCard paired and packing video saved online.");}
        if(pendingUntil>0 && System.currentTimeMillis()>pendingUntil && !networkBusy && capture==null){pendingOrder=null;pendingCard="";pendingUntil=0;orderLabel.setText("Waiting for an order");tell("Pairing window expired. Scan the order again; its status has not been changed by this scan.");}
    }

    private void submit(){
        if(scan==null||networkBusy||capture!=null||savingLocal||feedback.isBusy())return;if(!serviceReady){pairingProblem(new Exception("Check the connection before scanning live orders."),"");return;}String code=scan.getText().toString().trim().toUpperCase(Locale.ROOT);scan.setText("");if(code.isEmpty())return;
        long mono=System.nanoTime()/1000,epoch=System.currentTimeMillis();
        if(code.matches("NFC-[0-9]{6,12}")||(pendingOrder!=null&&code.matches("[0-9]{6}"))){if(pendingOrder!=null)beginCard(code,mono,epoch);else validateFirstCard(code);return;}
        pendingOrder=null;if(pendingCard.isEmpty())pendingUntil=0;lastOrderId="";networkBusy=true;tell("Finding order...");refreshState();
        io.execute(()->{try{
            PackingApi api=new PackingApi(SessionStore.token(this));JSONObject item=api.request(PackingApi.PACKING+"?scanBarcode="+PackingApi.encode(code),null).optJSONObject("item");
            if(item==null)throw new Exception("Order barcode not recognised. Scan the individual packing-slip barcode.");
            JSONObject found=item;runOnUiThread(()->{networkBusy=false;pendingOrder=found;lastOrderId=found.optString("order_id");pendingBarcode=code;pendingUntil=System.currentTimeMillis()+60000;JSONObject order=found.optJSONObject("order");orderLabel.setText("#"+order.optString("orderNumber")+" - "+order.optString("status").replace('_',' ').toUpperCase(Locale.ROOT)+"\n"+order.optString("customerName")+"\n"+order.optString("plushName")+" · "+order.optString("character"));tell("Order found. Scan its matching ID card. Status will change only after the video is saved online.");if(!pendingCard.isEmpty()){String card=pendingCard;pendingCard="";beginCard(card,mono,epoch);}else focusScan();});
        }catch(Exception error){runOnUiThread(()->{pendingCard="";pendingUntil=0;pairingProblem(error,"");});}});
    }

    private void validateFirstCard(String code){networkBusy=true;refreshState();io.execute(()->{try{new PackingApi(SessionStore.token(this)).request(PackingApi.SCAN+"?nfc="+PackingApi.encode(code)+"&packingProof=1",null);runOnUiThread(()->{networkBusy=false;pendingCard=code;pendingUntil=System.currentTimeMillis()+60000;tell("Card ready. Scan its order within one minute.");focusScan();});}catch(Exception error){runOnUiThread(()->pairingProblem(error,""));}});}

    private void beginCard(String card,long mono,long epoch){
        if(encoder==null||!encoder.ring.ready(System.nanoTime()/1000)){pairingProblem(new Exception("Choose a camera and wait for READY, then scan the card again."),pendingOrder==null?"":pendingOrder.optString("order_id"));return;}
        if(new StatFs(getFilesDir().getPath()).getAvailableBytes()<150*1024*1024L){pairingProblem(new Exception("Tablet storage is low. Upload the waiting videos before packing another parcel."),pendingOrder==null?"":pendingOrder.optString("order_id"));return;}
        try{capture=encoder.ring.begin(mono,epoch);}catch(Exception error){pairingProblem(error,pendingOrder==null?"":pendingOrder.optString("order_id"));return;}
        PacketRing.Capture clip=capture;clipOrder=pendingOrder;clipBarcode=pendingBarcode;clipCard=card;clipId=UUID.randomUUID().toString();clipRotation=videoRotation;
        networkBusy=true;tell("Checking matching ID card and recording the packing video...");refreshState();JSONObject item=pendingOrder;
        ui.postDelayed(()->{if(capture==clip&&!clip.verified){if(encoder!=null)encoder.ring.cancel(clip);capture=null;networkBusy=false;pairingProblem(new Exception("Card verification timed out. Scan again; the video was not marked saved."),clipOrder.optString("order_id"));}},20000);
        io.execute(()->{try{
            {PackingApi api=new PackingApi(SessionStore.token(this));JSONObject paired=api.request(PackingApi.PACKING,new JSONObject().put("action","pair").put("orderId",item.getString("order_id")).put("orderBarcode",clipBarcode).put("cardCode",card));if(!paired.optBoolean("ok")||!paired.optBoolean("paired"))throw new Exception("The matching card was not confirmed. Scan again.");}
            runOnUiThread(()->{if(capture!=clip)return;clip.verified=true;networkBusy=false;pendingOrder=null;pendingCard="";pendingUntil=0;tell("Matching card confirmed. Verify the audio and finish packing. Packed status waits for the video to save online.");audioWarning=false;if(audioLabel!=null)audioLabel.setTextColor(MUTED);feedback.result(true,"",item.optString("order_id"));});
        }catch(Exception error){runOnUiThread(()->{if(capture!=clip)return;if(encoder!=null)encoder.ring.cancel(clip);capture=null;pairingProblem(error,item.optString("order_id"));});}});
    }

    private void finished(PacketRing.Capture clip,MediaFormat format){runOnUiThread(()->{
        if(capture!=clip)return;if(!clip.error.isEmpty()||!clip.verified){capture=null;tell(clip.error.isEmpty()?"Card verification was not complete. Scan again.":clip.error);focusScan();return;}
        capture=null;savingLocal=true;JSONObject item=clipOrder;String code=clipBarcode,card=clipCard,id=clipId;int rotation=clipRotation;tell("Saving the packing video safely on the tablet...");
        io.execute(()->{try{
            File dir=ProofQueue.folder(this);dir.mkdirs();File video=new File(dir,id+".mp4");String number=item.getJSONObject("order").optString("orderNumber",item.getString("order_id"));JSONObject metadata=ProofQueue.metadata(id,item.getString("order_id"),number,code,card,clip,video).put("packAfterSave",true);ProofQueue.write(new File(dir,id+".pending"),metadata);RollingEncoder.save(video,clip,format,rotation);
            {metadata.put("size",video.length());ProofQueue.write(new File(dir,id+".json"),metadata);new File(dir,id+".pending").delete();UploadWorker.enqueue(this);}
            runOnUiThread(()->{savingLocal=false;tell("Video saved on tablet and queued for upload. Packed status waits for online saving. Order #"+number+". Ready for the next order.");focusScan();refreshState();});
        }catch(Exception error){runOnUiThread(()->{savingLocal=false;tell("Video could not be saved: "+error.getMessage()+" Scan the parcel again.");focusScan();});}});
    });}

    private void pairingProblem(Exception error,String orderId){
        networkBusy=false;String problem=PairingProblem.explain(error.getMessage());tell(problem);
        boolean expired=error instanceof PackingApi.ApiError&&((PackingApi.ApiError)error).status==401;
        audioWarning=false;if(audioLabel!=null)audioLabel.setTextColor(MUTED);
        if(expired){stopCamera("");SessionStore.clear(this);loginScreen();}
        feedback.result(false,problem,expired?"":orderId);refreshState();
    }
    private void fail(Exception error){runOnUiThread(()->{networkBusy=false;tell(error.getMessage());if(error instanceof PackingApi.ApiError&&((PackingApi.ApiError)error).status==401){stopCamera("");SessionStore.clear(this);loginScreen();}else focusScan();});}

    private void connectCamera(){
        if(capture!=null||networkBusy||savingLocal)return;
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},100);return;}
        try{
            android.hardware.camera2.CameraManager manager=(android.hardware.camera2.CameraManager)getSystemService(CAMERA_SERVICE);
            ArrayList<String> ids=new ArrayList<>(),names=new ArrayList<>();
            for(String id:manager.getCameraIdList()){
                android.hardware.camera2.CameraCharacteristics info=manager.getCameraCharacteristics(id);
                Integer facing=info.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING);
                if(Integer.valueOf(android.hardware.camera2.CameraCharacteristics.LENS_FACING_EXTERNAL).equals(facing))continue;
                ids.add(id);names.add((Integer.valueOf(android.hardware.camera2.CameraCharacteristics.LENS_FACING_FRONT).equals(facing)?"Tablet front camera":"Tablet rear camera")+" ("+id+")");
            }
            names.add("USB webcam / choose connected webcam");
            new AlertDialog.Builder(this).setTitle("Choose camera").setItems(names.toArray(new String[0]),(dialog,index)->{
                stopCamera("");
                if(index==ids.size()){connectUsbCamera();return;}
                previewKey="cameraRotation:"+ids.get(index);previewCorrection=getSharedPreferences("station",MODE_PRIVATE).getInt(previewKey,0);String label=names.get(index);TabletCamera selected=new TabletCamera();tabletCamera=selected;activeCamera=label;
                tell("Connecting "+label+"...");
                try{int degrees=getWindowManager().getDefaultDisplay().getRotation()*90;
                    selected.open(this,ids.get(index),preview,degrees,new TabletCamera.Listener(){
                        public Surface prepare(int width,int height,int rotation) throws Exception {
                            videoRotation=rotation;encoder=new RollingEncoder(width,height,new RollingEncoder.Listener(){public void finished(PacketRing.Capture clip,MediaFormat format){MainActivity.this.finished(clip,format);}public void error(String message){runOnUiThread(()->tell(message));}});
                            previewWidth=width;previewHeight=height;refreshCameraPreview();return encoder.surface;
                        }
                        public void ready(){if(tabletCamera!=selected)return;tell(label+" connected. Preparing 3 seconds of history...");focusScan();}
                        public void error(String message){if(tabletCamera==selected)stopCamera(message);}
                    });
                }catch(Exception error){stopCamera("Could not open camera: "+error.getMessage());}
            }).show();
        }catch(Exception error){tell("Could not list cameras: "+error.getMessage());}
    }
    private void refreshCameraPreview(){
        if(preview==null||preview.getDisplay()==null)return;
        previewDisplay=preview.getDisplay().getRotation();boolean usb=tabletCamera==null;
        PreviewGeometry geometry=PreviewGeometry.fit(previewWidth,previewHeight,preview.getWidth(),preview.getHeight(),usb?0:tabletCamera.sensorOrientation,!usb&&tabletCamera.frontFacing,previewDisplay*90,usb,previewCorrection);
        if(geometry==null)return;
        Matrix transform=new Matrix();float centerX=preview.getWidth()/2f,centerY=preview.getHeight()/2f;
        transform.setScale(geometry.scaleX,geometry.scaleY,centerX,centerY);transform.postRotate(geometry.previewRotation,centerX,centerY);preview.setTransform(transform);videoRotation=geometry.recordingRotation;
    }
    private void connectUsbCamera(){
        if(capture!=null||networkBusy||savingLocal)return;
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},100);return;}
        cameraRequested=true;videoRotation=0;activeCamera="USB webcam";preview.setTransform(new Matrix());
        if(helper==null){final ICameraHelper connection=new CameraHelper();helper=connection;connection.setStateCallback(new ICameraHelper.StateCallback(){
            public void onAttach(UsbDevice device){if(helper==connection&&cameraRequested&&tabletCamera==null&&selectedUsb==null&&videoDevice(device)){selectedUsb=device;helper.selectDevice(device);}}
            public void onDeviceOpen(UsbDevice device,boolean first){if(helper!=connection||!cameraRequested)return;List<Size> sizes=helper.getSupportedSizeList();Size chosen=null;if(sizes!=null)for(Size s:sizes)if(s.width==1280&&s.height==720){chosen=s;break;}if(chosen==null)helper.openCamera();else helper.openCamera(chosen);}
            public void onCameraOpen(UsbDevice device){runOnUiThread(()->{if(!cameraRequested||tabletCamera!=null||helper!=connection)return;try{Size size=helper.getPreviewSize();int width=size==null?640:size.width,height=size==null?480:size.height;encoder=new RollingEncoder(width,height,new RollingEncoder.Listener(){public void finished(PacketRing.Capture clip,MediaFormat format){MainActivity.this.finished(clip,format);}public void error(String message){runOnUiThread(()->tell(message));}});previewWidth=width;previewHeight=height;previewKey="usbRotation:"+device.getVendorId()+":"+device.getProductId();previewCorrection=getSharedPreferences("station",MODE_PRIVATE).getInt(previewKey,0);refreshCameraPreview();helper.addSurface(encoder.surface,true);if(preview.getSurfaceTexture()!=null)helper.addSurface(preview.getSurfaceTexture(),false);helper.startPreview();tell("USB webcam connected ("+width+" x "+height+"). Preparing 3 seconds of history...");focusScan();}catch(Exception error){stopCamera("Could not start webcam recording: "+error.getMessage());}});}
            public void onCameraClose(UsbDevice device){runOnUiThread(()->{if(helper==connection&&tabletCamera==null&&selectedUsb!=null&&selectedUsb.equals(device))closeEncoder("Webcam closed. Incomplete recordings are not saved.");});}
            public void onDeviceClose(UsbDevice device){}
            public void onDetach(UsbDevice device){if(helper==connection&&selectedUsb!=null&&selectedUsb.equals(device))runOnUiThread(()->{selectedUsb=null;closeEncoder("Webcam unplugged. Reconnect it and scan again.");});}
            public void onCancel(UsbDevice device){runOnUiThread(()->{if(helper!=connection)return;selectedUsb=null;tell("USB webcam permission was cancelled. Tap Connect / choose USB webcam to retry.");});}
            public void onError(UsbDevice device,CameraException error){runOnUiThread(()->{if(helper==connection)stopCamera("The USB webcam could not open. Check the dongle and reconnect it, then choose the camera again.");});}
        });}
        List<UsbDevice> all=helper.getDeviceList();ArrayList<UsbDevice> cameras=new ArrayList<>();if(all!=null)for(UsbDevice d:all)if(videoDevice(d))cameras.add(d);
        if(cameras.isEmpty()){tell("Waiting for a USB webcam. Connect it through your dongle, allow USB access, then retry.");return;}
        if(cameras.size()==1){selectCamera(cameras.get(0));return;}String[] names=new String[cameras.size()];for(int i=0;i<names.length;i++)names[i]=cameraName(cameras.get(i));new AlertDialog.Builder(this).setTitle("Choose USB webcam").setItems(names,(d,index)->selectCamera(cameras.get(index))).show();
    }
    private String cameraName(UsbDevice device){return (device.getProductName()==null?"USB webcam":device.getProductName())+" ("+device.getVendorId()+":"+device.getProductId()+")";}
    private boolean videoDevice(UsbDevice device){if(device.getDeviceClass()==UsbConstants.USB_CLASS_VIDEO)return true;for(int i=0;i<device.getInterfaceCount();i++)if(device.getInterface(i).getInterfaceClass()==UsbConstants.USB_CLASS_VIDEO)return true;return false;}
    private void selectCamera(UsbDevice device){if(encoder!=null&&device.equals(selectedUsb)){tell("This webcam is already connected.");focusScan();return;}if(helper!=null&&helper.isCameraOpened())helper.closeCamera();closeEncoder("");selectedUsb=device;tell("Connecting "+cameraName(device)+"...");helper.selectDevice(device);}
    private void closeEncoder(String reason){if(capture!=null){if(encoder!=null)encoder.ring.cancel(capture);capture=null;}if(encoder!=null){if(helper!=null)helper.removeSurface(encoder.surface);encoder.close();encoder=null;}if(!reason.isEmpty())tell(reason);}
    private void stopCamera(String reason){cameraRequested=false;previewWidth=0;previewHeight=0;previewDisplay=-1;selectedUsb=null;if(tabletCamera!=null){tabletCamera.close();tabletCamera=null;}closeEncoder(reason);if(helper!=null){ICameraHelper old=helper;helper=null;old.closeCamera();old.release();}selectedUsb=null;}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==100&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)connectCamera();else if(request==100)tell("Camera permission is needed to record packing videos. Tap Choose camera to retry.");}
}
