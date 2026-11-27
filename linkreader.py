"""Read a web page or PDF that someone pastes into a message.

Fetching any address a stranger gives you is a classic way to attack a server:
"read http://169.254.169.254/…" or "read http://10.0.0.5/admin" makes the
server fetch its own private network and hand the answer back. So before every
request — and again after every redirect — the address is resolved and refused
unless every IP it points at is a normal public one. On the live server the
connection is then pinned to the IP that passed the check, so the name can't
quietly switch to a private address between the check and the fetch.

Only http/https on the usual ports, 5 MB at most, 12 seconds at most, four
redirects at most. HTML is boiled down to its readable text with the standard
library's parser; PDFs go through pypdf.
"""

import asyncio
import io
import ipaddress
import os
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

MAX_BYTES = 5_000_000
TIMEOUT = 12.0
MAX_REDIRECTS = 4
MAX_CHARS = 14_000          # what goes to the AI per link
MAX_LINKS = 3
UA = "Mozilla/5.0 (compatible; ZelpophaiAI/1.0; +https://zelpophai.com/privacy)"

_URL_RE = re.compile(r"https?://[^\s<>\"'`)\]]+", re.I)


class Refused(Exception):
    """A plain-language reason the link can't be read."""


def find_links(text: str) -> list[str]:
    """The links in a message, in order, without trailing punctuation."""
    out = []
    for m in _URL_RE.finditer(text or ""):
        u = m.group(0).rstrip(".,;:!?")
        if u not in out:
            out.append(u)
        if len(out) >= MAX_LINKS:
            break
    return out


# ── the safety check ──────────────────────────────────────────────────────────
def _public(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped:
        a = a.ipv4_mapped
    return a.is_global and not (a.is_multicast or a.is_reserved or a.is_loopback or a.is_link_local or a.is_private)


async def _check(url: str) -> tuple[str, str, int, str]:
    """Is this address safe to fetch? Returns (scheme, host, port, first_public_ip)."""
    p = urlsplit(url)
    if p.scheme not in ("http", "https"):
        raise Refused("Only web links (http or https) can be read.")
    host = (p.hostname or "").strip().lower().rstrip(".")
    if not host:
        raise Refused("That link doesn't have a web address in it.")
    if p.username or p.password:
        raise Refused("Links with a password in them can't be read.")
    port = p.port or (443 if p.scheme == "https" else 80)
    if port not in (80, 443, 8080, 8443):
        raise Refused("That link uses an unusual port, so it can't be read.")
    if host in ("localhost",) or host.endswith((".local", ".internal", ".localhost", ".lan", ".home", ".corp")):
        raise Refused("That's a private address, so it can't be read.")
    try:
        infos = await asyncio.get_running_loop().run_in_executor(
            None, lambda: socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
    except socket.gaierror:
        raise Refused("That website couldn't be found.")
    ips = list(dict.fromkeys(i[4][0] for i in infos))
    if not ips or not all(_public(ip) for ip in ips):
        raise Refused("That address points somewhere private, so it can't be read.")
    return p.scheme, host, port, ips[0]


def _pinned_request(url: str, host: str, ip: str, port: int) -> tuple[str, dict, dict]:
    """Connect to the IP that passed the check, while still asking for — and
    checking the certificate of — the real host name."""
    p = urlsplit(url)
    ip_host = f"[{ip}]" if ":" in ip else ip
    netloc = ip_host if port in (80, 443) else f"{ip_host}:{port}"
    pinned = urlunsplit((p.scheme, netloc, p.path or "/", p.query, ""))
    headers = {"Host": host if port in (80, 443) else f"{host}:{port}"}
    ext = {"sni_hostname": host} if p.scheme == "https" else {}
    return pinned, headers, ext


async def _fetch(url: str) -> tuple[bytes, str, str]:
    """Fetch with every hop checked. Returns (body, content_type, final_url)."""
    # Behind an outbound proxy (local development) the proxy decides where we can
    # go and we can't pin the IP; on the live server there's no proxy, so we pin.
    proxied = bool(os.getenv("HTTPS_PROXY") or os.getenv("https_proxy"))
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": UA,
                                 "Accept": "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5"}) as c:
        for _ in range(MAX_REDIRECTS + 1):
            scheme, host, port, ip = await _check(url)
            if proxied:
                req = c.build_request("GET", url)
            else:
                target, extra, ext = _pinned_request(url, host, ip, port)
                req = c.build_request("GET", target, headers=extra, extensions=ext)
            r = await c.send(req, stream=True)
            try:
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location", "")
                    if not loc:
                        raise Refused("That page sent me somewhere without saying where.")
                    url = urljoin(url, loc)
                    continue
                if r.status_code == 404:
                    raise Refused("That page doesn't exist (404).")
                if r.status_code in (401, 403):
                    raise Refused("That page needs you to be signed in, so I can't read it.")
                if r.status_code >= 400:
                    raise Refused(f"That website answered with an error ({r.status_code}).")
                n = r.headers.get("content-length")
                if n and n.isdigit() and int(n) > MAX_BYTES:
                    raise Refused("That page is too big to read (over 5 MB).")
                chunks, size = [], 0
                async for chunk in r.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise Refused("That page is too big to read (over 5 MB).")
                    chunks.append(chunk)
                return b"".join(chunks), r.headers.get("content-type", "").lower(), url
            finally:
                await r.aclose()
        raise Refused("That link redirects too many times.")


