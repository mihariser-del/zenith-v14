"""Sets version, permissions and network settings in the generated Android project."""
import re, sys
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
open(m, "w").write(s)
print("patched", version, code)
