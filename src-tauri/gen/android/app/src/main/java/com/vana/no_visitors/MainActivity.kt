package com.vana.no_visitors

import android.os.Bundle
import android.view.ActionMode
import android.view.MenuItem
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var selectionWebView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    selectionWebView = webView
  }

  private var selectionMode: ActionMode? = null

  override fun onActionModeStarted(mode: ActionMode) {
    super.onActionModeStarted(mode)
    if (mode.type != ActionMode.TYPE_FLOATING) return
    selectionMode = mode
    addSelectionActions(mode, 0)
  }

  private fun addSelectionActions(mode: ActionMode, attempt: Int) {
    val webView = selectionWebView ?: return
    // Chromium updates the DOM range just after starting native selection mode.
    webView.postDelayed({
      if (selectionMode !== mode) return@postDelayed
      webView.evaluateJavascript(SELECTION_IN_EDITOR) { result ->
        if (selectionMode !== mode) return@evaluateJavascript
        if (result != "true") {
          if (attempt < 3) addSelectionActions(mode, attempt + 1)
          return@evaluateJavascript
        }
        for ((id, title, action) in listOf(
          Triple(SHARE_EXCERPT, "文段分享", "share"),
          Triple(MAKE_LETTER, "制作信稿", "embed")
        )) {
          if (mode.menu.findItem(id) == null) {
            mode.menu.add(0, id, 2, title).apply {
              setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
              setOnMenuItemClickListener {
                // Capture the DOM range before finish clears selection. Text is
                // never interpolated into JavaScript; action is a fixed value.
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('vana:selection-action',{detail:'$action'}));") {
                  if (selectionMode === mode) mode.finish()
                }
                true
              }
            }
          }
        }
        // Keep Chromium's original callback/content rectangle and the OEM
        // toolbar, including copy, process-text and selection-handle behavior.
        // Refresh the toolbar layout without asking Chromium to recreate its
        // menu: some WebViews append duplicate share/select-all actions there.
        mode.invalidateContentRect()
      }
    }, 60L)
  }

  override fun onActionModeFinished(mode: ActionMode) {
    if (selectionMode === mode) selectionMode = null
    super.onActionModeFinished(mode)
  }

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
    selectionMode = null
    selectionWebView = null
    AndroidShare.clearActivity(this)
    super.onDestroy()
  }

  companion object {
    private const val SHARE_EXCERPT = 0x56410001
    private const val MAKE_LETTER = 0x56410002
    private const val SELECTION_IN_EDITOR = """(function(){
      const s=window.getSelection();
      if(!s||s.isCollapsed||!s.anchorNode||!s.focusNode) return false;
      const e=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement;
      const root=e&&e.closest('[data-vana-letterpress-actions="true"]');
      return !!(root&&root.contains(s.focusNode)&&!document.querySelector('.lp-studio'));
    })()"""
  }
}
