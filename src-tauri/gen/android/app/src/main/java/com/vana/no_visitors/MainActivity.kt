package com.vana.no_visitors

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    AndroidShare.setActivity(this)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onDestroy() {
    AndroidShare.clearActivity(this)
    super.onDestroy()
  }
}
