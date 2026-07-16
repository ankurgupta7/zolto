# WebView JavaScript interface — keep public methods callable from JS
-keepclassmembers class ch.kalakosh.app.** {
    @android.webkit.JavascriptInterface <methods>;
}