# ── turning a page into text ──────────────────────────────────────────────────
class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "canvas", "form", "button", "select"}
    NOISE = {"nav", "footer", "aside", "header"}
    BLOCK = {"p", "div", "section", "article", "main", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6",
             "blockquote", "pre", "table", "ul", "ol", "dd", "dt", "figcaption"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.desc = "", ""
        self._skip = 0
        self._noise = 0
        self._in_title = False
        self.parts: list[str] = []
        self.main: list[str] = []
        self._in_main = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIP:
            self._skip += 1
        elif tag in self.NOISE:
            self._noise += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta" and (a.get("name", "").lower() == "description" or a.get("property", "").lower() == "og:description"):
            self.desc = self.desc or (a.get("content") or "").strip()
        if tag in ("article", "main"):
            self._in_main += 1
        if tag in self.BLOCK:
            self._add("\n")
        if tag in ("h1", "h2", "h3") and not self._skip:
            self._add("## ")
        if tag == "li":
            self._add("- ")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag in self.NOISE:
            self._noise = max(0, self._noise - 1)
        elif tag == "title":
            self._in_title = False
        if tag in ("article", "main"):
            self._in_main = max(0, self._in_main - 1)
        if tag in self.BLOCK:
            self._add("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self._skip or self._noise:
            return
        self._add(data)

    def _add(self, s):
        self.parts.append(s)
        if self._in_main:
            self.main.append(s)


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = [ln for ln in text.split("\n") if ln.strip() not in ("-", "##", "")]
    return "\n".join(lines).strip()


def _html_to_text(raw: bytes, ctype: str) -> tuple[str, str]:
    m = re.search(r"charset=([\w-]+)", ctype)
    enc = m.group(1) if m else "utf-8"
    try:
        html = raw.decode(enc, errors="replace")
    except LookupError:
        html = raw.decode("utf-8", errors="replace")
    p = _Text()
    try:
        p.feed(html)
        p.close()
    except Exception:
        pass
    body = _tidy("".join(p.main)) if len("".join(p.main).strip()) > 400 else _tidy("".join(p.parts))
    title = re.sub(r"\s+", " ", p.title).strip()
    if p.desc and p.desc not in body[:600]:
        body = p.desc.strip() + "\n\n" + body
    return title, body


def _pdf_to_text(raw: bytes) -> tuple[str, str]:
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(raw))
    title = ""
    try:
        title = (r.metadata.title or "") if r.metadata else ""
    except Exception:
        pass
    out = []
    for i, page in enumerate(r.pages[:60]):
        try:
            out.append(page.extract_text() or "")
        except Exception:
            continue
        if sum(len(x) for x in out) > MAX_CHARS * 2:
            break
    return title.strip(), _tidy("\n\n".join(out))


async def read(url: str) -> dict:
    """{ok, url, title, text, kind} — or {ok: False, url, error} with a plain reason."""
    try:
        raw, ctype, final = await _fetch(url)
        if "pdf" in ctype or final.lower().split("?")[0].endswith(".pdf") or raw[:5] == b"%PDF-":
            title, text, kind = *_pdf_to_text(raw), "PDF"
        elif "html" in ctype or "xml" in ctype or raw.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
            title, text = _html_to_text(raw, ctype)
            kind = "page"
        elif ctype.startswith("text/") or "json" in ctype:
            title, text, kind = "", _tidy(raw.decode("utf-8", errors="replace")), "text"
        else:
            raise Refused("That link is a file I can't read (" + (ctype.split(";")[0] or "unknown type") + ").")
        if len(text) < 40:
            raise Refused("That page didn't have any readable text — it may need JavaScript or a sign-in.")
        cut = len(text) > MAX_CHARS
        return {"ok": True, "url": final, "title": title[:200] or urlsplit(final).hostname,
                "text": text[:MAX_CHARS] + ("\n… (the page goes on)" if cut else ""), "kind": kind}
    except Refused as e:
        return {"ok": False, "url": url, "error": str(e)}
    except httpx.TimeoutException:
        return {"ok": False, "url": url, "error": "That website took too long to answer."}
    except httpx.HTTPError as e:
        return {"ok": False, "url": url, "error": f"Couldn't reach that website ({type(e).__name__})."}
    except Exception as e:
        print(f"[linkreader] {url}: {type(e).__name__}: {e}")
        return {"ok": False, "url": url, "error": "Something went wrong reading that link."}


def prompt_block(results: list[dict]) -> str:
    """What the AI is given, appended to the person's message."""
    out = []
    for r in results:
        if r.get("ok"):
            out.append(f"[The app read this link for you: {r['url']}]\nTitle: {r['title']}\n{r['text']}")
        else:
            out.append(f"[The app could NOT read {r['url']}: {r['error']}] Tell the user plainly, and help with what they "
                       "asked as best you can without it — never pretend you read it.")
    if any(r.get("ok") for r in results):
        out.append("[Answer from the page text above. When you quote or rely on it, say it's from that page. If the page "
                   "doesn't contain what they asked, say so rather than guessing.]")
    return "\n\n".join(out)
