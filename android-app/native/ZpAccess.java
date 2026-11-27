package com.zelpophai.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.view.Display;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Zelpophai's Accessibility service. Only does anything while the person has a
 * Zelpophai task running (or has just opened the assistant): it reads what's on
 * screen, takes a screenshot (Android 11+), and taps / types / scrolls for the
 * task. It never runs on its own and ignores every event it is sent.
 */
public class ZpAccess extends AccessibilityService {
    static volatile ZpAccess instance;

    public interface Shot { void done(Bitmap bmp, String error); }
    public interface Done { void done(String error); }

    private final Handler main = new Handler(Looper.getMainLooper());
    /** Elements from the last read of the screen, by the id the AI was given. */
    private final Map<Integer, AccessibilityNodeInfo> nodes = new HashMap<>();
    /** Scale from real screen pixels to the screenshot the AI saw. */
    float scale = 1f;

    @Override protected void onServiceConnected() { instance = this; }
    @Override public boolean onUnbind(android.content.Intent i) { instance = null; return super.onUnbind(i); }
    @Override public void onDestroy() { instance = null; super.onDestroy(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) { }
    @Override public void onInterrupt() { }

    static boolean on() { return instance != null; }

    // ── seeing the screen ─────────────────────────────────────────────────
    void screenshot(final Shot cb) {
        if (Build.VERSION.SDK_INT < 30) { cb.done(null, "Seeing the screen needs Android 11 or newer."); return; }
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override public void onSuccess(ScreenshotResult r) {
                    try {
                        Bitmap hw = Bitmap.wrapHardwareBuffer(r.getHardwareBuffer(), r.getColorSpace());
                        Bitmap soft = hw == null ? null : hw.copy(Bitmap.Config.ARGB_8888, false);
                        r.getHardwareBuffer().close();
                        cb.done(soft, soft == null ? "Couldn't read the screenshot." : null);
                    } catch (Throwable t) { cb.done(null, "Couldn't read the screenshot."); }
                }
                @Override public void onFailure(int code) {
                    cb.done(null, code == ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT ? "busy" : "The phone wouldn't take a screenshot (" + code + ").");
                }
            });
        } catch (Throwable t) { cb.done(null, "The phone wouldn't take a screenshot."); }
    }

    /** Everything worth knowing about on screen (other apps only), in screenshot
     *  coordinates. Ids are remembered so the AI can act on "#12". */
    JSONArray elements(float scaleToShot, String ownPackage) {
        scale = scaleToShot;
        for (AccessibilityNodeInfo n : nodes.values()) { try { n.recycle(); } catch (Throwable ignored) { } }
        nodes.clear();
        JSONArray out = new JSONArray();
        List<AccessibilityNodeInfo> roots = new ArrayList<>();
        try {
            for (AccessibilityWindowInfo w : getWindows()) {
                AccessibilityNodeInfo r = w.getRoot();
                if (r == null) continue;
                CharSequence pkg = r.getPackageName();
                if (pkg != null && pkg.toString().equals(ownPackage)) continue;
                roots.add(r);
            }
        } catch (Throwable ignored) { }
        if (roots.isEmpty()) { AccessibilityNodeInfo r = getRootInActiveWindow(); if (r != null) roots.add(r); }
        int[] next = {1};
        for (AccessibilityNodeInfo r : roots) walk(r, out, next, 0);
        return out;
    }

    private void walk(AccessibilityNodeInfo n, JSONArray out, int[] next, int depth) {
        if (n == null || depth > 40 || out.length() >= 220) return;
        if (!n.isVisibleToUser()) return;
        CharSequence t = n.getText(), d = n.getContentDescription();
        String text = t != null && t.length() > 0 ? t.toString() : (d != null ? d.toString() : "");
        if (n.isPassword()) text = "(password box)";
        boolean act = n.isClickable() || n.isLongClickable() || n.isEditable() || n.isCheckable() || n.isScrollable();
        if (act || text.trim().length() > 0) {
            Rect b = new Rect(); n.getBoundsInScreen(b);
            if (b.width() > 2 && b.height() > 2) {
                try {
                    int id = next[0]++;
                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("kind", kind(n));
                    o.put("text", text.length() > 120 ? text.substring(0, 120) : text);
                    o.put("x", Math.round(b.centerX() * scale));
                    o.put("y", Math.round(b.centerY() * scale));
                    o.put("w", Math.round(b.width() * scale));
                    o.put("h", Math.round(b.height() * scale));
                    out.put(o);
                    nodes.put(id, AccessibilityNodeInfo.obtain(n));
                } catch (Throwable ignored) { }
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo c = n.getChild(i);
            walk(c, out, next, depth + 1);
        }
    }

    private static String kind(AccessibilityNodeInfo n) {
        if (n.isEditable()) return "textbox";
        if (n.isCheckable()) return n.isChecked() ? "on" : "off";
        if (n.isScrollable()) return "list";
        CharSequence c = n.getClassName();
        String cls = c == null ? "" : c.toString();
        if (cls.endsWith("Button") || cls.endsWith("ImageButton")) return "button";
        if (cls.endsWith("ImageView")) return n.isClickable() ? "icon" : "image";
        if (n.isClickable()) return "tap";
        return "text";
    }

    /** All the text on screen, for answering questions about it. */
    String allText(String ownPackage) {
        StringBuilder sb = new StringBuilder();
        JSONArray els = elements(1f, ownPackage);
        for (int i = 0; i < els.length() && sb.length() < 9000; i++) {
            String t = els.optJSONObject(i).optString("text", "");
            if (t.trim().length() > 0) sb.append(t.trim()).append('\n');
        }
        return sb.toString();
    }

    // ── the "working" pill ────────────────────────────────────────────────
    private TextView pillView;
    /** A small "Zelpophai is working · Tap to stop" label over every app while a task runs. */
    void pill(final boolean on, final Runnable onStop) {
        main.post(() -> {
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            if (!on) {
                if (pillView != null) { try { wm.removeView(pillView); } catch (Throwable ignored) { } pillView = null; }
                return;
            }
            if (pillView != null) return;
            float d = getResources().getDisplayMetrics().density;
            TextView t = new TextView(this);
            t.setText("\u25CF  Zelpophai is working \u00B7 Tap to stop");
            t.setTextColor(Color.WHITE);
            t.setTextSize(13);
            t.setPadding((int) (14 * d), (int) (8 * d), (int) (14 * d), (int) (8 * d));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#E6312E81"));
            bg.setCornerRadius(40 * d);
            t.setBackground(bg);
            t.setOnClickListener(v -> { if (onStop != null) onStop.run(); });
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lp.y = (int) (34 * d);
            try { wm.addView(t, lp); pillView = t; } catch (Throwable ignored) { }
        });
    }

    // ── acting ────────────────────────────────────────────────────────────
    void act(JSONObject a, Done cb) {
        String type = a.optString("type");
        AccessibilityNodeInfo node = a.has("el") ? nodes.get(a.optInt("el")) : null;
        if (node != null) { try { node.refresh(); } catch (Throwable ignored) { } }
        switch (type) {
            case "back": cb.done(performGlobalAction(GLOBAL_ACTION_BACK) ? null : "Couldn't go back."); return;
            case "home": cb.done(performGlobalAction(GLOBAL_ACTION_HOME) ? null : "Couldn't go home."); return;
            case "recents": cb.done(performGlobalAction(GLOBAL_ACTION_RECENTS) ? null : "Couldn't open recent apps."); return;
            case "notifications": cb.done(performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS) ? null : "Couldn't open notifications."); return;
            case "tap": {
                if (node != null && clickable(node, AccessibilityNodeInfo.ACTION_CLICK)) { cb.done(null); return; }
                float[] p = point(a, node); if (p == null) { cb.done("I couldn't find that on screen any more."); return; }
                gesture(p[0], p[1], p[0], p[1], 60, cb); return;
            }
            case "long_press": {
                if (node != null && clickable(node, AccessibilityNodeInfo.ACTION_LONG_CLICK)) { cb.done(null); return; }
                float[] p = point(a, node); if (p == null) { cb.done("I couldn't find that on screen any more."); return; }
                gesture(p[0], p[1], p[0], p[1], 750, cb); return;
            }
            case "type": {
                AccessibilityNodeInfo box = node;
                if (box == null || !box.isEditable()) {
                    AccessibilityNodeInfo r = getRootInActiveWindow();
                    box = r == null ? null : r.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                }
                if (box == null) { cb.done("There's no text box selected to type into."); return; }
                if (box.isPassword()) { cb.done("I don't type into password boxes."); return; }
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, a.optString("text"));
                box.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                cb.done(box.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) ? null : "That box wouldn't take the text.");
                return;
            }
            case "scroll": {
                DisplayMetrics dm = getResources().getDisplayMetrics();
                float w = dm.widthPixels, h = dm.heightPixels, cx = w / 2f, cy = h / 2f;
                String dir = a.optString("direction", "down");
                if (dir.equals("down")) gesture(cx, h * 0.72f, cx, h * 0.28f, 350, cb);
                else if (dir.equals("up")) gesture(cx, h * 0.28f, cx, h * 0.72f, 350, cb);
                else if (dir.equals("left")) gesture(w * 0.8f, cy, w * 0.2f, cy, 300, cb);
                else gesture(w * 0.2f, cy, w * 0.8f, cy, 300, cb);
                return;
            }
            default: cb.done("I can't do \"" + type + "\" on a phone.");
        }
    }

    /** Click the node, or the nearest parent that can be clicked. */
    private static boolean clickable(AccessibilityNodeInfo n, int action) {
        AccessibilityNodeInfo cur = n;
        for (int i = 0; cur != null && i < 6; i++) {
            boolean can = action == AccessibilityNodeInfo.ACTION_CLICK ? cur.isClickable() : cur.isLongClickable();
            if (can && cur.isEnabled()) return cur.performAction(action);
            cur = cur.getParent();
        }
        return false;
    }

    /** Where to touch, in real screen pixels. */
    private float[] point(JSONObject a, AccessibilityNodeInfo node) {
        if (node != null) { Rect b = new Rect(); node.getBoundsInScreen(b); if (b.width() > 0) return new float[]{ b.exactCenterX(), b.exactCenterY() }; }
        if (a.has("x") && a.has("y")) {
            float s = scale <= 0 ? 1f : scale;
            return new float[]{ (float) a.optDouble("x") / s, (float) a.optDouble("y") / s };
        }
        return null;
    }

    private void gesture(float x1, float y1, float x2, float y2, long ms, final Done cb) {
        Path p = new Path(); p.moveTo(Math.max(0, x1), Math.max(0, y1));
        if (x1 != x2 || y1 != y2) p.lineTo(Math.max(0, x2), Math.max(0, y2));
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, Math.max(1, ms))).build();
        boolean ok = dispatchGesture(g, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription d) { main.postDelayed(() -> cb.done(null), 120); }
            @Override public void onCancelled(GestureDescription d) { cb.done("The phone cancelled that touch."); }
        }, null);
        if (!ok) cb.done("The phone didn't accept that touch.");
    }
}
