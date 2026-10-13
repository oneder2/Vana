package com.vana.no_visitors;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

public final class AndroidShare {
  public static String lastShareError = null;
  private static MainActivity currentActivity = null;

  private AndroidShare() {}

  public static void setActivity(MainActivity activity) {
    currentActivity = activity;
  }

  public static void clearActivity(MainActivity activity) {
    if (currentActivity == activity) {
      currentActivity = null;
    }
  }

  public static void shareExportFile(String path, String mimeType, String title) {
    lastShareError = null;
    MainActivity activity = currentActivity;
    if (activity == null) {
      lastShareError = "Activity is not available";
      return;
    }

    Runnable task = () -> {
      File file = new File(path);
      if (!file.exists()) {
        throw new IllegalArgumentException("Export file does not exist: " + path);
      }

      Uri uri = FileProvider.getUriForFile(
        activity,
        activity.getPackageName() + ".fileprovider",
        file
      );

      Intent sendIntent = new Intent(Intent.ACTION_SEND);
      sendIntent.setType(mimeType);
      sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
      sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
      sendIntent.putExtra(Intent.EXTRA_TITLE, title);
      sendIntent.setClipData(ClipData.newUri(activity.getContentResolver(), title, uri));
      sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

      Intent chooser = Intent.createChooser(sendIntent, "分享 " + title);
      chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      activity.startActivity(chooser);
    };

    if (Looper.myLooper() == Looper.getMainLooper()) {
      try {
        task.run();
      } catch (Throwable error) {
        lastShareError = toShareError(error);
      }
      return;
    }

    CountDownLatch latch = new CountDownLatch(1);
    AtomicReference<Throwable> failure = new AtomicReference<>(null);
    activity.runOnUiThread(() -> {
      try {
        task.run();
      } catch (Throwable error) {
        failure.set(error);
      } finally {
        latch.countDown();
      }
    });

    try {
      latch.await();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      lastShareError = toShareError(error);
      return;
    }

    Throwable error = failure.get();
    if (error != null) {
      lastShareError = toShareError(error);
    }
  }

  private static String toShareError(Throwable error) {
    StringWriter writer = new StringWriter();
    error.printStackTrace(new PrintWriter(writer));
    String message = error.getMessage() == null ? "no message" : error.getMessage();
    return error.getClass().getSimpleName() + ": " + message + "\n" + writer;
  }
}
