"""Sets version, permissions and network settings in the generated Android project."""
import re, sys
# 1.1: the assistant (hold home / power), its Accessibility service, the Quick
# Settings tile and the "Talk to Zelpophai" icon shortcut.
import os, shutil

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "native")

ASSIST = '''
        <activity
            android:name=".ZpAssistActivity"
            android:label="Zelpophai"
            android:theme="@android:style/Theme.Translucent.NoTitleBar"
            android:launchMode="singleTask"
            android:taskAffinity="com.zelpophai.app.assistant"
            android:excludeFromRecents="true"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|screenLayout|uiMode"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.ASSIST" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VOICE_COMMAND" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        <service
            android:name=".ZpAccess"
            android:label="@string/zp_access_label"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data android:name="android.accessibilityservice" android:resource="@xml/zp_access" />
        </service>

        <service
            android:name=".ZpTile"
            android:label="@string/zp_tile"
            android:icon="@mipmap/ic_launcher"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
        </service>
    </application>'''

LAUNCHER = '''                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>'''

QUERIES = '''    <queries>
        <intent><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
        <intent><action android:name="android.intent.action.DIAL" /></intent>
        <intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="smsto" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="geo" /></intent>
        <intent><action android:name="android.intent.action.WEB_SEARCH" /></intent>
        <intent><action android:name="android.media.action.STILL_IMAGE_CAMERA" /></intent>
        <intent><action android:name="android.intent.action.SET_ALARM" /></intent>
    </queries>
</manifest>'''


# 1.2: "Hey Zelpophai" — on-phone wake word (Vosk) in a microphone foreground service.
WAKE = '''
        <service
            android:name=".ZpWake"
            android:exported="false"
            android:foregroundServiceType="microphone" />'''


def add_wake_gradle():
    g = "android/app/build.gradle"
    t = open(g).read()
    if "vosk-android" not in t:
        t = t.replace("dependencies {", "dependencies {\n    implementation 'com.alphacephei:vosk-android:0.3.47@aar'\n    implementation 'net.java.dev.jna:jna:5.13.0@aar'", 1)
        open(g, "w").write(t)


def add_assistant(s):
    java = "android/app/src/main/java/com/zelpophai/app"
    for f in ("MainActivity.java", "ZpAssistActivity.java", "ZpAccess.java", "ZpTile.java", "ZpWake.java"):
        shutil.copy(os.path.join(SRC, f), os.path.join(java, f))
    res = "android/app/src/main/res"
    for sub in ("xml", "values"):
        os.makedirs(os.path.join(res, sub), exist_ok=True)
        for f in os.listdir(os.path.join(SRC, "res", sub)):
            shutil.copy(os.path.join(SRC, "res", sub, f), os.path.join(res, sub, f))
    add_wake_gradle()
    if "ZpWake" not in s and "ZpAssistActivity" in s:
        s = s.replace("    </application>", WAKE + "\n    </application>", 1)
    if "ZpAssistActivity" in s:
        return s
    s = s.replace("    </application>", ASSIST, 1)
    s = s.replace("    </application>", WAKE + "\n    </application>", 1)
    # long-press the app icon → "Talk to Zelpophai"
    s = s.replace(LAUNCHER, LAUNCHER + '\n            <meta-data android:name="android.app.shortcuts" android:resource="@xml/zp_shortcuts" />', 1)
    # Android 11+ only lets an app see the apps it asks about (needed to open apps by name).
    s = s.replace("</manifest>", QUERIES, 1)
    return s


version, code = sys.argv[1], sys.argv[2]
g = "android/app/build.gradle"
s = open(g).read()
s = re.sub(r"versionCode \d+", f"versionCode {code}", s)
s = re.sub(r'versionName "[^"]*"', f'versionName "{version}"', s)
open(g, "w").write(s)
m = "android/app/src/main/AndroidManifest.xml"
s = open(m).read()
perms = ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS",
         "android.permission.POST_NOTIFICATIONS", "android.permission.CAMERA"]
for p in perms:
    if p not in s:
        s = s.replace("</manifest>", f'    <uses-permission android:name="{p}" />\n</manifest>')
perms += ["com.android.alarm.permission.SET_ALARM", "android.permission.READ_CONTACTS",
          "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MICROPHONE",
          "android.permission.SYSTEM_ALERT_WINDOW"]
for p in perms:
    if p not in s:
        s = s.replace("</manifest>", f'    <uses-permission android:name="{p}" />\n</manifest>')
s = add_assistant(s)
open(m, "w").write(s)
print("patched", version, code)
