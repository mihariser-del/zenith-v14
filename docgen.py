"""Zelpophai AI document engine.

Turns the Markdown the AI writes into real, good-looking files:
Word (.docx), PDF, PowerPoint (.pptx), Excel (.xlsx), CSV, HTML, Markdown,
plain text and code files.

Everything goes through one parser (mistune) into a small block/inline model,
so every format understands the same things: headings, bold/italic/code/links,
nested and task lists, tables (with alignment), code blocks, quotes and
GitHub-style callouts (> [!TIP]), images and horizontal rules.

The AI marks a file in its reply like this:

    <zfile name="Cover-Letter.docx">
    # Cover letter
    ...
    </zfile>

`extract_files()` finds those blocks; the chat stores each one, and the saved
message keeps the block (with the stored file's id) so the AI can still see the
content for follow-up edits and the app can show a file card after a reload.
"""

import csv
import html as _html
import io
import os
import re
from datetime import datetime, timezone

try:
    import mistune
    _MD = mistune.create_markdown(renderer=None, plugins=["table", "strikethrough", "task_lists", "url"])
except Exception:  # pragma: no cover - mistune is in requirements.txt
    _MD = None

BRAND = "#2563eb"      # blue
BRAND_2 = "#7c3aed"    # purple
INK = "#111827"
MUTED = "#6b7280"
LINE = "#e5e7eb"
SOFT = "#eff6ff"

CODE_EXT = {
    "py": "text/x-python", "js": "text/javascript", "ts": "text/plain", "jsx": "text/plain", "tsx": "text/plain",
    "json": "application/json", "css": "text/css", "sql": "text/plain", "java": "text/plain", "c": "text/plain",
    "cpp": "text/plain", "cs": "text/plain", "go": "text/plain", "rs": "text/plain", "php": "text/plain",
    "rb": "text/plain", "sh": "text/plain", "yaml": "text/plain", "yml": "text/plain", "xml": "application/xml",
    "kt": "text/plain", "swift": "text/plain", "dart": "text/plain", "lua": "text/plain", "r": "text/plain",
    "ini": "text/plain", "toml": "text/plain", "env": "text/plain", "svg": "image/svg+xml",
}
MIME = {
    "md": "text/markdown",
    "txt": "text/plain",
    "csv": "text/csv",
    "html": "text/html",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MIME.update(CODE_EXT)
SUPPORTED = set(MIME.keys())

FORMAT_LABEL = {
    "docx": "Word document", "pdf": "PDF", "pptx": "PowerPoint", "xlsx": "Excel sheet", "csv": "CSV",
    "html": "Web page", "md": "Markdown", "txt": "Text file",
}


def format_label(fmt):
    return FORMAT_LABEL.get(fmt, (fmt or "file").upper() + " file")


# ═════════════════════════════════════════════════════════════════ parsing ══
# Inline run: (text, style) where style is a frozenset of
# {"b","i","code","s"} plus an optional link url in a separate slot.
class Run:
    __slots__ = ("text", "b", "i", "code", "s", "link")

    def __init__(self, text, b=False, i=False, code=False, s=False, link=None):
        self.text, self.b, self.i, self.code, self.s, self.link = text, b, i, code, s, link


def _inlines(children, b=False, i=False, s=False, link=None):
    out = []
    for c in children or []:
        t = c.get("type")
        if t == "text":
            out.append(Run(c.get("raw", ""), b, i, False, s, link))
        elif t == "codespan":
            out.append(Run(c.get("raw", ""), b, i, True, s, link))
        elif t == "strong":
            out += _inlines(c.get("children"), True, i, s, link)
        elif t == "emphasis":
            out += _inlines(c.get("children"), b, True, s, link)
        elif t == "strikethrough":
            out += _inlines(c.get("children"), b, i, True, link)
        elif t == "link":
            out += _inlines(c.get("children"), b, i, s, (c.get("attrs") or {}).get("url"))
        elif t in ("softbreak",):
            out.append(Run(" ", b, i, False, s, link))
        elif t == "linebreak":
            out.append(Run("\n", b, i, False, s, link))
        elif t == "image":
            alt = "".join(r.text for r in _inlines(c.get("children")))
            out.append(Run(alt or "image", b, True, False, s, (c.get("attrs") or {}).get("url")))
        elif t == "inline_html":
            raw = re.sub(r"<br\s*/?>", "\n", c.get("raw", ""), flags=re.I)
            raw = re.sub(r"<[^>]+>", "", raw)
            if raw:
                out.append(Run(raw, b, i, False, s, link))
        elif c.get("children"):
            out += _inlines(c.get("children"), b, i, s, link)
        elif c.get("raw"):
            out.append(Run(c["raw"], b, i, False, s, link))
    return out


_CALLOUT_RE = re.compile(r"^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*", re.I)


def _blocks(tokens):
    out = []
    for tk in tokens or []:
        t = tk.get("type")
        if t == "heading":
            out.append({"t": "h", "level": (tk.get("attrs") or {}).get("level", 1), "runs": _inlines(tk.get("children"))})
        elif t in ("paragraph", "block_text"):
            ch = tk.get("children") or []
            # A paragraph that is just one image becomes an image block.
            if len(ch) == 1 and ch[0].get("type") == "image":
                im = ch[0]
                out.append({"t": "img", "url": (im.get("attrs") or {}).get("url", ""),
                            "alt": "".join(r.text for r in _inlines(im.get("children")))})
                continue
            runs = _inlines(ch)
            if runs and "".join(r.text for r in runs).strip():
                out.append({"t": "p", "runs": runs})
        elif t == "list":
            items = []
            for li in tk.get("children") or []:
                checked = (li.get("attrs") or {}).get("checked") if li.get("type") == "task_list_item" else None
                items.append({"checked": checked, "blocks": _blocks(li.get("children"))})
            a = tk.get("attrs") or {}
            out.append({"t": "list", "ordered": bool(a.get("ordered")), "start": a.get("start") or 1, "items": items})
        elif t == "block_code":
            info = ((tk.get("attrs") or {}).get("info") or "").strip().split(" ")[0]
            out.append({"t": "code", "lang": info, "text": (tk.get("raw") or "").rstrip("\n")})
        elif t == "block_quote":
            inner = _blocks(tk.get("children"))
            kind = None
            if inner and inner[0]["t"] == "p" and inner[0]["runs"]:
                first = inner[0]["runs"][0]
                m = _CALLOUT_RE.match(first.text)
                if m:
                    kind = m.group(1).lower()
                    first.text = first.text[m.end():]
                    if not first.text.strip() and len(inner[0]["runs"]) > 1:
                        inner[0]["runs"] = inner[0]["runs"][1:]
                        while inner[0]["runs"] and not inner[0]["runs"][0].text.strip():
                            inner[0]["runs"] = inner[0]["runs"][1:]
                    if not inner[0]["runs"]:
                        inner = inner[1:]
            out.append({"t": "quote", "kind": kind, "blocks": inner})
        elif t == "thematic_break":
            out.append({"t": "hr"})
        elif t == "table":
            head, rows, aligns = [], [], []
            for part in tk.get("children") or []:
                if part.get("type") == "table_head":
                    for cell in part.get("children") or []:
                        head.append(_inlines(cell.get("children")))
                        aligns.append((cell.get("attrs") or {}).get("align"))
                elif part.get("type") == "table_body":
                    for row in part.get("children") or []:
                        rows.append([_inlines(cell.get("children")) for cell in row.get("children") or []])
            out.append({"t": "table", "head": head, "aligns": aligns, "rows": rows})
        elif t == "block_html":
            raw = re.sub(r"<[^>]+>", " ", tk.get("raw", "")).strip()
            if raw:
                out.append({"t": "p", "runs": [Run(raw)]})
    return out


def parse(md_text):
    text = (md_text or "").replace("\r\n", "\n").replace("\r", "\n")
    if _MD is None:
        return [{"t": "p", "runs": [Run(line)]} for line in text.split("\n") if line.strip()]
    return _blocks(_MD(text))


def plain(runs):
    return "".join(r.text for r in runs or []).strip()


def doc_title(blocks, fallback):
    for b in blocks:
        if b["t"] == "h" and b["level"] == 1 and plain(b["runs"]):
            return plain(b["runs"])
    for b in blocks:
        if b["t"] == "h" and plain(b["runs"]):
            return plain(b["runs"])
    return fallback


def _strip_md(text):
    """Markdown → readable plain text (for .txt files)."""
    out = []
    for b in parse(text):
        out.extend(_plain_lines(b, 0))
        out.append("")
    return "\n".join(out).strip() + "\n"


def _plain_lines(b, depth):
    pad = "  " * depth
    t = b["t"]
    if t == "h":
        s = plain(b["runs"])
        return [s.upper() if b["level"] == 1 else s, ("=" if b["level"] == 1 else "-") * min(60, len(s))]
    if t == "p":
        return [pad + plain(b["runs"])]
    if t == "list":
        lines = []
        for n, it in enumerate(b["items"]):
            mark = f"{b['start'] + n}." if b["ordered"] else ("[x]" if it["checked"] else "[ ]" if it["checked"] is False else "-")
            first = True
            for sub in it["blocks"]:
                for ln in _plain_lines(sub, depth + 1 if not first else 0):
                    lines.append((pad + mark + " " + ln) if first else ln)
                    first = False
        return lines
    if t == "code":
        return [pad + ln for ln in b["text"].split("\n")]
    if t == "quote":
        lines = []
        for sub in b["blocks"]:
            lines += ["> " + ln for ln in _plain_lines(sub, 0)]
        return lines
    if t == "hr":
        return ["-" * 40]
    if t == "table":
        rows = [[plain(c) for c in b["head"]]] + [[plain(c) for c in r] for r in b["rows"]]
        widths = [max(len(r[i]) if i < len(r) else 0 for r in rows) for i in range(len(rows[0]))] if rows and rows[0] else []
        lines = []
        for k, r in enumerate(rows):
            lines.append(" | ".join((r[i] if i < len(r) else "").ljust(widths[i]) for i in range(len(widths))))
            if k == 0:
                lines.append("-+-".join("-" * w for w in widths))
        return lines
    if t == "img":
        return [f"[image: {b.get('alt') or b.get('url')}]"]
    return []


# ════════════════════════════════════════════════════════ file tags in chat ══
_ZFILE_RE = re.compile(r"<zfile\b([^>]*)>(.*?)(?:</zfile>|\Z)", re.S | re.I)
_ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')


def _attrs(s):
    return {k.lower(): v for k, v in _ATTR_RE.findall(s or "")}


def _clean_body(body):
    b = body.strip("\n")
    # Models sometimes wrap the whole file in a single code fence — unwrap it.
    m = re.match(r"^\s*```[\w+-]*\n(.*)\n```\s*$", b, re.S)
    if m and "```" not in m.group(1):
        b = m.group(1)
    return b.strip("\n")


def safe_name(name, fmt_hint=None):
    name = (name or "").strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^\w\s.\-()&,+]", "", name, flags=re.U).strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    base, ext = os.path.splitext(name)
    ext = ext.lstrip(".").lower()
    if ext in SUPPORTED:
        fmt = ext
    else:
        base = name
        fmt = fmt_hint if fmt_hint in SUPPORTED else "md"
    base = (base or "document")[:80].strip() or "document"
    return f"{base}.{fmt}", fmt


