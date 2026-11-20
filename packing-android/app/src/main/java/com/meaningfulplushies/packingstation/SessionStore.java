package com.meaningfulplushies.packingstation;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
final class SessionStore {
    private static final String ALIAS="mp-packing-staff-session";
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static void save(Context context,String token) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] encrypted=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)),iv=cipher.getIV();
        byte[] bytes=ByteBuffer.allocate(1+iv.length+encrypted.length).put((byte)iv.length).put(iv).put(encrypted).array();
        if(!context.getSharedPreferences("session",Context.MODE_PRIVATE).edit().putString("token",Base64.encodeToString(bytes,Base64.NO_WRAP)).commit())throw new Exception("Could not save sign-in securely.");
    }
    static String token(Context context) {
        try {
            String saved=context.getSharedPreferences("session",Context.MODE_PRIVATE).getString("token","");if(saved.isEmpty())return "";
            ByteBuffer buffer=ByteBuffer.wrap(Base64.decode(saved,Base64.NO_WRAP));int length=buffer.get()&255;if(length!=12)return "";
            byte[] iv=new byte[length],encrypted=new byte[buffer.remaining()-length];buffer.get(iv);buffer.get(encrypted);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
            return new String(cipher.doFinal(encrypted),StandardCharsets.UTF_8);
        } catch(Exception ignored){return "";}
    }
    static void clear(Context context){context.getSharedPreferences("session",Context.MODE_PRIVATE).edit().clear().apply();}
}
