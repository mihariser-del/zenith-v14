import os
import re
import io
import csv
import html as _html
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, UploadedFile
from auth import get_current_user_from_cookie
from limits import check_limit

router = APIRouter(prefix="/api/generate", tags=["generate"])

# Generated documents are written to the same store as uploads so every file
# gets a persistent, reopenable/shareable URL (/api/files/{id}/download) and
# also shows up in the Files list.
try:
    from files import UPLOAD_DIR
except Exception:  # pragma: no cover - defensive
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
SUPPORTED = set(MIME.keys())


class GenerateDocRequest(BaseModel):
    content: str
    filename: str = "document"
    format: str = "md"


# ── Markdown parsing ────────────────────────────────────────────────────────
def _inline_html(text):
    s = _html.escape(text, quote=True)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def _plain(text):
    s = text
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", s)
    s = re.sub(r"~~([^~]+)~~", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", s)
    return s.strip()


def _para_markup(text):
    """reportlab Paragraph markup (escaped + inline bold/italic/code)."""
    s = _html.escape(text, quote=True)
    s = re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", s)
    return s


def parse_blocks(content):
    lines = (content or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks = []
    i, n = 0, len(lines)
    while i < n:
        raw = lines[i]
        s = raw.strip()
        if not s:
            i += 1
            continue
        if s in ("---", "***", "___"):
            blocks.append(("hr", None))
            i += 1
            continue
        if s.startswith("```"):
            lang = s[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append(("code", ("\n".join(buf), lang)))
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            level = min(len(m.group(1)), 3)
            blocks.append((f"h{level}", m.group(2).strip()))
            i += 1
            continue
        if "|" in s and i + 1 < n and re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", lines[i + 1]):
            header = [c.strip() for c in s.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            blocks.append(("table", (header, rows)))
            continue
        if s.startswith(("* ", "- ", "+ ")):
            items = []
            while i < n and lines[i].strip().startswith(("* ", "- ", "+ ")):
                items.append(lines[i].strip()[2:].strip())
                i += 1
            blocks.append(("ul", items))
            continue
        if re.match(r"^\d+[.)]\s+", s):
            items = []
            while i < n and re.match(r"^\d+[.)]\s+", lines[i].strip()):
                items.append(re.sub(r"^\d+[.)]\s+", "", lines[i].strip()))
                i += 1
            blocks.append(("ol", items))
            continue
        if s.startswith(">"):
            quote = []
            while i < n and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            blocks.append(("quote", " ".join(quote)))
            continue
        blocks.append(("p", s))
        i += 1
    return blocks


def doc_title(blocks, filename):
    for kind, val in blocks:
        if kind == "h1" and val and val.strip():
            return _plain(val)
    return filename


# ── HTML ────────────────────────────────────────────────────────────────────
def _blocks_to_html(blocks):
    out = []
    for kind, val in blocks:
        if kind in ("h1", "h2", "h3"):
            out.append(f"<{kind}>{_inline_html(val)}</{kind}>")
        elif kind == "p":
            out.append(f"<p>{_inline_html(val)}</p>")
        elif kind == "ul":
            out.append("<ul>" + "".join(f"<li>{_inline_html(x)}</li>" for x in val) + "</ul>")
        elif kind == "ol":
            out.append("<ol>" + "".join(f"<li>{_inline_html(x)}</li>" for x in val) + "</ol>")
        elif kind == "quote":
            out.append(f"<blockquote>{_inline_html(val)}</blockquote>")
        elif kind == "hr":
            out.append("<hr>")
        elif kind == "code":
            code, lang = val
            out.append(f"<pre><code class=\"language-{_html.escape(lang)}\">{_html.escape(code)}</code></pre>")
        elif kind == "table":
            header, rows = val
            th = "".join(f"<th>{_inline_html(c)}</th>" for c in header)
            tr = "".join("<tr>" + "".join(f"<td>{_inline_html(c)}</td>" for c in r) + "</tr>" for r in rows)
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
    return "\n".join(out)


def _render_html(content, filename):
    blocks = parse_blocks(content)
    title = doc_title(blocks, filename)
    body = _blocks_to_html(blocks)
    css = """
    *{box-sizing:border-box}
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:860px;margin:0 auto;padding:48px 28px 80px;line-height:1.7;color:#1f2733;background:#fff}
    h1{font-size:2.1rem;margin:0 0 6px;color:#4c1d95;letter-spacing:-.02em}
    h2{font-size:1.5rem;margin:34px 0 10px;color:#5b21b6;border-bottom:2px solid #ede9fe;padding-bottom:8px}
    h3{font-size:1.2rem;margin:24px 0 8px;color:#6d28d9}
    p{margin:10px 0}
    ul,ol{margin:10px 0 10px 22px}
    li{margin:4px 0}
    a{color:#7c3aed}
    code{background:#f3f0ff;color:#6d28d9;padding:2px 6px;border-radius:5px;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
    pre{background:#0f1220;color:#e6e8f0;padding:16px 18px;border-radius:12px;overflow:auto}
    pre code{background:none;color:inherit;padding:0}
    blockquote{margin:14px 0;padding:10px 18px;border-left:4px solid #a78bfa;background:#faf8ff;color:#4b5563;border-radius:0 8px 8px 0}
    table{border-collapse:collapse;width:100%;margin:18px 0;font-size:.95rem;box-shadow:0 1px 3px rgba(0,0,0,.06);border-radius:10px;overflow:hidden}
    th,td{border:1px solid #ece9f5;padding:10px 14px;text-align:left}
    th{background:#f5f3ff;color:#4c1d95;font-weight:700}
    tr:nth-child(even) td{background:#fbfaff}
    hr{border:none;border-top:1px solid #ece9f5;margin:28px 0}
    """
    doc = (
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
        f"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{_html.escape(title)}</title>"
        f"<style>{css}</style></head><body>{body}</body></html>"
    )
    return doc.encode("utf-8")


# ── CSV ─────────────────────────────────────────────────────────────────────
def _render_csv(content):
    blocks = parse_blocks(content)
    tables = [val for k, val in blocks if k == "table"]
    out = io.StringIO()
    w = csv.writer(out)
    if tables:
        for idx, (header, rows) in enumerate(tables):
            if idx:
                w.writerow([])
            w.writerow(header)
            for r in rows:
                w.writerow(r)
    else:
        for line in (content or "").split("\n"):
            if line.strip():
                if "|" in line:
                    w.writerow([c.strip() for c in line.strip().strip("|").split("|")])
                else:
                    w.writerow([line])
    return out.getvalue().encode("utf-8")


# ── PDF ─────────────────────────────────────────────────────────────────────
def _render_pdf(content, filename):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            ListFlowable, ListItem, HRFlowable,
        )
    except ImportError:
        return _render_html(content, filename)

    blocks = parse_blocks(content)
    title = doc_title(blocks, filename)
    accent = colors.HexColor("#6d28d9")

    styles = {
        "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=24, leading=30, textColor=accent, spaceAfter=4, alignment=TA_CENTER),
        "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=11, leading=15, textColor=colors.HexColor("#6b7280"), alignment=TA_CENTER, spaceAfter=16),
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=24, textColor=accent, spaceBefore=14, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=15, leading=20, textColor=colors.HexColor("#5b21b6"), spaceBefore=12, spaceAfter=5),
        "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=12.5, leading=17, textColor=colors.HexColor("#7c3aed"), spaceBefore=10, spaceAfter=4),
        "p": ParagraphStyle("p", fontName="Helvetica", fontSize=11, leading=16, spaceAfter=6, textColor=colors.HexColor("#1f2733")),
        "quote": ParagraphStyle("q", fontName="Helvetica-Oblique", fontSize=11, leading=16, leftIndent=14, textColor=colors.HexColor("#4b5563")),
        "code": ParagraphStyle("c", fontName="Courier", fontSize=8.6, leading=11.5, textColor=colors.HexColor("#e6e8f0"), backColor=colors.HexColor("#0f1220"), borderPadding=8, spaceBefore=4, spaceAfter=8),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9, leading=12),
        "cellh": ParagraphStyle("cellh", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.HexColor("#4c1d95")),
    }

    story = [
        Paragraph(_html.escape(title), styles["title"]),
        Paragraph(f"Generated by Zelpophai AI &middot; {datetime.now(timezone.utc):%b %d, %Y}", styles["sub"]),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#ede9fe"), spaceAfter=10),
    ]

    pending_table = None
    for kind, val in blocks:
        if kind == "h1" and _plain(val) == title:
            continue
        if kind in ("h1", "h2", "h3"):
            story.append(Paragraph(_html.escape(_plain(val)), styles[kind]))
        elif kind == "p":
            story.append(Paragraph(_para_markup(val), styles["p"]))
        elif kind in ("ul", "ol"):
            items = [ListItem(Paragraph(_para_markup(x), styles["p"]), leftIndent=12) for x in val]
            story.append(ListFlowable(items, bulletType="1" if kind == "ol" else "bullet", start="1" if kind == "ol" else None, leftIndent=16))
            story.append(Spacer(1, 4))
        elif kind == "quote":
            story.append(Paragraph(_para_markup(val), styles["quote"]))
            story.append(Spacer(1, 4))
        elif kind == "hr":
            story.append(HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#ece9f5"), spaceBefore=6, spaceAfter=6))
        elif kind == "code":
            code, _ = val
            story.append(Paragraph(_html.escape(code).replace("\n", "<br/>"), styles["code"]))
        elif kind == "table":
            header, rows = val
            data = [[Paragraph(_html.escape(_plain(c)), styles["cellh"]) for c in header]]
            for r in rows:
                data.append([Paragraph(_html.escape(_plain(c)), styles["cell"]) for c in _pad(r, len(header))])
            t = Table(data, hAlign="LEFT", repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f3ff")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e1f2")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbfaff")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.append(t)
            story.append(Spacer(1, 8))
    if pending_table:
        story.append(pending_table)

    buf = io.BytesIO()
    SimpleDocTemplate(
        buf, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
        title=title, author="Zelpophai AI",
    ).build(story)
    return buf.getvalue()


def _pad(row, width):
    row = list(row)
    if len(row) < width:
        row += [""] * (width - len(row))
    return row[:width]


# ── DOCX ────────────────────────────────────────────────────────────────────
def _render_docx(content, filename):
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        return (content or "").encode("utf-8")

    blocks = parse_blocks(content)
    title = doc_title(blocks, filename)
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)

    t = doc.add_heading(title, level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph(f"Generated by Zelpophai AI · {datetime.now(timezone.utc):%b %d, %Y}")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.size = Pt(9)
    sub.runs[0].font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    for kind, val in blocks:
        if kind == "h1" and _plain(val) == title:
            continue
        if kind in ("h1", "h2", "h3"):
            doc.add_heading(_plain(val), level=int(kind[1]))
        elif kind == "p":
            doc.add_paragraph(_plain(val))
        elif kind == "ul":
            for x in val:
                doc.add_paragraph(_plain(x), style="List Bullet")
        elif kind == "ol":
            for x in val:
                doc.add_paragraph(_plain(x), style="List Number")
        elif kind == "quote":
            p = doc.add_paragraph(_plain(val))
            p.style = doc.styles["Quote"] if "Quote" in [s.name for s in doc.styles] else p.style
        elif kind == "hr":
            doc.add_paragraph("─" * 40)
        elif kind == "code":
            code, _ = val
            p = doc.add_paragraph()
            run = p.add_run(code)
            run.font.name = "Consolas"
            run.font.size = Pt(9)
        elif kind == "table":
            header, rows = val
            tbl = doc.add_table(rows=1, cols=len(header))
            try:
                tbl.style = "Light Grid Accent 1"
            except Exception:
                tbl.style = "Table Grid"
            hdr = tbl.rows[0].cells
            for i, c in enumerate(header):
                hdr[i].text = _plain(c)
                for r in hdr[i].paragraphs[0].runs:
                    r.font.bold = True
            for r in rows:
                cells = tbl.add_row().cells
                for i, c in enumerate(_pad(r, len(header))):
                    cells[i].text = _plain(c)
            doc.add_paragraph()

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── PPTX ────────────────────────────────────────────────────────────────────
def _render_pptx(content, filename):
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
    except ImportError:
        return (content or "").encode("utf-8")

    blocks = parse_blocks(content)
    title = doc_title(blocks, filename)
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Title slide
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = title
    try:
        slide.placeholders[1].text = "Generated by Zelpophai AI"
    except Exception:
        pass

    # Group content by section headings.
    sections = []
    current = {"title": None, "bullets": []}
    for kind, val in blocks:
        if kind in ("h1", "h2") and _plain(val) != title:
            if current["title"] or current["bullets"]:
                sections.append(current)
            current = {"title": _plain(val), "bullets": []}
        elif kind in ("ul", "ol"):
            current["bullets"].extend(_plain(x) for x in val)
        elif kind == "p":
            current["bullets"].append(_plain(val))
        elif kind == "h3":
            current["bullets"].append(_plain(val))
    if current["title"] or current["bullets"]:
        sections.append(current)

    for sec in sections[:25]:
        if sec["title"]:
            s = prs.slides.add_slide(prs.slide_layouts[5])
            s.shapes.title.text = sec["title"]
        else:
            s = prs.slides.add_slide(prs.slide_layouts[5])
            s.shapes.title.text = title
        bullets = [b for b in sec["bullets"] if b][:10]
        if bullets:
            body = s.shapes.add_textbox(Inches(0.7), Inches(1.7), Inches(11.9), Inches(5.2))
            tf = body.text_frame
            tf.word_wrap = True
            for i, b in enumerate(bullets):
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.text = "• " + b
                p.font.size = Pt(18)
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ── XLSX ────────────────────────────────────────────────────────────────────
def _render_xlsx(content, filename):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        return _render_csv(content)

    blocks = parse_blocks(content)
    wb = openpyxl.Workbook()
    header_fill = PatternFill("solid", fgColor="EDE9FE")
    header_font = Font(bold=True, color="4C1D95")

    def _auto_width(ws):
        for col in ws.columns:
            width = 10
            letter = None
            for cell in col:
                if letter is None:
                    letter = cell.column_letter
                if cell.value is not None:
                    width = max(width, min(len(str(cell.value)) + 2, 60))
            ws.column_dimensions[letter].width = width

    tables = []
    last_heading = None
    for kind, val in blocks:
        if kind in ("h1", "h2", "h3"):
            last_heading = _plain(val)
        elif kind == "table":
            tables.append((last_heading or filename, val))

    if tables:
        first = True
        for name, (header, rows) in tables:
            ws = wb.active if first else wb.create_sheet()
            first = False
            ws.title = (re.sub(r"[\\/*?:\[\]]", "", name) or "Sheet")[:31]
            ws.append(header)
            for c in ws[1]:
                c.font = header_font
                c.fill = header_fill
                c.alignment = Alignment(vertical="center")
            for r in rows:
                ws.append(_pad(r, len(header)))
            ws.freeze_panes = "A2"
            _auto_width(ws)
    else:
        ws = wb.active
        ws.title = (re.sub(r"[\\/*?:\[\]]", "", filename) or "Sheet")[:31]
        for line in (content or "").split("\n"):
            if not line.strip():
                continue
            if "|" in line:
                ws.append([c.strip() for c in line.strip().strip("|").split("|")])
            else:
                ws.append([_plain(line)])
        _auto_width(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Dispatcher ──────────────────────────────────────────────────────────────
def render_document(content, filename, fmt):
    fmt = (fmt or "md").lower().strip()
    if fmt in ("md", "txt"):
        return (content or "").encode("utf-8")
    if fmt == "csv":
        return _render_csv(content)
    if fmt == "html":
        return _render_html(content, filename)
    if fmt == "pdf":
        return _render_pdf(content, filename)
    if fmt == "docx":
        return _render_docx(content, filename)
    if fmt == "pptx":
        return _render_pptx(content, filename)
    if fmt == "xlsx":
        return _render_xlsx(content, filename)
    raise ValueError(f"Format not supported: {fmt}")


async def _store_generated(db, user, content, filename, fmt):
    fmt = (fmt or "md").lower().strip()
    if fmt not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Format not supported: {fmt}")
    data = render_document(content, filename, fmt)
    stored_name = f"{user.id}_{uuid.uuid4().hex[:12]}.{fmt}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as f:
        f.write(data)
    row = UploadedFile(
        user_id=user.id,
        filename=f"{filename}.{fmt}",
        stored_name=stored_name,
        file_size=len(data),
        mime_type=MIME[fmt],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row, data


@router.post("/document")
async def generate_document(req: GenerateDocRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    # File editor/generator system: guests blocked entirely, logged-in (free)
    # users get 10 combined create/edit actions/day then a fixed 1h cooldown.
    await check_limit(user, db, "file_tool")
    fmt = (req.format or "md").lower().strip()
    if fmt not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Format not supported: {fmt}")
    filename = (req.filename or "document")[:50]
    data = render_document(req.content, filename, fmt)
    return StreamingResponse(
        io.BytesIO(data),
        media_type=MIME[fmt],
        headers={"Content-Disposition": f'attachment; filename="{filename}.{fmt}"'},
    )


@router.post("/file")
async def generate_file_saved(req: GenerateDocRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Render + persist a document, returning a persistent shareable link."""
    user = await get_current_user_from_cookie(request, db)
    await check_limit(user, db, "file_tool")
    filename = (req.filename or "document")[:60]
    fmt = (req.format or "md").lower().strip()
    row, data = await _store_generated(db, user, req.content, filename, fmt)
    return {
        "id": row.id,
        "url": f"/api/files/{row.id}/download",
        "filename": row.filename,
        "format": fmt,
        "size": len(data),
        "mime": MIME[fmt],
    }