def extract_files(text):
    """Find <zfile> blocks. Returns a list of dicts with span, attrs and body."""
    found = []
    for m in _ZFILE_RE.finditer(text or ""):
        a = _attrs(m.group(1))
        body = _clean_body(m.group(2))
        name, fmt = safe_name(a.get("name") or a.get("filename") or "", (a.get("format") or a.get("type") or "").lower() or None)
        found.append({"span": m.span(), "attrs": a, "body": body, "name": name, "fmt": fmt,
                      "closed": m.group(0).lower().rstrip().endswith("</zfile>")})
    return found


def _strip_outer_fence_markers(text):
    # "```html\n<zfile ...> ... </zfile>\n```" → drop the stray fences around a tag
    return re.sub(r"```[\w-]*\s*\n(\s*<zfile\b.*?</zfile>)\s*\n```", r"\1", text, flags=re.S | re.I)


def build_tag(file_id, name, size, body, title=""):
    t = f' title="{_html.escape(title, quote=True)}"' if title else ""
    return f'<zfile id="{file_id}" name="{_html.escape(name, quote=True)}" size="{size}"{t}>\n{body}\n</zfile>'


_GEN_VERB = re.compile(r"\b(generate|create|make|write|produce|build|draft|compile|compose|prepare|design|turn|convert|export|give me|i need|can you (?:do|make))\b", re.I)
_GEN_NOUN = re.compile(r"\b(docx?|document|word file|ppt|pptx|slides?|slide ?deck|deck|presentation|powerpoint|spreadsheet|excel|sheet|xlsx|csv|pdf|file|report|resume|cv|cover[ -]?letter|essay|invoice|proposal|business plan|lesson plan|worksheet|brochure|newsletter|certificate|contract|agreement|letter|memo|minutes|syllabus|itinerary|budget)\b", re.I)


def looks_like_file_request(text):
    if not text:
        return False
    t = text[:600]
    if not (_GEN_VERB.search(t) and _GEN_NOUN.search(t)):
        return False
    # "write a letter" in chat isn't necessarily a file — require an explicit file
    # word for the softer nouns.
    soft = re.search(r"\b(?<!cover )(?<!cover-)(letter|essay|memo|minutes|budget|itinerary|report)\b", t, re.I)
    hard = re.search(r"\b(docx?|document|word|ppt|pptx|slides?|deck|presentation|powerpoint|spreadsheet|excel|sheet|xlsx|csv|pdf|file|download)\b", t, re.I)
    return bool(hard) or not soft


def requested_format(text):
    t = (text or "").lower()
    if re.search(r"\bppt\b|pptx|\bslides?\b|slide ?deck|\bdeck\b|presentation|powerpoint|keynote", t):
        return "pptx"
    if re.search(r"xlsx|spreadsheet|excel|\bsheet\b|\bxls\b|budget|tracker", t):
        return "xlsx"
    if re.search(r"\bcsv\b|comma[ -]?separated", t):
        return "csv"
    if re.search(r"\bpdf\b", t):
        return "pdf"
    if re.search(r"docx|\bword\b|\.doc\b", t):
        return "docx"
    if re.search(r"\bhtml\b|web ?page|webpage|landing page|website", t):
        return "html"
    if re.search(r"\bmarkdown\b|\.md\b", t):
        return "md"
    if re.search(r"\btxt\b|text file|plain text", t):
        return "txt"
    return "docx"


def name_from(text, blocks, fmt):
    title = doc_title(blocks, "")
    if not title:
        t = re.sub(r"(?i)^(please\s+)?(can you\s+)?(generate|create|make|write|produce|build|draft|give me|prepare)\s+(me\s+)?(a|an|the|my)?\s*", "", (text or "").strip())
        title = re.split(r"[.?!\n]", t)[0][:60] or "document"
    title = re.sub(r"[^\w\s\-&,()]", "", title, flags=re.U).strip()
    title = re.sub(r"\s+", " ", title)[:60].strip() or "document"
    return safe_name(title, fmt)


def wrap_untagged(reply, user_text):
    """The AI forgot the <zfile> tag but the user clearly asked for a file:
    treat the reply (minus a chatty first/last line) as the file."""
    lines = (reply or "").strip().split("\n")
    intro, outro = [], []
    if len(lines) > 3 and len(lines[0]) < 160 and re.search(r"(here(?:'s| is| are)|below|sure|certainly|of course|absolutely)", lines[0], re.I) and not lines[0].lstrip().startswith("#"):
        intro = [lines.pop(0)]
    while len(lines) > 3 and (not lines[-1].strip() or (len(lines[-1]) < 220 and re.search(r"(let me know|feel free|hope this|would you like|i can also|want me to)", lines[-1], re.I))):
        outro.insert(0, lines.pop())
    body = "\n".join(lines).strip()
    fmt = requested_format(user_text)
    name, fmt = name_from(user_text, parse(body) if fmt not in ("html",) else [], fmt)
    return "\n".join(intro).strip(), body, name, fmt, "\n".join(outro).strip()


# ═════════════════════════════════════════════════════════════════ HTML ══
def _slug(text):
    return re.sub(r"[^\w]+", "-", (text or "").lower()).strip("-")[:60]


def _runs_html(runs):
    out = []
    for r in runs:
        s = _html.escape(r.text).replace("\n", "<br>")
        if r.code:
            s = f"<code>{s}</code>"
        if r.b:
            s = f"<strong>{s}</strong>"
        if r.i:
            s = f"<em>{s}</em>"
        if r.s:
            s = f"<del>{s}</del>"
        if r.link and re.match(r"^(https?:|mailto:|#|/)", r.link):
            s = f'<a href="{_html.escape(r.link, quote=True)}">{s}</a>'
        out.append(s)
    return "".join(out)


_CALLOUT_ICON = {"note": "ℹ️", "tip": "💡", "important": "📌", "warning": "⚠️", "caution": "⛔"}


def _blocks_html(blocks):
    out = []
    for b in blocks:
        t = b["t"]
        if t == "h":
            lvl = min(6, max(1, b["level"]))
            slug = _slug(plain(b["runs"]))
            out.append(f'<h{lvl} id="{slug}">{_runs_html(b["runs"])}</h{lvl}>')
        elif t == "p":
            out.append(f"<p>{_runs_html(b['runs'])}</p>")
        elif t == "list":
            tag = "ol" if b["ordered"] else "ul"
            start = f' start="{b["start"]}"' if b["ordered"] and b["start"] != 1 else ""
            items = []
            for it in b["items"]:
                inner = _blocks_html(it["blocks"])
                if len(it["blocks"]) >= 1 and it["blocks"][0]["t"] == "p":
                    inner = inner.replace("<p>", "", 1).replace("</p>", "", 1)
                if it["checked"] is not None:
                    box = "☑" if it["checked"] else "☐"
                    items.append(f'<li class="task"><span class="box">{box}</span> {inner}</li>')
                else:
                    items.append(f"<li>{inner}</li>")
            out.append(f"<{tag}{start}>" + "".join(items) + f"</{tag}>")
        elif t == "code":
            lang = _html.escape(b["lang"] or "")
            label = f'<span class="lang">{lang}</span>' if lang else ""
            out.append(f'<pre>{label}<code class="language-{lang}">{_html.escape(b["text"])}</code></pre>')
        elif t == "quote":
            if b["kind"]:
                k = b["kind"]
                out.append(f'<div class="callout {k}"><div class="ct">{_CALLOUT_ICON.get(k, "")} {k.title()}</div>{_blocks_html(b["blocks"])}</div>')
            else:
                out.append(f"<blockquote>{_blocks_html(b['blocks'])}</blockquote>")
        elif t == "hr":
            out.append("<hr>")
        elif t == "table":
            al = b["aligns"]
            def _st(i):
                a = al[i] if i < len(al) else None
                return f' style="text-align:{a}"' if a in ("left", "right", "center") else ""
            th = "".join(f"<th{_st(i)}>{_runs_html(c)}</th>" for i, c in enumerate(b["head"]))
            trs = []
            for r in b["rows"]:
                trs.append("<tr>" + "".join(f"<td{_st(i)}>{_runs_html(c)}</td>" for i, c in enumerate(r)) + "</tr>")
            out.append(f'<div class="tw"><table><thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>')
        elif t == "img":
            url = b.get("url", "")
            if re.match(r"^(https?:|/|data:image/)", url):
                out.append(f'<figure><img src="{_html.escape(url, quote=True)}" alt="{_html.escape(b.get("alt", ""), quote=True)}">'
                           + (f"<figcaption>{_html.escape(b['alt'])}</figcaption>" if b.get("alt") else "") + "</figure>")
    return "\n".join(out)


