package com.zelpophai.app;

import android.Manifest;
import android.app.Activity;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * "Hey Zelpophai": the assistant sheet. It opens over whatever you're doing when
 * you hold the home / power button (once Zelpophai is your phone's assistant),
 * from the Quick Settings tile, or from the app icon's "Talk to Zelpophai".
 *
 * The sheet shows zelpophai.com/mini — the same Mini that runs on Windows — and
 * gives it a small bridge (window.ZPAndroid) for the phone: listening, speaking,
 * quick actions (alarms, timers, calls, maps…), and, if the person has switched
 * on Zelpophai's Accessibility setting, seeing the screen and tapping/typing.
 * The bridge only answers pages from Zelpophai's own address.
 */
public class ZpAssistActivity extends Activity {
    static final String SITE = "https://zelpophai.com";
    private static final String[] OURS = { "zelpophai.com", "www.zelpophai.com", "zelpophai.up.railway.app" };
    private static final int REQ_MIC = 41, REQ_CONTACTS = 42;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private FrameLayout card;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer sr;
    private String openShot = null;        // screenshot taken as the sheet opened
    private int openW = 0, openH = 0;
    private String openText = "";          // words on screen as the sheet opened
    private boolean running = false;       // a Do task is going
    private boolean inFront = true;
    private List<String[]> appsCache = null;   // [label, package]

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        // Look at the screen underneath before our sheet is drawn over it.
        grabOpeningScreen();

        Window w = getWindow();
        w.setBackgroundDrawable(new ColorDrawable(Color.parseColor("#66000000")));
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 21) w.setNavigationBarColor(Color.parseColor("#0b1020"));

        FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(v -> finish());           // tap above the sheet to close it
        card = new FrameLayout(this);
        card.setClickable(true);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0b1020"));
        float r = dp(26);
        bg.setCornerRadii(new float[]{ r, r, r, r, 0, 0, 0, 0 });
        card.setBackground(bg);
        card.setClipToOutline(true);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (dm.heightPixels * 0.74f));
        lp.gravity = Gravity.BOTTOM;
        root.addView(card, lp);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b1020"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " ZelpophaiAndroid/" + version() + " ZelpophaiMini");
        android.webkit.CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "ZPAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (ours(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) { req.deny(); }   // voice goes through the phone's recogniser
        });
        card.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        web.loadUrl(SITE + "/mini?android=1");

        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setLanguage(Locale.getDefault());
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { event("spoken", "{}"); }
                    @Override public void onError(String id) { event("spoken", "{}"); }
                });
            }
        });
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC);
        }
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (i != null && i.getBooleanExtra("zp_resume", false)) return;     // brought back during a task
        // Opened again (assistant gesture while already open): fresh look, listen again.
        grabOpeningScreen();
        main.postDelayed(() -> event("shown", "{\"voice\":true,\"again\":true}"), 500);
    }

    @Override protected void onResume() { super.onResume(); inFront = true; }
    @Override protected void onPause() { super.onPause(); inFront = false; }

    @Override protected void onDestroy() {
        if (sr != null) { try { sr.destroy(); } catch (Exception ignored) { } }
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) { } }
        if (ZpAccess.instance != null) ZpAccess.instance.pill(false, null);
        if (web != null) { web.removeJavascriptInterface("ZPAndroid"); web.destroy(); }
        super.onDestroy();
    }

    @Override public void onRequestPermissionsResult(int code, String[] p, int[] res) {
        super.onRequestPermissionsResult(code, p, res);
        if (code == REQ_MIC && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) event("micready", "{}");
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private float dp(float v) { return v * getResources().getDisplayMetrics().density; }
    private String version() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; } }
    private static boolean ours(Uri u) {
        if (u == null || !"https".equals(u.getScheme())) return false;
        String h = u.getHost();
        for (String o : OURS) if (o.equals(h)) return true;
        return false;
    }

    private void grabOpeningScreen() {
        final ZpAccess a = ZpAccess.instance;
        if (a == null) return;
        try { openText = a.allText(getPackageName()); } catch (Exception ignored) { }
        a.screenshot((bmp, err) -> {
            if (bmp == null) return;
            String[] enc = jpeg(bmp, 1080);
            openShot = enc[0]; openW = Integer.parseInt(enc[1]); openH = Integer.parseInt(enc[2]);
        });
    }

    /** → {dataUrl, width, height}, at most maxW wide. */
    private static String[] jpeg(Bitmap bmp, int maxW) {
        Bitmap b = bmp;
        if (bmp.getWidth() > maxW) b = Bitmap.createScaledBitmap(bmp, maxW, Math.round(bmp.getHeight() * (maxW / (float) bmp.getWidth())), true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 72, out);
        return new String[]{ "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP),
                String.valueOf(b.getWidth()), String.valueOf(b.getHeight()) };
    }

    private void reply(String id, boolean ok, String json) {
        main.post(() -> {
            if (web == null) return;
            web.evaluateJavascript("window.__zpaDone&&window.__zpaDone(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(json == null ? "null" : json) + ")", null);
        });
    }
    private void fail(String id, String msg) { reply(id, false, JSONObject.quote(msg)); }
    private void event(String name, String json) {
        main.post(() -> {
            if (web == null) return;
            web.evaluateJavascript("window.__zpaEvent&&window.__zpaEvent(" + JSONObject.quote(name) + "," + JSONObject.quote(json) + ")", null);
        });
    }

    private void toBack(Runnable then) {
        if (inFront) { moveTaskToBack(true); main.postDelayed(then, 450); } else then.run();
    }
    private void toFront() {
        if (inFront) return;
        try {
            startActivity(new Intent(this, ZpAssistActivity.class).putExtra("zp_resume", true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        } catch (Exception ignored) { }
    }

    private List<String[]> apps() {
        if (appsCache != null) return appsCache;
        List<String[]> list = new ArrayList<>();
        try {
            PackageManager pm = getPackageManager();
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
                String label = String.valueOf(ri.loadLabel(pm));
                list.add(new String[]{ label, ri.activityInfo.packageName });
            }
            Collections.sort(list, (x, y) -> x[0].compareToIgnoreCase(y[0]));
        } catch (Exception ignored) { }
        appsCache = list;
        return list;
    }
    private static String norm(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", ""); }
    private String launch(String name) {
        String want = norm(name);
        String[] hit = null;
        for (String[] a : apps()) if (norm(a[0]).equals(want)) { hit = a; break; }
        if (hit == null) for (String[] a : apps()) if (norm(a[0]).startsWith(want) || (want.length() >= 4 && norm(a[0]).contains(want))) { hit = a; break; }
        if (hit == null) return "\"" + name + "\" isn't installed on this phone.";
        Intent i = getPackageManager().getLaunchIntentForPackage(hit[1]);
        if (i == null) return "\"" + name + "\" can't be opened.";
        startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        return null;
    }

    private String phoneFor(String who) {
        if (who == null || who.trim().isEmpty()) return null;
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.READ_CONTACTS }, REQ_CONTACTS);
            return "";
        }
        Uri u = Uri.withAppendedPath(ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI, Uri.encode(who.trim()));
        try (Cursor c = getContentResolver().query(u, new String[]{ ContactsContract.CommonDataKinds.Phone.NUMBER }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return null;
    }

    /** Alarms, timers, calls… Returns an error message, or null when it worked. */
    private String quick(JSONObject a) {
        String t = a.optString("type");
        try {
            switch (t) {
                case "alarm":
                    startActivity(new Intent(AlarmClock.ACTION_SET_ALARM).putExtra(AlarmClock.EXTRA_HOUR, a.optInt("hour"))
                            .putExtra(AlarmClock.EXTRA_MINUTES, a.optInt("minute")).putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("label", "Zelpophai"))
                            .putExtra(AlarmClock.EXTRA_SKIP_UI, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                case "timer":
                    startActivity(new Intent(AlarmClock.ACTION_SET_TIMER).putExtra(AlarmClock.EXTRA_LENGTH, a.optInt("seconds"))
                            .putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("label", "Zelpophai")).putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                case "launch": return launch(a.optString("app"));
                case "call": case "sms": {
                    String num = a.optString("number", "");
                    if (num.isEmpty()) {
                        String found = phoneFor(a.optString("who"));
                        if (found != null && found.isEmpty()) return "Allow Zelpophai to see your contacts, then ask again.";
                        if (found == null) return "I couldn't find " + a.optString("who") + " in your contacts.";
                        num = found;
                    }
                    if (t.equals("call")) startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(num))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    else startActivity(new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(num))).putExtra("sms_body", a.optString("body", ""))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                }
                case "maps":
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(a.optString("query")))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                case "web":
                    try { startActivity(new Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, a.optString("query")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                    catch (ActivityNotFoundException e) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(a.optString("query")))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                    return null;
                case "url": {
                    Uri u = Uri.parse(a.optString("url"));
                    if (!"https".equals(u.getScheme()) && !"http".equals(u.getScheme())) return "Only web links can be opened.";
                    startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                }
                case "settings": {
                    String pg = a.optString("page", "main");
                    String act = pg.equals("wifi") ? Settings.ACTION_WIFI_SETTINGS : pg.equals("bluetooth") ? Settings.ACTION_BLUETOOTH_SETTINGS
                            : pg.equals("display") ? Settings.ACTION_DISPLAY_SETTINGS : pg.equals("sound") ? Settings.ACTION_SOUND_SETTINGS
                            : pg.equals("battery") ? Intent.ACTION_POWER_USAGE_SUMMARY : pg.equals("location") ? Settings.ACTION_LOCATION_SOURCE_SETTINGS
                            : pg.equals("apps") ? Settings.ACTION_APPLICATION_SETTINGS : Settings.ACTION_SETTINGS;
                    startActivity(new Intent(act).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
                }
                case "flashlight": {
                    if (Build.VERSION.SDK_INT < 23) return "This phone's torch can't be switched from apps.";
                    CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                    for (String id : cm.getCameraIdList()) {
                        Boolean has = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                        if (has != null && has) { cm.setTorchMode(id, a.optBoolean("on", true)); return null; }
                    }
                    return "This phone doesn't have a torch.";
                }
                case "camera":
                    startActivity(new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return null;
            }
        } catch (ActivityNotFoundException e) {
            return "There's no app on this phone for that.";
        } catch (Exception e) {
            return "That didn't work on this phone.";
        }
        return "I can't do that on a phone yet.";
    }

    // ── listening ─────────────────────────────────────────────────────────
    private void listen(String id) {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC);
            fail(id, "Allow the microphone, then tap the circle.");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { fail(id, "Speech recognition isn't available on this phone — type instead."); return; }
        if (tts != null) tts.stop();
        if (sr == null) {
            sr = SpeechRecognizer.createSpeechRecognizer(this);
            sr.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onError(int e) {
                    if (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) speech("final", "");
                    else speech("error", e == SpeechRecognizer.ERROR_NETWORK || e == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                            ? "No internet for listening — type instead." : e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                            ? "Allow the microphone for Zelpophai." : "I couldn't hear that — tap to try again.");
                }
                @Override public void onResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    speech("final", r != null && !r.isEmpty() ? r.get(0) : "");
                }
                @Override public void onPartialResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty() && r.get(0).length() > 0) speech("partial", r.get(0));
                }
                @Override public void onEvent(int t, Bundle b) { }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName())
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
        sr.startListening(i);
        reply(id, true, "true");
    }
    private void speech(String kind, String text) {
        try { event("speech", new JSONObject().put(kind, text).toString()); } catch (Exception ignored) { }
    }

    // ── the bridge ────────────────────────────────────────────────────────
    private class Bridge {
        @JavascriptInterface
        public void call(final String method, final String args, final String id) {
            main.post(() -> {
                // Only Zelpophai's own pages may use the phone.
                if (web == null || !ours(Uri.parse(String.valueOf(web.getUrl())))) { fail(id, "Not allowed"); return; }
                JSONObject a;
                try { a = args == null || args.equals("null") ? new JSONObject() : new JSONObject(args); } catch (Exception e) { a = new JSONObject(); }
                try { handle(method, a, id); } catch (Exception e) { fail(id, "Something went wrong on the phone."); }
            });
        }
    }

    private void handle(String m, JSONObject a, String id) throws Exception {
        switch (m) {
            case "info":
                reply(id, true, new JSONObject().put("version", version()).put("access", ZpAccess.on())
                        .put("seesScreen", ZpAccess.on() && Build.VERSION.SDK_INT >= 30).toString());
                return;
            case "lastCapture":
                if (openShot == null) { reply(id, true, "null"); return; }
                reply(id, true, new JSONObject().put("image", openShot).put("width", openW).put("height", openH).toString());
                return;
            case "screenText": reply(id, true, JSONObject.quote(openText == null ? "" : openText)); return;
            case "clipboard": {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                ClipData c = cm == null ? null : cm.getPrimaryClip();
                String t = c != null && c.getItemCount() > 0 && c.getItemAt(0).getText() != null ? c.getItemAt(0).getText().toString() : "";
                reply(id, true, JSONObject.quote(t.length() > 20000 ? t.substring(0, 20000) : t));
                return;
            }
            case "copy": {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Zelpophai", a.optString("text")));
                reply(id, true, "true");
                return;
            }
            case "apps": {
                JSONArray arr = new JSONArray();
                for (String[] x : apps()) { if (arr.length() >= 300) break; arr.put(x[0]); }
                reply(id, true, arr.toString());
                return;
            }
            case "quick": {
                JSONArray acts = a.optJSONArray("actions");
                String err = null;
                for (int i = 0; acts != null && i < acts.length() && i < 2; i++) { String e = quick(acts.getJSONObject(i)); if (e != null) err = e; }
                if (err != null) fail(id, err); else reply(id, true, "true");
                return;
            }
            case "listen": listen(id); return;
            case "stopListening": if (sr != null) sr.stopListening(); reply(id, true, "true"); return;
            case "speak": {
                if (!ttsReady) { fail(id, "Speaking isn't ready"); return; }
                tts.speak(a.optString("text"), TextToSpeech.QUEUE_FLUSH, null, "zp" + System.currentTimeMillis());
                reply(id, true, "true");
                return;
            }
            case "stopSpeaking": if (tts != null) tts.stop(); reply(id, true, "true"); return;
            case "hide": finish(); reply(id, true, "true"); return;
            case "showPanel": toFront(); reply(id, true, "true"); return;
            case "openInApp": {
                String p = a.optString("path", "/app");
                if (!p.startsWith("/")) p = "/app";
                startActivity(new Intent(this, MainActivity.class).putExtra("zp_path", p).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
                finish();
                reply(id, true, "true");
                return;
            }
            case "controlStart": {
                if (!ZpAccess.on()) {
                    try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
                    reply(id, true, "false");
                    return;
                }
                running = true;
                ZpAccess.instance.pill(true, () -> event("stop", "{}"));
                reply(id, true, "true");
                return;
            }
            case "controlEnd":
                running = false;
                if (ZpAccess.instance != null) ZpAccess.instance.pill(false, null);
                toFront();
                reply(id, true, "true");
                return;
            case "capture": {
                final ZpAccess acc = ZpAccess.instance;
                if (acc == null) { fail(id, "Switch on Zelpophai in Accessibility settings so I can see the screen."); return; }
                toBack(() -> shoot(acc, id, 0));
                return;
            }
            case "act": {
                if (!running) { fail(id, "Stopped"); return; }
                String t = a.optString("type");
                if (t.equals("wait")) { main.postDelayed(() -> reply(id, true, "true"), Math.max(100, Math.min(3000, a.optInt("ms", 800)))); return; }
                if (t.equals("launch")) { String e = launch(a.optString("app")); if (e != null) fail(id, e); else main.postDelayed(() -> reply(id, true, "true"), 2000); return; }
                if (t.equals("open")) { String e = quick(new JSONObject().put("type", "url").put("url", a.optString("url"))); if (e != null) fail(id, e); else main.postDelayed(() -> reply(id, true, "true"), 1500); return; }
                final ZpAccess acc = ZpAccess.instance;
                if (acc == null) { fail(id, "Zelpophai's Accessibility setting was switched off."); return; }
                final JSONObject act = a;
                toBack(() -> acc.act(act, err -> { if (err != null) fail(id, err); else main.postDelayed(() -> reply(id, true, "true"), 350); }));
                return;
            }
            default: fail(id, "Unknown request");
        }
    }

    private void shoot(final ZpAccess acc, final String id, final int tries) {
        acc.screenshot((bmp, err) -> {
            if (bmp == null) {
                if ("busy".equals(err) && tries < 3) { main.postDelayed(() -> shoot(acc, id, tries + 1), 400); return; }
                fail(id, err == null ? "Couldn't see the screen." : err);
                return;
            }
            try {
                String[] enc = jpeg(bmp, 1080);
                float scale = Integer.parseInt(enc[1]) / (float) bmp.getWidth();
                JSONArray els = acc.elements(scale, getPackageName());
                reply(id, true, new JSONObject().put("image", enc[0]).put("width", Integer.parseInt(enc[1]))
                        .put("height", Integer.parseInt(enc[2])).put("elements", els).toString());
            } catch (Exception e) { fail(id, "Couldn't read the screen."); }
        });
    }
}
