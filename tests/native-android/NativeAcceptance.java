package com.vana.acceptance.instrumented;

import android.app.Instrumentation;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.Method;
import org.json.JSONObject;

/** Signed test instrumentation, never included in the production APK. */
public final class NativeAcceptance extends Instrumentation {
  private Bundle arguments;
  @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args; start(); }
  private static void require(boolean value) { if (!value) throw new IllegalStateException("Acceptance assertion failed"); }
  private File findControl(File directory, int depth) {
    if (depth > 5) return null;
    File direct = new File(directory, "control.db");
    if (direct.isFile()) return direct;
    File[] children = directory.listFiles();
    if (children != null) for (File child : children) if (child.isDirectory()) {
      File found = findControl(child, depth + 1); if (found != null) return found;
    }
    return null;
  }
  private static String value(SQLiteDatabase db, String key) {
    try (Cursor cursor = db.rawQuery("SELECT value FROM app_config WHERE key=?", new String[]{key})) {
      return cursor.moveToFirst() ? cursor.getString(0) : null;
    }
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    String action = arguments.getString("action", "");
    try {
      Context context = getTargetContext();
      require(context.getPackageName().equals("com.vana.no_visitors"));
      String expected = arguments.getString("fixture_id", "");
      require(expected.matches("[0-9a-f-]{36}"));
      File control = findControl(context.getFilesDir(), 0); require(control != null);
      Method access = context.getClassLoader().loadClass("com.vana.no_visitors.AndroidSessionSecrets")
        .getMethod("access", Context.class, String.class, String.class, String.class);
      File stateFile = new File(context.getFilesDir(), "vana-native-acceptance.json");
      try (SQLiteDatabase db = SQLiteDatabase.openDatabase(control.getPath(), null, SQLiteDatabase.OPEN_READONLY)) {
        String key = value(db, "supabase.credential_id");
        if (action.equals("verify_logout")) {
          JSONObject state = new JSONObject(new String(Files.readAllBytes(stateFile.toPath()), StandardCharsets.UTF_8));
          require(expected.equals(state.getString("fixture_id")));
          require(key == null && value(db, "supabase.session") == null);
          require(access.invoke(null, context, "read", state.getString("current_key"), "") == null);
          require(stateFile.delete());
          result.putString("checks", "PASS: Android native logout removed SQLite session and encrypted OS credential");
        } else {
          require(key != null);
          JSONObject metadata = new JSONObject(value(db, "supabase.session"));
          require(expected.equals(metadata.getString("user_id")));
          require(metadata.optString("email").startsWith("vana-acceptance-") && metadata.optString("email").endsWith("@example.com"));
          require(metadata.optString("access_token").isEmpty() && metadata.isNull("refresh_token"));
          String raw = (String) access.invoke(null, context, "read", key, "");
          JSONObject session = new JSONObject(raw);
          require(expected.equals(session.getString("user_id")));
          require(!session.getString("access_token").isEmpty() && !session.getString("refresh_token").isEmpty());
          File encryptedFile = new File(new File(context.getNoBackupFilesDir(), "session-secrets"), key + ".json");
          JSONObject encrypted = new JSONObject(new String(Files.readAllBytes(encryptedFile.toPath()), StandardCharsets.UTF_8));
          require(encrypted.length() == 3 && encrypted.getInt("version") == 1 && encrypted.has("iv") && encrypted.has("ciphertext"));
          if (action.equals("expire_fixture")) {
            require(!stateFile.exists());
            JSONObject state = new JSONObject().put("fixture_id", expected).put("old_key", key);
            Files.write(stateFile.toPath(), state.toString().getBytes(StandardCharsets.UTF_8));
            session.put("expires_at", 0);
            require(session.toString().equals(access.invoke(null, context, "write", key, session.toString())));
            result.putString("checks", "PASS: fixture session uses real Keystore encryption and token-free SQLite; expiry forced only for this test account");
          } else if (action.equals("verify_refresh")) {
            JSONObject state = new JSONObject(new String(Files.readAllBytes(stateFile.toPath()), StandardCharsets.UTF_8));
            require(expected.equals(state.getString("fixture_id")) && !key.equals(state.getString("old_key")));
            require(access.invoke(null, context, "read", state.getString("old_key"), "") == null);
            require(session.getLong("expires_at") > System.currentTimeMillis() / 1000);
            state.put("current_key", key); Files.write(stateFile.toPath(), state.toString().getBytes(StandardCharsets.UTF_8));
            result.putString("checks", "PASS: real Android native refresh rotated the credential, removed the old secret and retained token-free SQLite");
          } else throw new IllegalArgumentException("Unknown acceptance action");
        }
      }
      finish(-1, result);
    } catch (Exception failure) {
      result.putString("checks", "FAIL: Android native acceptance " + action + "; private details suppressed");
      finish(0, result);
    }
  }
}