_DOC_CSS = """
*{box-sizing:border-box}
:root{--brand:#2563eb;--brand2:#7c3aed;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#eff6ff}
html{background:#f3f5fb}
body{font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);margin:0;padding:32px 16px 64px}
.page{max-width:860px;margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 10px 40px rgba(17,24,39,.08);padding:56px 64px 64px;position:relative;overflow:hidden}
.page:before{content:"";position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,var(--brand),var(--brand) 55%,var(--brand2))}
h1{font-size:2.15rem;line-height:1.2;margin:0 0 .4em;letter-spacing:-.02em;color:#0b1b4d}
h2{font-size:1.45rem;margin:1.8em 0 .5em;color:#0f2a7a;padding-bottom:.3em;border-bottom:2px solid var(--soft)}
h3{font-size:1.15rem;margin:1.4em 0 .4em;color:var(--brand)}
h4,h5,h6{font-size:1rem;margin:1.2em 0 .3em;color:#374151}
p{margin:.6em 0}
a{color:var(--brand);text-decoration:none;border-bottom:1px solid rgba(37,99,235,.3)}
ul,ol{padding-left:1.4em;margin:.5em 0}
li{margin:.25em 0}
li.task{list-style:none;margin-left:-1.2em}
li .box{color:var(--brand);margin-right:.3em}
code{font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f5ff;color:#1e40af;padding:.12em .4em;border-radius:6px}
pre{position:relative;background:#0b1230;color:#e5e9f5;padding:18px 20px;border-radius:12px;overflow:auto;font-size:.9em;line-height:1.55}
pre code{background:none;color:inherit;padding:0}
pre .lang{position:absolute;top:8px;right:12px;font:11px ui-monospace,monospace;color:#93a4d8;text-transform:uppercase;letter-spacing:.08em}
blockquote{margin:1em 0;padding:.6em 1.1em;border-left:4px solid var(--brand);background:var(--soft);border-radius:0 10px 10px 0;color:#374151}
.callout{margin:1em 0;padding:.8em 1.1em;border-radius:12px;border:1px solid;background:#f8fafc}
.callout .ct{font-weight:700;font-size:.85em;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.2em}
.callout.note{border-color:#bfdbfe;background:#eff6ff}.callout.note .ct{color:#1d4ed8}
.callout.tip{border-color:#bbf7d0;background:#f0fdf4}.callout.tip .ct{color:#15803d}
.callout.important{border-color:#ddd6fe;background:#f5f3ff}.callout.important .ct{color:#6d28d9}
.callout.warning{border-color:#fde68a;background:#fffbeb}.callout.warning .ct{color:#b45309}
.callout.caution{border-color:#fecaca;background:#fef2f2}.callout.caution .ct{color:#b91c1c}
.tw{overflow-x:auto;margin:1.2em 0;border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:.94em}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{background:linear-gradient(180deg,#f5f8ff,#eef3ff);color:#0f2a7a;font-weight:700;white-space:nowrap}
tbody tr:nth-child(even) td{background:#fafbff}
tbody tr:last-child td{border-bottom:none}
hr{border:none;height:1px;background:var(--line);margin:2em 0}
figure{margin:1.2em 0;text-align:center}figure img{max-width:100%;border-radius:12px}
figcaption{color:var(--muted);font-size:.85em;margin-top:.4em}
.toc{background:#f8faff;border:1px solid var(--line);border-radius:12px;padding:12px 18px;margin:1em 0 1.6em;font-size:.93em}
.toc b{display:block;color:#0f2a7a;margin-bottom:4px}
.toc a{border:none}
.meta{color:var(--muted);font-size:.85em;margin:-.2em 0 1.4em}
@media (max-width:640px){body{padding:0}.page{border-radius:0;padding:36px 20px 48px}h1{font-size:1.7rem}}
@media print{html,body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0;padding:0;max-width:none}.page:before{display:none}a{border:none}pre{white-space:pre-wrap}}
"""


def render_html(content, filename="document"):
    raw = content or ""
    if re.search(r"<!doctype html|<html[\s>]|<body[\s>]", raw[:4000], re.I):
        return raw.encode("utf-8")  # the AI wrote a complete web page — keep it as is
    blocks = parse(raw)
    title = doc_title(blocks, os.path.splitext(filename)[0])
    heads = [b for b in blocks if b["t"] == "h" and b["level"] == 2]
    toc = ""
    if len(heads) >= 4:
        links = "".join(
            '<li><a href="#' + _slug(plain(h["runs"])) + '">' + _html.escape(plain(h["runs"])) + "</a></li>"
            for h in heads)
        toc = f'<nav class="toc"><b>Contents</b><ol>{links}</ol></nav>'
    body = _blocks_html(blocks)
    if toc:
        # put the contents box right after the first heading/paragraph pair
        idx = body.find("</h1>")
        body = body[: idx + 5] + toc + body[idx + 5:] if idx >= 0 else toc + body
    doc = ("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
           "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
           f"<title>{_html.escape(title)}</title><style>{_DOC_CSS}</style></head>"
           f"<body><main class=\"page\">{body}</main></body></html>")
    return doc.encode("utf-8")


# ═════════════════════════════════════════════════════════════════ DOCX ══
def _hex(c):
    from docx.shared import RGBColor
    c = c.lstrip("#")
    return RGBColor(int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


def _docx_shade(el, fill):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    pr = el._tc.get_or_add_tcPr() if hasattr(el, "_tc") else el._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill.lstrip("#"))
    pr.append(shd)


def _docx_border(paragraph, side="left", color="2563EB", size=18, space=8):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    pPr = paragraph._p.get_or_add_pPr()
    bdr = pPr.find(qn("w:pBdr"))
    if bdr is None:
        bdr = OxmlElement("w:pBdr")
        pPr.append(bdr)
    e = OxmlElement(f"w:{side}")
    e.set(qn("w:val"), "single")
    e.set(qn("w:sz"), str(size))
    e.set(qn("w:space"), str(space))
    e.set(qn("w:color"), color)
    bdr.append(e)


def _docx_hyperlink(paragraph, url, text, run_props):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    part = paragraph.part
    r_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), r_id)
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    c = OxmlElement("w:color"); c.set(qn("w:val"), "2563EB"); rPr.append(c)
    u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rPr.append(u)
    if run_props.get("b"):
        rPr.append(OxmlElement("w:b"))
    if run_props.get("i"):
        rPr.append(OxmlElement("w:i"))
    r.append(rPr)
    t = OxmlElement("w:t"); t.text = text; t.set(qn("xml:space"), "preserve"); r.append(t)
    h.append(r)
    paragraph._p.append(h)


def _docx_runs(p, runs, size=None, color=None):
    from docx.shared import Pt
    for r in runs:
        if not r.text:
            continue
        if r.link and re.match(r"^(https?:|mailto:)", r.link):
            _docx_hyperlink(p, r.link, r.text, {"b": r.b, "i": r.i})
            continue
        parts = r.text.split("\n")
        for k, seg in enumerate(parts):
            if k:
                p.add_run().add_break()
            if not seg:
                continue
            run = p.add_run(seg)
            run.bold = r.b or None
            run.italic = r.i or None
            if r.s:
                run.font.strike = True
            if r.code:
                run.font.name = "Consolas"
                run.font.size = Pt((size or 11) - 1)
                run.font.color.rgb = _hex("#1e40af")
            elif size:
                run.font.size = Pt(size)
            if color and not r.code:
                run.font.color.rgb = _hex(color)


def _docx_field(paragraph, instr):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    run = paragraph.add_run()
    b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin")
    t = OxmlElement("w:instrText"); t.set(qn("xml:space"), "preserve"); t.text = instr
    e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end")
    run._r.append(b); run._r.append(t); run._r.append(e)
    return run


