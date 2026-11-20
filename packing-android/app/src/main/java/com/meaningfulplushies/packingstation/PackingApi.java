package com.meaningfulplushies.packingstation;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
final class PackingApi {
    static final String BASE="https://meaningful-plushies-fulfilment.vercel.app";
    static final String SCAN="/api/production-tracking",PROOFS=SCAN+"/proofs";
    private final String token;
    PackingApi(String token){this.token=token;}
    static String encode(String text){return android.net.Uri.encode(text);}
    static final class ApiError extends Exception {final int status;ApiError(int status,String message){super(message);this.status=status;}}
    JSONObject request(String path,JSONObject body) throws Exception {
        URL url=new URL(BASE+path);HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setConnectTimeout(15000);connection.setReadTimeout(75000);connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept","application/json");
        if(!token.isEmpty())connection.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(var output=connection.getOutputStream()){output.write(bytes);}}
            int status=connection.getResponseCode();String raw=read(status<400?connection.getInputStream():connection.getErrorStream());
            JSONObject data;try{data=new JSONObject(raw);}catch(Exception ignored){throw new ApiError(status,"The server could not respond. Check Wi-Fi and try again.");}
            if(status<200||status>=300)throw new ApiError(status,data.optString("error","Request failed. Please try again."));return data;
        }finally{connection.disconnect();}
    }
    static void upload(String signedUrl,File source) throws Exception {
        URL url=new URL(signedUrl);
        // Never send staff credentials to the signed storage URL.
        if(!"https".equals(url.getProtocol())||!url.getHost().equals("joaoirpegnkexmktylop.supabase.co"))throw new Exception("Unrecognised video upload destination.");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(75000);connection.setInstanceFollowRedirects(false);
        try{connection.setRequestMethod("PUT");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","video/mp4");connection.setFixedLengthStreamingMode(source.length());
            try(var input=new FileInputStream(source);var output=connection.getOutputStream()){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}
            int code=connection.getResponseCode();if(code<200||code>=300)throw new Exception("Video upload interrupted; the local copy is safe and will retry.");
        }finally{connection.disconnect();}
    }
    private static String read(InputStream input) throws Exception {if(input==null)return "";try(input;var bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(bytes.size()+count>2*1024*1024)throw new Exception("Server response too large.");bytes.write(buffer,0,count);}return bytes.toString("UTF-8");}}
}
