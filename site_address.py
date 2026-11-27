"""Zelpophai's public address, decided in one place.

Since 24.2 the site lives at https://zelpophai.com. The old Railway address
(zelpophai.up.railway.app) still works — it has to, because the Windows and
Android apps already installed on people's devices are locked to it — but web
browsers that land there are sent on to zelpophai.com so search engines move
their listing across rather than showing two copies of the site.

`base()` is what every canonical link, sitemap entry, share link and payment
return address should use.
"""

import os
import re

CANONICAL_HOST = "zelpophai.com"
CANONICAL = "https://" + CANONICAL_HOST

# Hosts that should hand web visitors over to the canonical one.
OLD_HOSTS = {"zelpophai.up.railway.app", "www.zelpophai.com"}

# The installed apps say who they are in their user agent. They must never be
# redirected: both only trust the address they were built with, and a redirect
# makes the Windows app open every link in the browser and breaks Zelpophai
# Mini, and makes the Android app throw people out into Chrome.
_APP_UA = re.compile(r"ZelpophaiDesktop|ZelpophaiAndroid|ZelpophaiMini|Electron|electron-builder", re.I)

# Never redirect these, whoever is asking:
#   /api/       a 301 turns a POST into a GET and would break every action
#   /static/    the service worker and cached files
#   /downloads/ the Windows app checks here for updates
#   /.well-known/ certificate and app-link checks
_KEEP = ("/api/", "/static/", "/downloads/", "/.well-known/", "/sw.js", "/healthz", "/health")


def base() -> str:
    """The address to put in links. An APP_BASE_URL still pointing at the old
    Railway address is ignored, so a forgotten setting can't undo the move."""
    env = (os.getenv("APP_BASE_URL") or "").strip().rstrip("/")
    if env and "up.railway.app" not in env:
        return env
    return CANONICAL


def is_app(user_agent: str) -> bool:
    return bool(_APP_UA.search(user_agent or ""))


def redirect_for(host: str, method: str, path: str, query: str, user_agent: str) -> str | None:
    """Where a request should be sent instead, or None to serve it as it is."""
    h = (host or "").split(":")[0].lower()
    if h not in OLD_HOSTS:
        return None
    if method not in ("GET", "HEAD"):
        return None
    if is_app(user_agent):
        return None
    if any(path == k.rstrip("/") or path.startswith(k) for k in _KEEP):
        return None
    return CANONICAL + path + (("?" + query) if query else "")