def _docx_kind(blocks, title):
    """Letters and CVs shouldn't get a big report-style title band."""
    t = (title or "").lower()
    first = " ".join(plain(b["runs"]) for b in blocks[:3] if b["t"] == "p").lower()
    if re.search(r"\b(cover letter|letter|memo)\b", t) or re.match(r"^(dear|to whom|hello|hi)\b", first):
        return "letter"
    if re.search(r"\b(resume|résumé|cv|curriculum vitae)\b", t):
        return "cv"
    return "report"


def render_docx(content, filename="document"):
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, Cm

    blocks = parse(content)
    title = doc_title(blocks, os.path.splitext(filename)[0])
    kind = _docx_kind(blocks, title)
    doc = Document()

    sec = doc.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    sec.left_margin = sec.right_margin = Cm(2.2 if kind != "cv" else 1.8)
    sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(1.8)

    st = doc.styles
    normal = st["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.font.color.rgb = _hex(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    # East-Asian font fallback so non-Latin text doesn't render as boxes
    try:
        from docx.oxml.ns import qn
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    except Exception:
        pass
    sizes = {1: 22, 2: 15, 3: 12.5, 4: 11.5, 5: 11, 6: 11}
    colors = {1: "#0b1b4d", 2: "#0f2a7a", 3: BRAND, 4: "#374151", 5: "#374151", 6: "#374151"}
    for lvl in range(1, 7):
        try:
            h = st[f"Heading {lvl}"]
        except KeyError:
            continue
        h.font.name = "Calibri"
        h.font.size = Pt(sizes[lvl])
        h.font.bold = True
        h.font.italic = False
        h.font.color.rgb = _hex(colors[lvl])
        h.paragraph_format.space_before = Pt(16 if lvl <= 2 else 10)
        h.paragraph_format.space_after = Pt(4)
        h.paragraph_format.keep_with_next = True

    # Header / footer: document title on the left, page numbers on the right
    if kind == "report":
        hp = sec.header.paragraphs[0]
        hr = hp.add_run(title[:90])
        hr.font.size = Pt(8.5)
        hr.font.color.rgb = _hex(MUTED)
        fp = sec.footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r = fp.add_run("Page ")
        r.font.size = Pt(8.5); r.font.color.rgb = _hex(MUTED)
        f1 = _docx_field(fp, "PAGE"); f1.font.size = Pt(8.5)
        r2 = fp.add_run(" of "); r2.font.size = Pt(8.5); r2.font.color.rgb = _hex(MUTED)
        f2 = _docx_field(fp, "NUMPAGES"); f2.font.size = Pt(8.5)

    first_h1_done = False

    def add_blocks(items, depth=0, in_list=False):
        nonlocal first_h1_done
        for b in items:
            t = b["t"]
            if t == "h":
                lvl = b["level"]
                if lvl == 1 and not first_h1_done:
                    first_h1_done = True
                    if kind == "letter":
                        p = doc.add_paragraph()
                        _docx_runs(p, b["runs"], size=16, color="#0b1b4d")
                        for r in p.runs:
                            r.bold = True
                        continue
                    p = doc.add_paragraph()
                    _docx_runs(p, b["runs"], size=26 if kind == "report" else 24, color="#0b1b4d")
                    for r in p.runs:
                        r.bold = True
                    p.paragraph_format.space_after = Pt(2)
                    if kind == "cv":
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    bar = doc.add_paragraph()
                    _docx_border(bar, "bottom", "2563EB", 12, 1)
                    bar.paragraph_format.space_after = Pt(10)
                    continue
                hp = doc.add_heading(level=min(lvl, 6))
                _docx_runs(hp, b["runs"])
                if kind == "cv" and lvl == 2:
                    _docx_border(hp, "bottom", "BFDBFE", 6, 2)
            elif t == "p":
                p = doc.add_paragraph()
                _docx_runs(p, b["runs"])
            elif t == "list":
                for n, it in enumerate(b["items"]):
                    first = True
                    for sub in it["blocks"]:
                        if first and sub["t"] == "p":
                            style = ("List Number" if b["ordered"] else "List Bullet")
                            if depth == 1:
                                style += " 2"
                            elif depth >= 2:
                                style += " 3"
                            try:
                                p = doc.add_paragraph(style=style)
                            except KeyError:
                                p = doc.add_paragraph(style="List Number" if b["ordered"] else "List Bullet")
                            if it["checked"] is not None:
                                p.add_run("☑ " if it["checked"] else "☐ ")
                            _docx_runs(p, sub["runs"])
                            p.paragraph_format.space_after = Pt(2)
                            first = False
                        elif sub["t"] == "list":
                            add_blocks([sub], depth + 1, True)
                        else:
                            add_blocks([sub], depth + 1, True)
                            first = False
                if doc.paragraphs:
                    doc.paragraphs[-1].paragraph_format.space_after = Pt(6)
            elif t == "code":
                tbl = doc.add_table(rows=1, cols=1)
                cell = tbl.rows[0].cells[0]
                _docx_shade(cell, "0B1230")
                cp = cell.paragraphs[0]
                if b["lang"]:
                    lr = cp.add_run(b["lang"].upper())
                    lr.font.size = Pt(7.5); lr.font.color.rgb = _hex("#93a4d8"); lr.bold = True
                    cp = cell.add_paragraph()
                for k, line in enumerate(b["text"].split("\n")):
                    if k:
                        cp.add_run().add_break()
                    rr = cp.add_run(line or " ")
                    rr.font.name = "Consolas"
                    rr.font.size = Pt(9)
                    rr.font.color.rgb = _hex("#e5e9f5")
                doc.add_paragraph().paragraph_format.space_after = Pt(2)
            elif t == "quote":
                fill = {"note": "EFF6FF", "tip": "F0FDF4", "important": "F5F3FF", "warning": "FFFBEB", "caution": "FEF2F2"}.get(b["kind"], "EFF6FF")
                edge = {"note": "2563EB", "tip": "16A34A", "important": "7C3AED", "warning": "D97706", "caution": "DC2626"}.get(b["kind"], "2563EB")
                label = b["kind"].title() if b["kind"] else None
                if label:
                    lp = doc.add_paragraph()
                    lr = lp.add_run(f"{_CALLOUT_ICON.get(b['kind'], '')} {label}".strip())
                    lr.bold = True; lr.font.size = Pt(9.5); lr.font.color.rgb = _hex("#" + edge)
                    _docx_shade(lp, fill); _docx_border(lp, "left", edge, 24, 10)
                    lp.paragraph_format.space_after = Pt(0)
                for sub in b["blocks"]:
                    if sub["t"] == "p":
                        qp = doc.add_paragraph()
                        _docx_runs(qp, sub["runs"], color="#374151")
                        if not label:
                            for r in qp.runs:
                                r.italic = True
                        _docx_shade(qp, fill); _docx_border(qp, "left", edge, 24, 10)
                        qp.paragraph_format.space_after = Pt(0)
                    else:
                        add_blocks([sub], depth, in_list)
                doc.add_paragraph().paragraph_format.space_after = Pt(0)
            elif t == "hr":
                p = doc.add_paragraph()
                _docx_border(p, "bottom", "E5E7EB", 6, 1)
            elif t == "table":
                cols = max([len(b["head"])] + [len(r) for r in b["rows"]] or [1])
                tbl = doc.add_table(rows=1, cols=cols)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                try:
                    tbl.style = "Table Grid"
                except Exception:
                    pass
                aligns = b["aligns"]
                def _align(par, i):
                    a = aligns[i] if i < len(aligns) else None
                    if a == "right":
                        par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    elif a == "center":
                        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for i in range(cols):
                    cell = tbl.rows[0].cells[i]
                    _docx_shade(cell, "1E3A8A")
                    par = cell.paragraphs[0]
                    _docx_runs(par, b["head"][i] if i < len(b["head"]) else [], size=10, color="#FFFFFF")
                    for r in par.runs:
                        r.bold = True
                    _align(par, i)
                # repeat header row on each page
                from docx.oxml import OxmlElement
                from docx.oxml.ns import qn
                trPr = tbl.rows[0]._tr.get_or_add_trPr()
                th = OxmlElement("w:tblHeader"); th.set(qn("w:val"), "true"); trPr.append(th)
                for ri, row in enumerate(b["rows"]):
                    cells = tbl.add_row().cells
                    for i in range(cols):
                        par = cells[i].paragraphs[0]
                        _docx_runs(par, row[i] if i < len(row) else [], size=10)
                        _align(par, i)
                        if ri % 2 == 1:
                            _docx_shade(cells[i], "F5F8FF")
                doc.add_paragraph().paragraph_format.space_after = Pt(2)
            elif t == "img":
                p = doc.add_paragraph()
                r = p.add_run(f"[Image: {b.get('alt') or 'picture'}]")
                r.italic = True; r.font.color.rgb = _hex(MUTED)

    add_blocks(blocks)
    cp = doc.core_properties
    cp.title = title[:250]
    cp.author = "Zelpophai AI"
    cp.comments = "Created with Zelpophai AI"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════ PDF ══
_PDF_FONTS = None


def _pdf_fonts():
    """Use DejaVu (wide Unicode coverage) when the server has it, else Helvetica."""
    global _PDF_FONTS
    if _PDF_FONTS:
        return _PDF_FONTS
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    candidates = [
        "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF",
    ]
    candidates.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"))
    for d in candidates:
        reg, bold, ital, bi, mono = (os.path.join(d, n) for n in (
            "DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf", "DejaVuSansMono.ttf"))
        if all(os.path.exists(p) for p in (reg, bold, ital, bi)):
            try:
                pdfmetrics.registerFont(TTFont("ZSans", reg))
                pdfmetrics.registerFont(TTFont("ZSans-Bold", bold))
                pdfmetrics.registerFont(TTFont("ZSans-Italic", ital))
                pdfmetrics.registerFont(TTFont("ZSans-BoldItalic", bi))
                from reportlab.lib.fonts import addMapping
                addMapping("ZSans", 0, 0, "ZSans"); addMapping("ZSans", 1, 0, "ZSans-Bold")
                addMapping("ZSans", 0, 1, "ZSans-Italic"); addMapping("ZSans", 1, 1, "ZSans-BoldItalic")
                mononame = "Courier"
                if os.path.exists(mono):
                    pdfmetrics.registerFont(TTFont("ZMono", mono)); mononame = "ZMono"
                _PDF_FONTS = ("ZSans", "ZSans-Bold", "ZSans-Italic", mononame)
                return _PDF_FONTS
            except Exception:
                pass
    _PDF_FONTS = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Courier")
    return _PDF_FONTS


def _runs_rl(runs, mono):
    out = []
    for r in runs:
        s = _html.escape(r.text, quote=False).replace("\n", "<br/>")
        if r.code:
            s = f'<font face="{mono}" color="#1e40af" backColor="#eef2ff">{s}</font>'
        if r.b:
            s = f"<b>{s}</b>"
        if r.i:
            s = f"<i>{s}</i>"
        if r.s:
            s = f"<strike>{s}</strike>"
        if r.link and re.match(r"^(https?:|mailto:)", r.link):
            s = f'<link href="{_html.escape(r.link, quote=True)}" color="#2563eb"><u>{s}</u></link>'
        out.append(s)
    return "".join(out)


def render_pdf(content, filename="document"):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, ListFlowable, ListItem, PageTemplate,
                                    Paragraph, Preformatted, Spacer, Table, TableStyle, HRFlowable, CondPageBreak)

    sans, bold, ital, mono = _pdf_fonts()
    blocks = parse(content)
    title = doc_title(blocks, os.path.splitext(filename)[0])
    kind = _docx_kind(blocks, title)
    C = colors.HexColor
    S = {
        "title": ParagraphStyle("title", fontName=bold, fontSize=24, leading=29, textColor=C("#0b1b4d"), spaceAfter=4),
        "h1": ParagraphStyle("h1", fontName=bold, fontSize=18, leading=23, textColor=C("#0b1b4d"), spaceBefore=14, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName=bold, fontSize=14.5, leading=19, textColor=C("#0f2a7a"), spaceBefore=14, spaceAfter=5),
        "h3": ParagraphStyle("h3", fontName=bold, fontSize=12, leading=16, textColor=C(BRAND), spaceBefore=10, spaceAfter=3),
        "h4": ParagraphStyle("h4", fontName=bold, fontSize=10.8, leading=14, textColor=C("#374151"), spaceBefore=8, spaceAfter=2),
        "p": ParagraphStyle("p", fontName=sans, fontSize=10.5, leading=15.5, textColor=C(INK), spaceAfter=6),
        "li": ParagraphStyle("li", fontName=sans, fontSize=10.5, leading=15, textColor=C(INK)),
        "q": ParagraphStyle("q", fontName=ital, fontSize=10.5, leading=15, textColor=C("#374151")),
        "co": ParagraphStyle("co", fontName=sans, fontSize=10.2, leading=14.5, textColor=C("#1f2937")),
        "cot": ParagraphStyle("cot", fontName=bold, fontSize=8.5, leading=11, spaceAfter=2),
        "code": ParagraphStyle("code", fontName=mono, fontSize=8.4, leading=11.2, textColor=C("#e5e9f5")),
        "th": ParagraphStyle("th", fontName=bold, fontSize=9, leading=11.5, textColor=colors.white),
        "td": ParagraphStyle("td", fontName=sans, fontSize=9, leading=11.8, textColor=C(INK)),
        "cap": ParagraphStyle("cap", fontName=ital, fontSize=9, leading=12, textColor=C(MUTED)),
    }
    W, H = A4
    M = 2.0 * cm
    width = W - 2 * M

    def _page(canv, doc_):
        canv.saveState()
        # brand ribbon
        steps = 40
        for k in range(steps):
            f = k / (steps - 1)
            r1, g1, b1 = 0x25 / 255, 0x63 / 255, 0xEB / 255
            r2, g2, b2 = 0x7C / 255, 0x3A / 255, 0xED / 255
            mix = max(0.0, (f - 0.55) / 0.45)
            canv.setFillColorRGB(r1 + (r2 - r1) * mix, g1 + (g2 - g1) * mix, b1 + (b2 - b1) * mix)
            canv.rect(W * k / steps, H - 5, W / steps + 1, 5, stroke=0, fill=1)
        canv.setFont(sans, 8)
        canv.setFillColor(C(MUTED))
        if kind == "report":
            canv.drawString(M, H - 1.2 * cm, title[:95])
        canv.drawRightString(W - M, 1.1 * cm, f"Page {doc_.page}")
        canv.restoreState()

    story = []

    def table_flow(b):
        cols = max([len(b["head"])] + [len(r) for r in b["rows"]] or [1])
        data = [[Paragraph(_runs_rl(b["head"][i], mono) if i < len(b["head"]) else "", S["th"]) for i in range(cols)]]
        for r in b["rows"]:
            data.append([Paragraph(_runs_rl(r[i], mono) if i < len(r) else "", S["td"]) for i in range(cols)])
        # column widths proportional to content length (bounded)
        lens = []
        for i in range(cols):
            m = max([len(plain(b["head"][i])) if i < len(b["head"]) else 0] + [len(plain(r[i])) if i < len(r) else 0 for r in b["rows"]] + [3])
            lens.append(min(max(m, 4), 40))
        tot = sum(lens)
        cw = [width * l / tot for l in lens]
        t = Table(data, colWidths=cw, repeatRows=1, hAlign="LEFT")
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), C("#1e3a8a")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, C("#f5f8ff")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, C(LINE)),
            ("BOX", (0, 0), (-1, -1), 0.6, C("#c7d2fe")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        for i, a in enumerate(b["aligns"]):
            if a in ("right", "center"):
                for row in data:
                    row[i].style = ParagraphStyle("a", parent=row[i].style, alignment=TA_RIGHT if a == "right" else 1)
        t.setStyle(TableStyle(style))
        return t

    def list_flow(b, depth=0):
        items = []
        for n, it in enumerate(b["items"]):
            parts = []
            for sub in it["blocks"]:
                if sub["t"] == "p":
                    pre = ""
                    if it["checked"] is not None:
                        if sans == "ZSans":
                            pre = "☑ " if it["checked"] else "☐ "
                        else:
                            pre = "[x] " if it["checked"] else "[ ] "
                    parts.append(Paragraph(pre + _runs_rl(sub["runs"], mono), S["li"]))
                elif sub["t"] == "list":
                    parts.append(list_flow(sub, depth + 1))
                else:
                    parts.extend(flows([sub]))
            items.append(ListItem(parts if len(parts) > 1 else (parts[0] if parts else Paragraph("", S["li"])), leftIndent=14))
        if b["ordered"]:
            return ListFlowable(items, bulletType="1", start=b["start"], bulletFormat="%s.", leftIndent=18 + depth * 4, bulletFontName=bold, bulletFontSize=9.5, bulletColor=C(BRAND), spaceBefore=1, spaceAfter=5)
        return ListFlowable(items, bulletType="bullet", start="•" if depth == 0 else ("◦" if depth == 1 else "▪"), leftIndent=14 + depth * 4, bulletFontName=sans, bulletFontSize=9 if depth == 0 else 8, bulletColor=C(BRAND), spaceBefore=1, spaceAfter=5)

    first_title = [False]

    def flows(items):
        out = []
        for b in items:
            t = b["t"]
            if t == "h":
                lvl = b["level"]
                if lvl == 1 and not first_title[0]:
                    first_title[0] = True
                    out.append(Paragraph(_runs_rl(b["runs"], mono), S["title"]))
                    out.append(HRFlowable(width="18%", thickness=3, color=C(BRAND), spaceBefore=2, spaceAfter=14, hAlign="LEFT"))
                    continue
                key = f"h{min(lvl, 4)}"
                out.append(CondPageBreak(3 * cm))
                out.append(Paragraph(_runs_rl(b["runs"], mono), S[key]))
                if lvl == 2:
                    out.append(HRFlowable(width="100%", thickness=0.6, color=C("#dbe4ff"), spaceBefore=0, spaceAfter=6))
            elif t == "p":
                out.append(Paragraph(_runs_rl(b["runs"], mono), S["p"]))
            elif t == "list":
                out.append(list_flow(b))
            elif t == "code":
                pre = Preformatted(b["text"][:20000], S["code"], maxLineLength=110)
                box = Table([[pre]], colWidths=[width])
                box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C("#0b1230")),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                                         ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
                out.append(box)
                out.append(Spacer(1, 8))
            elif t == "quote":
                edge = {"note": "#2563eb", "tip": "#16a34a", "important": "#7c3aed", "warning": "#d97706", "caution": "#dc2626"}.get(b["kind"], BRAND)
                fill = {"note": "#eff6ff", "tip": "#f0fdf4", "important": "#f5f3ff", "warning": "#fffbeb", "caution": "#fef2f2"}.get(b["kind"], "#eff6ff")
                inner = []
                if b["kind"]:
                    inner.append(Paragraph(b["kind"].upper(), ParagraphStyle("k", parent=S["cot"], textColor=C(edge))))
                for sub in b["blocks"]:
                    if sub["t"] == "p":
                        inner.append(Paragraph(_runs_rl(sub["runs"], mono), S["co"] if b["kind"] else S["q"]))
                    else:
                        inner.extend(flows([sub]))
                box = Table([[inner]], colWidths=[width])
                box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), C(fill)), ("LINEBEFORE", (0, 0), (0, -1), 3, C(edge)),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                                         ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
                out.append(KeepTogether([box]))
                out.append(Spacer(1, 8))
            elif t == "hr":
                out.append(HRFlowable(width="100%", thickness=0.6, color=C(LINE), spaceBefore=6, spaceAfter=10))
            elif t == "table":
                out.append(table_flow(b))
                out.append(Spacer(1, 10))
            elif t == "img":
                out.append(Paragraph(f"[Image: {_html.escape(b.get('alt') or 'picture')}]", S["cap"]))
        return out

    story = flows(blocks)
    if not story:
        story = [Paragraph(_html.escape(title), S["title"])]

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                          title=title, author="Zelpophai AI", subject=title, creator="Zelpophai AI")
    frame = Frame(M, 1.8 * cm, width, H - 3.6 * cm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=_page)])
    doc.build(story)
    return buf.getvalue()


