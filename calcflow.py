"""Working an answer out on the calculation engine before writing it.

When a question needs real maths (see ai._needs_calc), the stronger model is
first asked for a program — not an answer — which runs on calcengine. If it
fails, the error goes back to the model to fix (twice at most). The exact
output is then handed to the model that writes the reply, which is told to use
those numbers and nothing else.

Used by chat answers (ai.py), Zelpophai Mini (miniagent.py) and the Android
assistant, so every place gets the same exact numbers.
"""

import html
import re

import calcengine
from router_ai import HEAVY_MODEL, _post

MAX_TRIES = 3

_ASK = (
    "You are the calculation step of Zelpophai AI. Do NOT answer the user. Write ONE program that works out every "
    "number their message needs, exactly, and prints each result clearly labelled. Use the facts and numbers given in "
    "the conversation (including any [FACTS FROM A WEB SEARCH] block). Where the question is ambiguous, pick the most "
    "standard interpretation and say which in a comment at the top.\n\n"
    + calcengine.GUIDE +
    "\n\nReply with ONLY the program in one ```python block. Its first line must be a comment like "
    "`# title: Monthly repayments on a UGX 50m loan` naming what it works out in a few words."
)


def _text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    return ""


def _code_from(reply: str) -> str:
    m = re.search(r"```(?:python|py)?\s*\n(.*?)```", reply or "", re.S)
    if m:
        return m.group(1).strip()
    # Some models forget the fence when told to reply with code only.
    return (reply or "").strip() if re.search(r"^\s*(#|\w+\s*=|print\(|def |for |import |from )", reply or "", re.M) else ""


def _title_from(code: str) -> str:
    m = re.search(r"^\s*#\s*title\s*:\s*(.+)$", code, re.M | re.I)
    return (m.group(1).strip() if m else "Worked out exactly")[:90]


async def work_out(messages: list, model: str = "") -> dict | None:
    """messages: the chat so far (system first is fine — it's skipped).
    Returns {ok, code, title, output, error, tries, ms} or None if no program came back."""
    convo = []
    for m in messages[-8:]:
        if m.get("role") not in ("user", "assistant"):
            continue
        t = _text_of(m.get("content"))
        if not t.strip():
            continue
        # Earlier answers can be long; the latest question (with facts) is kept whole.
        convo.append({"role": m["role"], "content": t if m is messages[-1] else t[-6000:]})
    if not convo or convo[-1]["role"] != "user":
        return None
    ask = [{"role": "system", "content": _ASK}] + convo
    last = None
    total_ms = 0
    for attempt in range(1, MAX_TRIES + 1):
        data = await _post({"model": model or HEAVY_MODEL, "temperature": 0.1, "max_tokens": 4000, "messages": ask},
                           timeout=90)
        reply = (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        code = _code_from(reply)
        if not code:
            return last
        res = await calcengine.run(code)
        total_ms += res.get("ms", 0)
        last = {"ok": bool(res.get("ok")), "code": code, "title": _title_from(code), "output": res.get("output", ""),
                "charts": res.get("charts") or [],
                "error": res.get("error", ""), "line": res.get("line"), "tries": attempt, "ms": total_ms}
        if res.get("ok") and ((res.get("output") or "").strip() or res.get("charts")):
            return last
        why = res.get("error") or "it printed nothing — print every result"
        where = f" (line {res['line']})" if res.get("line") else ""
        ask += [{"role": "assistant", "content": "```python\n" + code + "\n```"},
                {"role": "user", "content": f"That program failed{where}: {why}\n"
                 + (f"Output before it stopped:\n{res.get('output', '')[-1500:]}\n" if res.get("output") else "")
                 + "Fix it and reply with the WHOLE corrected program in one ```python block. Remember: only the "
                   "features listed are available."}]
    return last


def card(result: dict) -> str:
    """The <zrun>/<zout> pair the chat shows as a finished 'worked out' card.
    The output is HTML-escaped so nothing printed can turn into a tag."""
    code = result["code"].replace("</zrun>", "<\\/zrun>")
    title = html.escape(result.get("title") or "Worked out exactly", quote=True)
    import json as _json
    charts = "".join(f'<zchart>{html.escape(_json.dumps(c, separators=(",", ":")), quote=False)}</zchart>'
                     for c in (result.get("charts") or [])[:4])
    return (f'<zrun title="{title}" engine="1">\n{code}\n</zrun>'
            f'<zout ok="{"true" if result.get("ok") else "false"}" engine="1">'
            f'{html.escape(result.get("output") or result.get("error") or "")}</zout>{charts}\n\n')


def brief(result: dict) -> str:
    """What the writing model is told."""
    return (
        "\n\n[EXACT RESULTS FROM THE ZELPOPHAI CALCULATION ENGINE — the program below already ran]\n"
        f"Program:\n```python\n{result['code'][:12000]}\n```\nPrinted output:\n{result['output'][:14000]}\n"
        "[END OF RESULTS]\n\n"
        "Write the answer from these results. Rules: use these numbers exactly as printed (you may round for prose but "
        "the main figures must match); never redo the arithmetic yourself; explain the method and the formulas in plain "
        "words; present results in a table when there are several; if the output shows the question was ambiguous, say "
        "which reading was used. The app already shows the program and its output in a card above your answer, so do "
        "NOT write a <zrun> block and do NOT paste the whole raw output again."
        + (f" The card also shows {len(result.get('charts') or [])} chart(s) drawn from these numbers — refer to them "
           "(\"the chart above\") instead of describing every point, and don't draw another chart."
           if result.get("charts") else "")
    )
