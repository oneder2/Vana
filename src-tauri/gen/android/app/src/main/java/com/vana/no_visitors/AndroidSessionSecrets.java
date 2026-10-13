package com.vana.no_visitors;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** AES-GCM ciphertext in no-backup storage; key never leaves Android Keystore. */
public final class AndroidSessionSecrets {
  private static final String ALIAS = "vana.auth.v1";
  private AndroidSessionSecrets() {}

  public static synchronized String access(Context context, String operation, String id, String value) {
    if (!id.matches("[0-9a-fA-F-]{36}")) throw new IllegalArgumentException("Invalid credential ID");
    File root = new File(context.getNoBackupFilesDir(), "session-secrets");
    if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Credential directory unavailable");
    AtomicFile file = new AtomicFile(new File(root, id + ".json"));
    try {
      if (operation.equals("delete")) { file.delete(); return ""; }
      if (operation.equals("read") && !file.getBaseFile().exists()) return null;
      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      if (!store.containsAlias(ALIAS)) {
        if (!operation.equals("write")) throw new IllegalStateException("Credential key missing");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        generator.generateKey();
      }
      SecretKey key = (SecretKey) store.getKey(ALIAS, null);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      if (operation.equals("write")) {
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        JSONObject payload = new JSONObject().put("version", 1)
          .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
          .put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        FileOutputStream stream = null;
        try { stream = file.startWrite(); stream.write(payload.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
        catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
        return value;
      }
      if (!operation.equals("read")) throw new IllegalArgumentException("Invalid credential operation");
      JSONObject payload = new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
      if (payload.getInt("version") != 1) throw new IllegalStateException("Unsupported credential format");
      byte[] iv = Base64.decode(payload.getString("iv"), Base64.NO_WRAP);
      cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
      cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
      return new String(cipher.doFinal(Base64.decode(payload.getString("ciphertext"), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    } catch (Exception error) {
      // Never include secret values or provider exception messages in IPC errors.
      throw new IllegalStateException("Android Keystore operation failed: " + error.getClass().getSimpleName());
    }
  }
}