# ═════════════════════════════════════════════════════════════════ PPTX ══
def _slides_from_blocks(blocks, fallback_title):
    """Group blocks into slides. '# ' = deck title, '## ' = a slide, '### ' =
    a column/sub-point inside it. '---' also starts a new slide. A paragraph
    starting with 'Notes:' goes to the speaker notes."""
    title = doc_title(blocks, fallback_title)
    subtitle = ""
    slides = []
    cur = None
    seen_title = False
    for b in blocks:
        if b["t"] == "h" and b["level"] == 1 and not seen_title:
            seen_title = True
            continue
        if b["t"] == "h" and b["level"] <= 2:
            cur = {"title": plain(b["runs"]), "blocks": [], "notes": []}
            slides.append(cur)
            continue
        if b["t"] == "hr":
            if cur and (cur["blocks"] or cur["title"]):
                cur = {"title": "", "blocks": [], "notes": []}
                slides.append(cur)
            continue
        if b["t"] == "p" and re.match(r"^\s*(speaker\s+)?notes?\s*:", plain(b["runs"]), re.I):
            if cur is not None:
                cur["notes"].append(re.sub(r"^\s*(speaker\s+)?notes?\s*:\s*", "", plain(b["runs"]), flags=re.I))
            continue
        if cur is None:
            if b["t"] == "p" and not subtitle:
                subtitle = plain(b["runs"])
                continue
            cur = {"title": "", "blocks": [], "notes": []}
            slides.append(cur)
        cur["blocks"].append(b)
    return title, subtitle, [s for s in slides if s["title"] or s["blocks"]]


