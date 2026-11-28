package com.zelpophai.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * "Hey Zelpophai": listens for the wake phrase and opens the assistant.
 *
 * Everything it hears is processed ON THE PHONE by a small offline speech model
 * (Vosk, downloaded once, about 40 MB). Nothing is recorded, kept or sent
 * anywhere until the phrase is heard — then the normal assistant opens and
 * takes over. It only listens while the screen is on (to save battery), pauses
 * during calls, and shows a notification the whole time with a Stop button.
 */
public class ZpWake extends Service {
    static final String PREFS = "zp_wake";
    static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
    static final String MODEL_DIR = "vosk-model-small-en-us-0.15";
    private static final String CHANNEL = "zp_wake";
    private static final int NOTE = 7701;

    static volatile ZpWake instance;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private SpeechService speech;
    private boolean paused = false;     // the assistant is open, or the screen is off
    private long lastWake = 0;
    private String status = "starting";

    // ── turning it on and off from the app ───────────────────────────────
    static boolean wanted(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false); }

    static void setWanted(Context c, boolean on) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", on).apply();
        Intent i = new Intent(c, ZpWake.class);
        if (on) {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } else c.stopService(i);
    }

    /** The assistant opened or closed: let go of the microphone / take it back. */
    static void assistantOpen(boolean open) {
        ZpWake w = instance;
        if (w != null) w.main.post(() -> { if (open) w.pause("assistant"); else w.resume(); });
    }

    static String statusJson(Context c) {
        try {
            boolean mic = Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            boolean overlay = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
            ZpWake w = instance;
            return new JSONObject().put("on", wanted(c)).put("running", w != null)
                    .put("status", w != null ? w.status : (wanted(c) ? "stopped" : "off"))
                    .put("model", new File(c.getFilesDir(), MODEL_DIR + "/am").exists())
                    .put("mic", mic).put("overlay", overlay).toString();
        } catch (Exception e) { return "{}"; }
    }

    // ── service ──────────────────────────────────────────────────────────
    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screen, f);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = note("Getting ready…");
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTE, n);
        } catch (Exception e) {
            // Android won't let a microphone service start from the background (e.g. after a restart):
            // it comes back the next time Zelpophai is opened.
            status = "needs the app opened";
            stopSelf();
            return START_NOT_STICKY;
        }
        if (model == null) new Thread(this::prepare, "zp-wake-model").start();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        try { unregisterReceiver(screen); } catch (Exception ignored) { }
        stopListening();
        if (model != null) { try { model.close(); } catch (Exception ignored) { } model = null; }
        super.onDestroy();
    }

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) pause("screen off");
            else resume();
        }
    };

    // ── the speech model (downloaded once) ───────────────────────────────
    private void prepare() {
        try {
            File dir = new File(getFilesDir(), MODEL_DIR);
            if (!new File(dir, "am").exists()) download();
            setStatus("loading");
            model = new Model(dir.getAbsolutePath());
            main.post(this::resume);
        } catch (Exception e) {
            setStatus("couldn't get the speech model — check your internet and switch it on again");
            main.postDelayed(this::stopSelf, 4000);
        }
    }

    private void download() throws Exception {
        setStatus("downloading 0%");
        File zip = new File(getCacheDir(), "vosk.zip");
        HttpURLConnection c = (HttpURLConnection) new URL(MODEL_URL).openConnection();
        c.setConnectTimeout(20000); c.setReadTimeout(30000);
        long total = c.getContentLengthLong(), got = 0; int lastPct = -1;
        try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream out = new FileOutputStream(zip)) {
            byte[] buf = new byte[1 << 16]; int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n); got += n;
                int pct = total > 0 ? (int) (got * 100 / total) : -1;
                if (pct != lastPct && pct % 5 == 0) { lastPct = pct; setStatus("downloading " + pct + "%"); }
            }
        } finally { c.disconnect(); }
        setStatus("unpacking");
        File base = getFilesDir();
        String root = base.getCanonicalPath() + File.separator;
        try (ZipInputStream z = new ZipInputStream(new BufferedInputStream(new java.io.FileInputStream(zip)))) {
            ZipEntry e;
            byte[] buf = new byte[1 << 16];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(base, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) throw new SecurityException("bad zip");   // no ../ tricks
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (OutputStream o = new FileOutputStream(f)) { int n; while ((n = z.read(buf)) > 0) o.write(buf, 0, n); }
            }
        }
        zip.delete();
    }

    // ── listening ────────────────────────────────────────────────────────
    private void resume() {
        if (model == null) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null && !pm.isInteractive()) { pause("screen off"); return; }
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (am != null && am.getMode() != AudioManager.MODE_NORMAL) {         // in a call
            setStatus("paused during a call");
            main.postDelayed(this::resume, 15000);
            return;
        }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            setStatus("needs the microphone"); return;
        }
        paused = false;
        if (speech != null) return;
        try {
            Recognizer rec = new Recognizer(model, 16000.0f);
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(listener);
            setStatus("listening");
        } catch (Exception e) {
            speech = null;
            setStatus("the microphone is busy");
            main.postDelayed(this::resume, 10000);
        }
    }

    private void pause(String why) {
        paused = true;
        stopListening();
        setStatus("paused (" + why + ")");
    }

    private void stopListening() {
        if (speech != null) {
            try { speech.stop(); speech.shutdown(); } catch (Exception ignored) { }
            speech = null;
        }
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onPartialResult(String h) { check(h, "partial"); }
        @Override public void onResult(String h) { check(h, "text"); }
        @Override public void onFinalResult(String h) { check(h, "text"); }
        @Override public void onError(Exception e) { stopListening(); main.postDelayed(ZpWake.this::resume, 3000); }
        @Override public void onTimeout() { stopListening(); main.post(ZpWake.this::resume); }
    };

    private void check(String json, String key) {
        String text;
        try { text = new JSONObject(json).optString(key, ""); } catch (Exception e) { return; }
        if (text.isEmpty() || !heard(text)) return;
        long now = System.currentTimeMillis();
        if (now - lastWake < 4000) return;
        lastWake = now;
        main.post(() -> {
            pause("assistant");
            try {
                startActivity(new Intent(this, ZpAssistActivity.class).putExtra("zp_wake", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
            } catch (Exception e) { /* blocked: the notification still lets them tap to talk */ }
            // If the assistant never opened (or never reports back), listen again later.
            main.postDelayed(() -> { if (paused && ZpAssistActivity.open == 0) resume(); }, 8000);
        });
    }

    /** Does this sound like "hey Zelpophai"? The small model has never seen the
     *  name, so it hears things like "hey sell pop high" — compare by sound. */
    static boolean heard(String said) {
        String[] w = said.toLowerCase(Locale.ROOT).replaceAll("[^a-z ]", " ").trim().split("\\s+");
        for (int i = 0; i < w.length; i++) {
            if (!(w[i].equals("hey") || w[i].equals("hi") || w[i].equals("hay") || w[i].equals("okay") || w[i].equals("ok"))) continue;
            StringBuilder sb = new StringBuilder();
            for (int j = i + 1; j < w.length && j <= i + 4; j++) {
                sb.append(w[j]);
                String s = sound(sb.toString());
                if (s.matches(".*ala?p.*") && dist(s, TARGET) <= 2) return true;
            }
        }
        return false;
    }
    static final String TARGET = sound("zelpophai");   // "salpafa"

    /** A rough spelling of how it sounds: ph/v → f, z/c/x → s, h dropped,
     *  each run of vowels → "a", doubled letters → one. */
    static String sound(String s) {
        s = s.replace("ph", "f").replace("gh", "").replace("z", "s").replace("c", "s").replace("x", "s").replace("v", "f").replace("h", "");
        s = s.replaceAll("[aeiouy]+", "a");
        return s.replaceAll("(.)\\1+", "$1");
    }

    static int dist(String a, String b) {
        int[] p = new int[b.length() + 1], q = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) p[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            q[0] = i;
            for (int j = 1; j <= b.length(); j++)
                q[j] = Math.min(Math.min(q[j - 1] + 1, p[j] + 1), p[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
            int[] t = p; p = q; q = t;
        }
        return p[b.length()];
    }

    // ── notification ─────────────────────────────────────────────────────
    private void setStatus(String s) {
        status = s;
        main.post(() -> {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTE, note(label(s)));
        });
    }
    private static String label(String s) {
        if (s.equals("listening")) return "Listening for “Hey Zelpophai” — heard only on your phone";
        if (s.startsWith("downloading")) return "Getting the speech model ready: " + s.substring(12);
        return "Hey Zelpophai: " + s;
    }

    private Notification note(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Hey Zelpophai", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while Zelpophai listens for its name");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent talk = PendingIntent.getActivity(this, 1, new Intent(this, ZpAssistActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), imm);
        PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, ZpWake.class).setAction("stop"), imm);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Zelpophai").setContentText(text)
         .setOngoing(true).setContentIntent(talk).setShowWhen(false)
         .addAction(new Notification.Action.Builder(null, "Stop listening", stop).build());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }

    static void openOverlaySettings(Context c) {
        if (Build.VERSION.SDK_INT >= 23) {
            c.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
