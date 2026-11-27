"""Deeper research with helpers — what the Research button does from 25.2.

Before, Research was one web search and one answer. Now:
  1. a small model splits the question into 3–5 separate parts;
  2. every part is researched at the same time by its own web search
     ("helpers"), each bringing back notes and their sources;
  3. the stronger model writes ONE report from all the notes, citing a single
     numbered list of sources, which the app turns into links.

The person watches each part tick off in the step list while it happens.
If planning fails it falls back to one part (the question itself); if every
helper fails, the normal single web search takes over.
"""

import asyncio
import re

from router_ai import ROUTER_MODEL, SEARCH_MODEL, _json, _post, _sources_from

MAX_PARTS = 5
HELPER_TOKENS = 900
HELPER_TIMEOUT = 70


async def plan(question: str, history: list | None = None) -> list[str]:
    """Split a research question into separate searches."""
    recent = ""
    for m in (history or [])[-4:]:
        c = m.get("content")
        if isinstance(c, str) and c.strip():
            recent += f"{m.get('role')}: {c.strip()[:300]}\n"
    prompt = (
        "You plan web research. Split the user's question into 3 to 5 SEPARATE web searches that, together, "
        "would let someone write a thorough, balanced answer. Each must stand alone (no 'it' or 'they' — name "
        "the subject), be specific, and cover a different angle: background, current facts and numbers, "
        "different views or options, costs/risks, what's new. Include the year if recency matters. "
        'Reply with JSON only: {"parts": ["search 1", "search 2", ...]}'
    )
    data = await _post({"model": ROUTER_MODEL, "temperature": 0.2, "max_tokens": 300, "messages": [
        {"role": "system", "content": prompt},
        {"role": "user", "content": (f"Earlier in the chat:\n{recent}\n" if recent else "") + f"Question: {question[:1500]}"},
    ]}, timeout=20)
    text = ((data or {}).get("choices") or [{}])[0].get("message", {}).get("content", "") if data else ""
    parts = [str(p).strip() for p in (_json(text).get("parts") or []) if str(p).strip()]
    parts = list(dict.fromkeys(parts))[:MAX_PARTS]
    return parts or [question.strip()[:300]]


async def dig(part: str) -> dict:
    """One helper: search the web for one part. {ok, text, sources}."""
    data = await _post({"model": SEARCH_MODEL, "temperature": 0.2, "max_tokens": HELPER_TOKENS, "messages": [
        {"role": "system", "content": "You are a research helper. Find the facts for this one question from current, "
                                      "reliable sources. Write tight notes: facts, figures with dates, names, and any "
                                      "disagreement between sources. Cite every fact with [1], [2] matching your sources. "
                                      "No introduction, no conclusion, no Sources list."},
        {"role": "user", "content": part},
    ]}, timeout=HELPER_TIMEOUT)
    if not data:
        return {"ok": False, "text": "", "sources": []}
    text = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    sources = _sources_from(data)
    return {"ok": bool(text), "text": text, "sources": sources}


def merge(parts: list[str], results: list[dict]) -> tuple[str, list[dict]]:
    """All the helpers' notes, with their [n] markers renumbered into one shared
    source list. Returns (notes_text, sources)."""
    merged: list[dict] = []
    index: dict[str, int] = {}
    blocks = []
    for k, (part, res) in enumerate(zip(parts, results)):
        if not res or not res.get("ok"):
            blocks.append(f"### Part {k + 1}: {part}\n(No results came back for this part.)")
            continue
        local = res.get("sources") or []
        remap = {}
        for i, s in enumerate(local, start=1):
            url = s.get("url", "")
            if not url:
                continue
            if url not in index:
                merged.append({"url": url, "title": s.get("title", "")})
                index[url] = len(merged)
            remap[i] = index[url]

        def renumber(m):
            nums = [int(n) for n in re.findall(r"\d+", m.group(0))]
            got = [remap[n] for n in nums if n in remap]
            return "".join(f"[{g}]" for g in dict.fromkeys(got)) if got else ""
        text = re.sub(r"\[\d+(?:\s*,\s*\d+)*\]", renumber, res["text"])
        blocks.append(f"### Part {k + 1}: {part}\n{text}")
    listing = "\n".join(f"[{i}] {s['title'] or s['url']} — {s['url']}" for i, s in enumerate(merged, start=1))
    notes = "\n\n".join(blocks) + ("\n\nSOURCES (numbered):\n" + listing if listing else "")
    return notes, merged


def writer_brief(notes: str) -> str:
    """What the stronger model is told before it writes the report."""
    return (
        "\n\n[RESEARCH NOTES — gathered just now by several web searches, one per part of the question]\n"
        f"{notes}\n[END OF NOTES]\n\n"
        "Write the full research report for the user from these notes. Rules:\n"
        "- Answer the question directly first (two or three sentences), then go deeper under clear ## headings.\n"
        "- Use ONLY facts from the notes. Cite every fact with the source number in square brackets, like [3] or "
        "[2][5], using the numbers in the SOURCES list. Never invent a number or a source.\n"
        "- Where sources disagree or a part came back empty, say so plainly.\n"
        "- Use a table when comparing several options.\n"
        "- Finish with a short '## In short' section.\n"
        "- Do NOT write your own Sources list — the app adds it."
    )