def _flatten_points(blocks, level=0):
    """Blocks → [(level, runs, ordered_index_or_None)] bullet points."""
    pts = []
    for b in blocks:
        if b["t"] == "p":
            pts.append((level, b["runs"], None))
        elif b["t"] == "list":
            for n, it in enumerate(b["items"]):
                first = True
                for sub in it["blocks"]:
                    if sub["t"] == "p" and first:
                        runs = sub["runs"]
                        if it["checked"] is not None:
                            runs = [Run("☑ " if it["checked"] else "☐ ")] + runs
                        pts.append((level, runs, (b["start"] + n) if b["ordered"] else None))
                        first = False
                    elif sub["t"] == "list":
                        pts += _flatten_points([sub], level + 1)
        elif b["t"] == "quote":
            pts += _flatten_points(b["blocks"], level)
        elif b["t"] == "h":
            pts.append((level, [Run(plain(b["runs"]), b=True)], None))
    return pts


def render_pptx(content, filename="presentation"):
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    from pptx.util import Inches, Pt, Emu

    def rgb(h):
        h = h.lstrip("#")
        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    BG = "#0b1230"; BG2 = "#111a44"; FG = "#ffffff"; SUB = "#c7d2fe"; DIM = "#8ea0d6"

    blocks = parse(content)
    title, subtitle, slides = _slides_from_blocks(blocks, os.path.splitext(filename)[0])
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    SW, SH = prs.slide_width, prs.slide_height
    blank = prs.slide_layouts[6]
    font = "Segoe UI"

    def background(s, color=BG):
        fill = s.background.fill
        fill.solid()
        fill.fore_color.rgb = rgb(color)

    def deco(s, strong=False):
        # glowing orbs + brand bar, drawn as simple shapes (no images needed)
        o1 = s.shapes.add_shape(MSO_SHAPE.OVAL, SW - Inches(4.2), -Inches(2.2), Inches(6), Inches(6))
        o1.fill.solid(); o1.fill.fore_color.rgb = rgb("#1d3fa8"); o1.line.fill.background()
        _alpha(o1, 35 if strong else 22)
        o2 = s.shapes.add_shape(MSO_SHAPE.OVAL, -Inches(2.5), SH - Inches(3), Inches(5), Inches(5))
        o2.fill.solid(); o2.fill.fore_color.rgb = rgb("#5b21b6"); o2.line.fill.background()
        _alpha(o2, 28 if strong else 16)
        bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(0.09))
        _grad(bar, "#2563eb", "#7c3aed"); bar.line.fill.background()

    def _alpha(shape, pct):
        from pptx.oxml.ns import qn
        sf = shape.fill._xPr.find(qn("a:solidFill"))
        if sf is not None and len(sf):
            clr = sf[0]
            a = clr.makeelement(qn("a:alpha"), {"val": str(int(pct * 1000))})
            clr.append(a)

    def _grad(shape, c1, c2):
        f = shape.fill
        f.gradient()
        f.gradient_angle = 0
        st = f.gradient_stops
        st[0].color.rgb = rgb(c1); st[0].position = 0.0
        st[1].color.rgb = rgb(c2); st[1].position = 1.0

    def textbox(s, x, y, w, h, anchor=MSO_ANCHOR.TOP):
        tb = s.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = anchor
        tf.margin_left = tf.margin_right = Inches(0.05)
        return tf

    def add_runs(p, runs, size, color=FG, bold=None):
        for r in runs:
            if not r.text:
                continue
            run = p.add_run()
            run.text = r.text.replace("\n", " ")
            f = run.font
            f.size = Pt(size)
            f.name = "Consolas" if r.code else font
            f.bold = bold if bold is not None else (r.b or None)
            f.italic = r.i or None
            f.color.rgb = rgb("#93c5fd" if (r.code or r.link) else color)
            if r.link and re.match(r"^https?:", r.link):
                run.hyperlink.address = r.link

    def footer(s, n):
        tf = textbox(s, Inches(0.6), SH - Inches(0.55), Inches(8), Inches(0.35))
        p = tf.paragraphs[0]
        add_runs(p, [Run(title[:80])], 10, DIM)
        tf2 = textbox(s, SW - Inches(1.6), SH - Inches(0.55), Inches(1.0), Inches(0.35))
        p2 = tf2.paragraphs[0]; p2.alignment = PP_ALIGN.RIGHT
        add_runs(p2, [Run(str(n))], 10, DIM)

    def notes(s, lines):
        if lines:
            s.notes_slide.notes_text_frame.text = "\n".join(lines)

    # ── title slide
    s = prs.slides.add_slide(blank)
    background(s); deco(s, True)
    tag = textbox(s, Inches(0.9), Inches(2.0), Inches(6), Inches(0.4))
    add_runs(tag.paragraphs[0], [Run("PRESENTATION")], 13, "#93c5fd", True)
    tf = textbox(s, Inches(0.9), Inches(2.45), Inches(11.4), Inches(2.4), MSO_ANCHOR.TOP)
    add_runs(tf.paragraphs[0], [Run(title)], 48 if len(title) < 40 else 38, FG, True)
    if subtitle:
        st = textbox(s, Inches(0.9), Inches(4.75), Inches(10.5), Inches(1.4))
        add_runs(st.paragraphs[0], [Run(subtitle[:220])], 20, SUB)
    ln = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.92), Inches(4.55), Inches(1.6), Inches(0.07))
    _grad(ln, "#2563eb", "#7c3aed"); ln.line.fill.background()

    n = 1
    MAX_PTS = 7
    for sl in slides[:60]:
        stitle = sl["title"]
        tables = [b for b in sl["blocks"] if b["t"] == "table"]
        codes = [b for b in sl["blocks"] if b["t"] == "code"]
        h3s = [b for b in sl["blocks"] if b["t"] == "h" and b["level"] >= 3]
        others = [b for b in sl["blocks"] if b["t"] not in ("table", "code")]
        quote_only = len(sl["blocks"]) == 1 and sl["blocks"][0]["t"] == "quote"
        closing = re.match(r"^(thank you|thanks|questions\??|q\s*&\s*a|the end)\b", stitle or "", re.I) and not sl["blocks"]

        def new_slide(heading):
            nonlocal n
            n += 1
            sd = prs.slides.add_slide(blank)
            background(sd); deco(sd)
            if heading:
                ttf = textbox(sd, Inches(0.7), Inches(0.45), Inches(11.9), Inches(1.0), MSO_ANCHOR.MIDDLE)
                add_runs(ttf.paragraphs[0], [Run(heading)], 32 if len(heading) < 50 else 26, FG, True)
                acc = sd.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.72), Inches(1.45), Inches(0.9), Inches(0.06))
                _grad(acc, "#2563eb", "#7c3aed"); acc.line.fill.background()
            footer(sd, n)
            notes(sd, sl["notes"])
            return sd

        if closing:
            sd = new_slide(None)
            tf = textbox(sd, Inches(0.9), Inches(2.6), Inches(11.5), Inches(2), MSO_ANCHOR.MIDDLE)
            p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
            add_runs(p, [Run(stitle)], 54, FG, True)
            continue

        if quote_only:
            sd = new_slide(stitle or None)
            q = sl["blocks"][0]
            txt = " ".join(plain(b["runs"]) for b in q["blocks"] if b["t"] == "p")
            mark = textbox(sd, Inches(0.9), Inches(1.7), Inches(2), Inches(1.5))
            add_runs(mark.paragraphs[0], [Run("“")], 120, "#3b82f6", True)
            tf = textbox(sd, Inches(1.6), Inches(2.5), Inches(10.3), Inches(3.5), MSO_ANCHOR.MIDDLE)
            add_runs(tf.paragraphs[0], [Run(txt[:400])], 30 if len(txt) < 160 else 22, FG, None)
            for r in tf.paragraphs[0].runs:
                r.font.italic = True
            continue

        # Column layout: 2–3 '###' sub-headings each with their own points
        if 2 <= len(h3s) <= 3 and not tables and not codes:
            cols = []
            cur = None
            for b in sl["blocks"]:
                if b["t"] == "h" and b["level"] >= 3:
                    cur = {"title": plain(b["runs"]), "blocks": []}; cols.append(cur)
                elif cur is not None:
                    cur["blocks"].append(b)
            sd = new_slide(stitle)
            gap = Inches(0.35)
            cw = (SW - Inches(1.4) - gap * (len(cols) - 1)) / len(cols)
            for k, c in enumerate(cols):
                x = Inches(0.7) + (cw + gap) * k
                card = sd.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.85), cw, Inches(4.8))
                card.adjustments[0] = 0.06
                card.fill.solid(); card.fill.fore_color.rgb = rgb(BG2); card.line.color.rgb = rgb("#27367a")
                tf = textbox(sd, x + Inches(0.25), Inches(2.05), cw - Inches(0.5), Inches(4.4))
                add_runs(tf.paragraphs[0], [Run(c["title"])], 20, "#93c5fd", True)
                for lvl, runs, num in _flatten_points(c["blocks"])[:7]:
                    p = tf.add_paragraph(); p.space_before = Pt(8); p.level = min(lvl, 2)
                    add_runs(p, [Run(("• " if num is None else f"{num}. "))] + runs, 15)
            continue

        pts = _flatten_points(others)
        chunks = [pts[i:i + MAX_PTS] for i in range(0, len(pts), MAX_PTS)] or ([[]] if not (tables or codes) else [])
        for ci, chunk in enumerate(chunks):
            heading = stitle + (" (cont.)" if ci else "")
            sd = new_slide(heading)
            if chunk:
                big = len(chunk) <= 3 and all(len(plain(r)) < 120 for _, r, _ in chunk)
                area_w = Inches(11.9) if not (tables or codes) or ci else Inches(5.6)
                tf = textbox(sd, Inches(0.75), Inches(1.85), area_w, Inches(4.9))
                for k, (lvl, runs, num) in enumerate(chunk):
                    p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
                    p.level = min(lvl, 3)
                    p.space_before = Pt(14 if big else 9)
                    size = (26 if big else 20) - lvl * 3
                    bullet = Run(("▸  " if lvl == 0 else "–  ") if num is None else f"{num}.  ", b=True)
                    add_runs(p, [bullet], size, "#60a5fa", True)
                    add_runs(p, runs, size, FG if lvl == 0 else SUB)
            if ci == 0 and (tables or codes):
                x0 = Inches(6.65) if chunk else Inches(0.75)
                w0 = Inches(6.0) if chunk else Inches(11.9)
                if tables:
                    tb = tables[0]
                    cols = max([len(tb["head"])] + [len(r) for r in tb["rows"]])
                    rows = tb["rows"][:12]
                    gt = sd.shapes.add_table(len(rows) + 1, cols, x0, Inches(1.9), w0, Inches(0.4) * (len(rows) + 1)).table
                    for i in range(cols):
                        c = gt.cell(0, i)
                        c.fill.solid(); c.fill.fore_color.rgb = rgb("#1e40af")
                        c.text_frame.paragraphs[0].text = ""
                        add_runs(c.text_frame.paragraphs[0], tb["head"][i] if i < len(tb["head"]) else [], 13, FG, True)
                    for ri, r in enumerate(rows):
                        for i in range(cols):
                            c = gt.cell(ri + 1, i)
                            c.fill.solid(); c.fill.fore_color.rgb = rgb(BG2 if ri % 2 == 0 else "#18225a")
                            c.text_frame.paragraphs[0].text = ""
                            add_runs(c.text_frame.paragraphs[0], r[i] if i < len(r) else [], 12, "#e5e9f5")
                elif codes:
                    cb = codes[0]
                    box = sd.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x0, Inches(1.9), w0, Inches(4.7))
                    box.adjustments[0] = 0.04
                    box.fill.solid(); box.fill.fore_color.rgb = rgb("#060a1f"); box.line.color.rgb = rgb("#27367a")
                    tf = box.text_frame; tf.word_wrap = True
                    tf.margin_left = tf.margin_right = Inches(0.25); tf.margin_top = Inches(0.2)
                    tf.vertical_anchor = MSO_ANCHOR.TOP
                    lines = cb["text"].split("\n")[:22]
                    for k, line in enumerate(lines):
                        p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
                        run = p.add_run(); run.text = line or " "
                        run.font.name = "Consolas"; run.font.size = Pt(13); run.font.color.rgb = rgb("#e5e9f5")
                        p.alignment = PP_ALIGN.LEFT

    try:
        prs.core_properties.title = title[:250]
        prs.core_properties.author = "Zelpophai AI"
    except Exception:
        pass
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ═════════════════════════════════════════════════════════════════ XLSX ══
_NUM_RE = re.compile(r"^\s*([-+(]?)\s*([$€£₦¥₹]|NGN|USD|KES|GHS)?\s*([-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-+]?\d+(?:\.\d+)?)\s*(%|k|K|m|M)?\s*\)?\s*$")
_CUR_FMT = {"$": '"$"#,##0.00', "€": '"€"#,##0.00', "£": '"£"#,##0.00', "₦": '"₦"#,##0.00', "¥": '"¥"#,##0', "₹": '"₹"#,##0.00',
            "NGN": '"₦"#,##0.00', "USD": '"$"#,##0.00', "KES": '"KSh "#,##0.00', "GHS": '"GH₵"#,##0.00'}


