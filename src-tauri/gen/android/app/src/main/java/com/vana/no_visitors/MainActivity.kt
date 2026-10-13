package com.vana.no_visitors

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    AndroidShare.setActivity(this)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // WebView safe-area CSS is zero on some Android versions. Keep all native
    // screens and overlays clear of system bars/cutouts, while forwarding IME
    // insets so keyboard resizing continues to work.
    val content = findViewById<View>(android.R.id.content)
    val systemInsets = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(systemInsets)
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.Builder(insets).setInsets(systemInsets, Insets.NONE).build()
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onDestroy() {
    AndroidShare.clearActivity(this)
    super.onDestroy()
  }
}
