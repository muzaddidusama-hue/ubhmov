package com.example.ubhstream

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.PermissionRequest
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

class MainActivity : ComponentActivity() {
  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge()
    setContent {
      AndroidView(
        factory = { context ->
          WebView(context).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
              android.view.ViewGroup.LayoutParams.MATCH_PARENT,
              android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
            
            webViewClient = object : WebViewClient() {
              // 1. Prevent top-level page hijacks/redirects by ad networks
              override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: ""
                
                // Allow navigations only to our streaming app domain, firebase auth helper, or google signin
                if (host.contains("ubhmov.vercel.app") || 
                    host.contains("firebaseapp.com") || 
                    host.contains("googleapis.com") || 
                    host.contains("google.com") || 
                    host.contains("localhost")
                ) {
                  return false // Let WebView load it
                }
                
                // Block any external redirections (ad popups)
                return true // Intercept navigation
              }

              // 2. Intercept and block ad scripts, trackers, and popup frames
              override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url.toString().lowercase()
                
                val adKeywords = listOf(
                  "popads", "popcash", "adsterra", "exoclick", "onclickads", "doubleclick",
                  "google-analytics", "googlesyndication", "googleadservices", "adservice",
                  "coinhive", "bitlabs", "adsystem", "adnetwork", "mgid", "taboola", 
                  "outbrain", "yandex", "adnxs", "smartadserver", "adskeeper", "propellerads",
                  "adbrau", "juicyads", "popunder", "vast.xml", "nativeads", "adserver", 
                  "ads", "analytics", "tracking", "popup", "adshield", "vidsrc.stream"
                )
                
                for (keyword in adKeywords) {
                  if (url.contains(keyword)) {
                    // Block by returning an empty input stream response
                    return WebResourceResponse("text/plain", "UTF-8", null)
                  }
                }
                
                return super.shouldInterceptRequest(view, request)
              }
            }
            
            webChromeClient = object : WebChromeClient() {
              override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
              }

              override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
              ): Boolean {
                // Intercept and block all popup/new window attempts
                return true
              }

              private var customView: android.view.View? = null
              private var customViewCallback: CustomViewCallback? = null

              override fun onShowCustomView(view: android.view.View?, callback: CustomViewCallback?) {
                super.onShowCustomView(view, callback)
                if (customView != null) {
                  callback?.onCustomViewHidden()
                  return
                }
                customView = view
                customViewCallback = callback
                
                // 1. Force landscape orientation for video playback
                this@MainActivity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                
                // 2. Hide system status bar and navigation bar for true fullscreen
                val windowInsetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                windowInsetsController.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

                // 3. Add video view directly to window's DecorView to lay on top of Compose elements
                val decorView = window.decorView as android.view.ViewGroup
                decorView.addView(
                  view, 
                  android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                  )
                )
              }

              override fun onHideCustomView() {
                super.onHideCustomView()
                if (customView == null) return
                
                // 1. Remove video view from decorView
                val decorView = window.decorView as android.view.ViewGroup
                decorView.removeView(customView)
                customView = null
                customViewCallback?.onCustomViewHidden()
                
                // 2. Restore system status bar and navigation bar
                val windowInsetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                windowInsetsController.show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                
                // 3. Restore default auto-rotation orientation
                this@MainActivity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
              }
            }
            
            settings.apply {
              javaScriptEnabled = true
              domStorageEnabled = true
              databaseEnabled = true
              mediaPlaybackRequiresUserGesture = false
              mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
              javaScriptCanOpenWindowsAutomatically = false
              setSupportMultipleWindows(true)
            }

            // Enable third-party cookies for iframe player LocalStorage/cookie state sync
            val cookieManager = android.webkit.CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            cookieManager.setAcceptThirdPartyCookies(this, true)
            
            loadUrl("https://ubhmov.vercel.app/")
          }
        },
        modifier = Modifier.fillMaxSize()
      )
    }
  }
}