def _coerce(text):
    """'1,200' → 1200, '$5.50' → 5.5 (currency format), '12%' → 0.12, '=SUM(B2:B5)' stays a formula."""
    s = (text or "").strip()
    if not s:
        return None, None
    if s.startswith("=") and len(s) > 1:
        return s, None
    m = _NUM_RE.match(s)
    if m:
        neg = m.group(1) in ("-", "(")
        cur = m.group(2)
        num = float(m.group(3).replace(",", ""))
        suf = m.group(4)
        if neg:
            num = -num
        if suf == "%":
            return num / 100.0, "0.0%" if num % 1 else "0%"
        if suf in ("k", "K"):
            num *= 1000
        elif suf in ("m", "M"):
            num *= 1_000_000
        if cur:
            return num, _CUR_FMT.get(cur, "#,##0.00")
        if num == int(num) and "." not in m.group(3):
            num = int(num)
            return num, "#,##0" if abs(num) >= 10000 or "," in m.group(3) else None
        return num, "#,##0.00"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        try:
            return datetime.strptime(s, "%Y-%m-%d"), "yyyy-mm-dd"
        except ValueError:
            pass
    return s, None


def render_xlsx(content, filename="sheet"):
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    blocks = parse(content)
    wb = openpyxl.Workbook()
    head_fill = PatternFill("solid", fgColor="1E3A8A")
    head_font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    band = PatternFill("solid", fgColor="F5F8FF")
    thin = Side(style="thin", color="DBE4FF")
    border = Border(bottom=thin)
    title_font = Font(bold=True, size=15, color="0B1B4D", name="Calibri")

    tables, heading, notes = [], None, []
    for b in blocks:
        if b["t"] == "h":
            heading = plain(b["runs"])
        elif b["t"] == "table":
            tables.append((heading, b))
            heading = None
        elif b["t"] in ("p", "list"):
            notes.extend(plain(r) for _, r, _ in _flatten_points([b]))

    used = set()

    def sheet_name(n, k):
        base = re.sub(r"[\\/*?:\[\]]", "", n or f"Sheet{k + 1}")[:28].strip() or f"Sheet{k + 1}"
        name, i = base, 2
        while name.lower() in used:
            name = f"{base[:25]} {i}"; i += 1
        used.add(name.lower())
        return name

    if not tables:
        ws = wb.active
        ws.title = sheet_name(doc_title(blocks, os.path.splitext(filename)[0]), 0)
        r = 1
        for b in blocks:
            for line in _plain_lines(b, 0):
                if line.strip() and not set(line.strip()) <= set("=-"):
                    ws.cell(row=r, column=1, value=line)
                    r += 1
        ws.column_dimensions["A"].width = 100
    for k, (name, tb) in enumerate(tables):
        ws = wb.active if k == 0 else wb.create_sheet()
        ws.title = sheet_name(name or (doc_title(blocks, "") if k == 0 else ""), k)
        start = 1
        if name:
            ws.cell(row=1, column=1, value=name).font = title_font
            start = 3
        cols = max([len(tb["head"])] + [len(r) for r in tb["rows"]])
        widths = [8] * cols
        for i in range(cols):
            c = ws.cell(row=start, column=i + 1, value=plain(tb["head"][i]) if i < len(tb["head"]) else "")
            c.fill, c.font = head_fill, head_font
            c.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
            widths[i] = max(widths[i], len(str(c.value or "")) + 4)
        ws.row_dimensions[start].height = 22
        for ri, row in enumerate(tb["rows"]):
            for i in range(cols):
                txt = plain(row[i]) if i < len(row) else ""
                val, fmt = _coerce(txt)
                bold = any(r.b for r in (row[i] if i < len(row) else []))
                c = ws.cell(row=start + 1 + ri, column=i + 1, value=val)
                if fmt:
                    c.number_format = fmt
                if isinstance(val, (int, float)) or (isinstance(val, str) and val.startswith("=")):
                    c.alignment = Alignment(horizontal="right")
                else:
                    c.alignment = Alignment(wrap_text=len(txt) > 50, vertical="top")
                if bold or re.match(r"^\s*(total|grand total|sum|net)\b", plain(row[0]) if row else "", re.I):
                    c.font = Font(bold=True)
                if ri % 2 == 1:
                    c.fill = band
                c.border = border
                widths[i] = max(widths[i], min(len(txt) + 3, 60))
        for i, w in enumerate(widths):
            ws.column_dimensions[get_column_letter(i + 1)].width = w
        last = start + len(tb["rows"])
        ws.freeze_panes = ws.cell(row=start + 1, column=1)
        if tb["rows"]:
            ws.auto_filter.ref = f"A{start}:{get_column_letter(cols)}{last}"
        if k == 0 and notes:
            r = last + 2
            for line in notes[:30]:
                ws.cell(row=r, column=1, value=line).font = Font(italic=True, color="6B7280")
                r += 1
    try:
        wb.properties.title = doc_title(blocks, filename)
        wb.properties.creator = "Zelpophai AI"
    except Exception:
        pass
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_csv(content):
    blocks = parse(content)
    tables = [b for b in blocks if b["t"] == "table"]
    out = io.StringIO()
    w = csv.writer(out)
    if tables:
        for k, tb in enumerate(tables):
            if k:
                w.writerow([])
            w.writerow([plain(c) for c in tb["head"]])
            for r in tb["rows"]:
                w.writerow([plain(c) for c in r])
    else:
        text = (content or "").strip()
        # already CSV? keep as is
        if text and all("," in ln for ln in text.split("\n")[:3]):
            return ("﻿" + text + "\n").encode("utf-8")
        for line in text.split("\n"):
            if line.strip():
                w.writerow([line.strip()])
    return ("﻿" + out.getvalue()).encode("utf-8")  # BOM so Excel opens UTF-8 correctly


