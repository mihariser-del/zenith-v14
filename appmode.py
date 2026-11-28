"""Bits added to every page's <head>.

1. App mode: the Windows app adds "ZelpophaiDesktop/<ver>" to its user agent and
   the Android app adds "ZelpophaiAndroid/<ver>". Inside either app the page gets
   <html class="zp-in-app zp-in-desktop|zp-in-android"> and anything that tells you
   to download the app (links to /download, #get-app-btn, .web-only) is hidden —
   you already have it.
2. Copyright year: any <span class="zp-year"> shows the current year.
"""

SNIPPET = (
    '<script>(function(){try{var u=navigator.userAgent||"",c=document.documentElement.classList,'
    'd=/ZelpophaiDesktop/.test(u)||!!window.zelpophaiDesktop,a=/ZelpophaiAndroid/.test(u)||!!window.ZPApp;'
    'if(d||a){c.add("zp-in-app");c.add(d?"zp-in-desktop":"zp-in-android");}'
    'document.addEventListener("DOMContentLoaded",function(){var y=String(new Date().getFullYear());'
    'document.querySelectorAll(".zp-year").forEach(function(e){e.textContent=y;});});}catch(e){}})();</script>'
    '<style>html.zp-in-app .web-only,html.zp-in-app #get-app-btn,html.zp-in-app a[href="/download"],'
    'html.zp-in-app a[href^="/download?"],html.zp-in-app a[href^="/download#"],'
    'html.zp-in-app a[href^="https://zelpophai.com/download"]{display:none!important}'
    'html:not(.zp-in-app) .app-only{display:none!important}</style>'
)


def inject(html: str) -> str:
    if 'zp-in-app' in html[:4000] and 'navigator.userAgent' in html[:4000]:
        return html
    i = html.find("<head>")
    if i == -1:
        i = html.lower().find("<head")
        if i != -1:
            i = html.find(">", i)
            return html[:i + 1] + SNIPPET + html[i + 1:] if i != -1 else SNIPPET + html
        return SNIPPET + html
    return html[:i + 6] + SNIPPET + html[i + 6:]
