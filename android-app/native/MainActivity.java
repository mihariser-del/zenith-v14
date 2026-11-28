package com.zelpophai.app;

import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * Zelpophai AI for Android. The app shows the live site; this adds what a
 * plain WebView can't do by itself: downloading generated files (with the
 * user's login), and handing app updates (.apk) to the system installer.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new AppBridge(), "ZPApp");
        openPath(getIntent());
        // "Hey Zelpophai" was on: Android doesn't let it restart by itself after the
        // phone restarts, so it comes back whenever the app is opened.
        if (ZpWake.wanted(this) && ZpWake.instance == null) {
            try { ZpWake.setWanted(this, true); } catch (Exception ignored) { }
        }
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                if (url.endsWith(".apk") || "application/vnd.android.package-archive".equals(mimeType)) {
                    // App update: let the browser download it and Android install it.
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return;
                }
                if (url.startsWith("blob:") || url.startsWith("data:")) {
                    Toast.makeText(this, "Use \"Download\" on the file card to save this file.", Toast.LENGTH_LONG).show();
                    return;
                }
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) req.addRequestHeader("Cookie", cookies);
                req.addRequestHeader("User-Agent", userAgent);
                req.setMimeType(mimeType);
                req.setTitle(name);
                req.setDescription("Zelpophai AI");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.enqueue(req);
                Toast.makeText(this, "Downloading " + name + "…", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openPath(intent);
    }

    /** "Open in Zelpophai" from the assistant: show that page in the app. */
    private void openPath(Intent intent) {
        if (intent == null) return;
        String p = intent.getStringExtra("zp_path");
        if (p == null || !p.startsWith("/")) return;
        intent.removeExtra("zp_path");
        final WebView web = getBridge().getWebView();
        web.post(() -> web.loadUrl(ZpAssistActivity.SITE + p));
    }

    /** Lets the site offer "Use Zelpophai like Siri" set-up from inside the app. */
    private class AppBridge {
        @JavascriptInterface
        public String status() {
            String a = Settings.Secure.getString(getContentResolver(), "assistant");
            boolean isAssistant = a != null && a.startsWith(getPackageName() + "/");
            return "{\"assistant\":" + isAssistant + ",\"access\":" + ZpAccess.on() + ",\"screen\":" + (android.os.Build.VERSION.SDK_INT >= 30) + "}";
        }
        @JavascriptInterface
        public void openAssistant() {
            startActivity(new Intent(MainActivity.this, ZpAssistActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        @JavascriptInterface
        public void openAssistantSettings() {
            try { startActivity(new Intent("android.settings.MANAGE_DEFAULT_APPS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Exception e) {
                try { startActivity(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception e2) { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            }
        }
        @JavascriptInterface
        public String wakeStatus() { return ZpWake.statusJson(MainActivity.this); }
        @JavascriptInterface
        public String wake(final boolean on) {
            if (!on) { ZpWake.setWanted(MainActivity.this, false); return "off"; }
            java.util.List<String> need = new java.util.ArrayList<>();
            if (android.os.Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                need.add(android.Manifest.permission.RECORD_AUDIO);
            if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
                need.add("android.permission.POST_NOTIFICATIONS");
            if (!need.isEmpty()) {
                runOnUiThread(() -> requestPermissions(need.toArray(new String[0]), 51));
                return "permission";
            }
            if (android.os.Build.VERSION.SDK_INT >= 23 && !android.provider.Settings.canDrawOverlays(MainActivity.this)) {
                // Lets Zelpophai pop up when it hears its name while you're in another app.
                ZpWake.setWanted(MainActivity.this, true);
                runOnUiThread(() -> ZpWake.openOverlaySettings(MainActivity.this));
                return "overlay";
            }
            runOnUiThread(() -> ZpWake.setWanted(MainActivity.this, true));
            return "on";
        }
        @JavascriptInterface
        public void openAccessibilitySettings() {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