# ═══════════════════════════════════════════════════════════════ dispatch ══
def render(content, filename, fmt):
    fmt = (fmt or "md").lower().strip().lstrip(".")
    if fmt == "md":
        return (content or "").encode("utf-8")
    if fmt == "txt":
        return _strip_md(content).encode("utf-8")
    if fmt in CODE_EXT:
        return (_clean_body(content or "") + "\n").encode("utf-8")
    if fmt == "csv":
        return render_csv(content)
    if fmt == "html":
        return render_html(content, filename)
    if fmt == "pdf":
        return render_pdf(content, filename)
    if fmt == "docx":
        return render_docx(content, filename)
    if fmt == "pptx":
        return render_pptx(content, filename)
    if fmt == "xlsx":
        return render_xlsx(content, filename)
    raise ValueError(f"Format not supported: {fmt}")


def stats(content, fmt):
    """Small facts for the file card: words, pages/slides/sheets."""
    blocks = parse(content) if fmt not in CODE_EXT and fmt != "html" else []
    words = len(re.findall(r"\w+", content or ""))
    info = {"words": words}
    if fmt == "pptx":
        _, _, slides = _slides_from_blocks(blocks, "x")
        info["slides"] = 1 + len(slides)
    elif fmt in ("xlsx", "csv"):
        tb = [b for b in blocks if b["t"] == "table"]
        info["sheets"] = max(1, len(tb)) if fmt == "xlsx" else 1
        info["rows"] = sum(len(b["rows"]) for b in tb)
    elif fmt in ("docx", "pdf"):
        info["pages"] = max(1, round(words / 450 + sum(1 for b in blocks if b["t"] in ("table", "code")) * 0.25))
    elif fmt in CODE_EXT:
        info["lines"] = (content or "").count("\n") + 1
    return info


# ════════════════════════════════════════════════════════════════ preview ══
_PREVIEW_EXTRA = """
.slides{display:grid;gap:22px;max-width:980px;margin:0 auto}
.slide{aspect-ratio:16/9;background:radial-gradient(120% 90% at 100% 0,#1d3fa8 0,transparent 55%),radial-gradient(90% 80% at 0 100%,#4c1d95 0,transparent 55%),#0b1230;color:#fff;border-radius:16px;padding:5% 6%;position:relative;overflow:hidden;box-shadow:0 14px 40px rgba(11,18,48,.35);display:flex;flex-direction:column}
.slide:before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,#2563eb,#7c3aed)}
.slide h2{color:#fff;border:none;font-size:clamp(18px,3vw,30px);margin:0 0 .6em;padding:0}
.slide h2:after{content:"";display:block;width:56px;height:4px;border-radius:2px;margin-top:10px;background:linear-gradient(90deg,#2563eb,#7c3aed)}
.slide.title{justify-content:center}.slide.title h1{color:#fff;font-size:clamp(24px,4.5vw,48px)}
.slide.title p{color:#c7d2fe;font-size:clamp(13px,1.8vw,20px)}
.slide ul,.slide ol{font-size:clamp(12px,1.7vw,19px)}.slide li{margin:.35em 0}
.slide li::marker{color:#60a5fa}
.slide p,.slide td{color:#e5e9f5}.slide th{background:#1e40af;color:#fff}.slide td{background:#111a44;border-color:#27367a}
.slide .tw{border-color:#27367a}.slide code{background:#1e293b;color:#93c5fd}
.slide .num{position:absolute;right:22px;bottom:14px;color:#8ea0d6;font-size:12px}
.slide h3{color:#93c5fd}
.sheettabs{display:flex;gap:6px;margin:0 0 -1px;flex-wrap:wrap}.sheettabs span{background:#e8eefc;color:#1e3a8a;padding:6px 14px;border-radius:10px 10px 0 0;font-size:13px;font-weight:600}
.codeview{max-width:1000px;margin:0 auto}
"""


def preview_html(content, name, fmt):
    """An HTML page that shows roughly what the file looks like."""
    title = os.path.splitext(name)[0]
    head = ("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>{_html.escape(name)}</title><style>{_DOC_CSS}{_PREVIEW_EXTRA}</style></head><body>")
    if fmt == "html":
        return render_html(content, name).decode("utf-8")
    if fmt in CODE_EXT:
        body = f'<div class="codeview"><pre><span class="lang">{_html.escape(fmt)}</span><code>{_html.escape(_clean_body(content))}</code></pre></div>'
        return head + body + "</body></html>"
    if fmt == "pptx":
        blocks = parse(content)
        t, sub, slides = _slides_from_blocks(blocks, title)
        parts = [f'<section class="slide title"><h1>{_html.escape(t)}</h1>' + (f"<p>{_html.escape(sub)}</p>" if sub else "") + "</section>"]
        for i, s in enumerate(slides, start=2):
            parts.append(f'<section class="slide">' + (f"<h2>{_html.escape(s['title'])}</h2>" if s["title"] else "")
                         + _blocks_html(s["blocks"]) + f'<span class="num">{i}</span></section>')
        return head + '<div class="slides">' + "".join(parts) + "</div></body></html>"
    if fmt in ("xlsx", "csv"):
        blocks = parse(content)
        out, heading = [], None
        for b in blocks:
            if b["t"] == "h":
                heading = plain(b["runs"])
            elif b["t"] == "table":
                out.append(f'<div class="sheettabs"><span>{_html.escape(heading or "Sheet")}</span></div>' + _blocks_html([b]))
                heading = None
        body = "".join(out) or _blocks_html(blocks)
        return head + f'<main class="page">{body}</main></body></html>'
    if fmt == "txt":
        return head + f'<main class="page"><pre style="background:#fff;color:#111827;white-space:pre-wrap">{_html.escape(_strip_md(content))}</pre></main></body></html>'
    return render_html(content, name).decode("utf-8")
