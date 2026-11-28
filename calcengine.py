"""Zelpophai's calculation engine: real Python maths, run on the server, safely.

Why it exists: the AI is good at setting a problem up and bad at long sums in
its head. Since 25.1 it could write Python that ran in the person's browser,
which is slow to start (Python has to download) and doesn't work in Mini or on
Android. This engine runs the same kind of code on the server in a fraction of
a second, so every answer that needs maths gets exact numbers.

Why it is safe even though the AI wrote the code (and a cleverly worded message
could steer the AI): the code is NEVER handed to Python's exec/eval. It is
parsed into a syntax tree and this file walks that tree itself, allowing only
plain maths:
  * numbers, strings, lists, dicts, sets, loops, ifs, small functions, f-strings
  * a fixed list of safe built-ins and the math / statistics / decimal /
    fractions / datetime pieces listed below, plus finance helpers
  * method calls only from a short allow-list per type (list.append, str.split…)
  * NO imports of anything else, NO attribute names starting with "_", NO
    files, network, classes, eval/exec/open/getattr/type …
On top of that every run happens in a separate, throw-away Python process with
a CPU, memory and wall-clock limit, and the walker counts steps, so a runaway
loop or a giant number is stopped rather than hurting the server.

Use:  result = await calcengine.run(code)   → {ok, output, error, line}
"""

import ast
import asyncio
import datetime as _dt
import decimal
import fractions
import json
import math
import os
import re
import statistics
import sys
import time

MAX_CODE = 24_000          # characters of program
MAX_STEPS = 4_000_000      # tree nodes evaluated
MAX_SECONDS = 9.0          # inside the worker
WALL_SECONDS = 13.0        # the worker is killed after this
MAX_OUTPUT = 30_000        # characters printed
MAX_ITEMS = 2_000_000      # elements in one list / string
MAX_RANGE = 10_000_000
MAX_INT_BITS = 200_000     # ~60 000 digits
MAX_DEPTH = 60             # nested calls of the code's own functions


class CalcError(Exception):
    """A plain-language problem with the program."""
    def __init__(self, msg, line=None):
        super().__init__(msg)
        self.line = line


class _Break(Exception):
    pass


class _Continue(Exception):
    pass


class _Return(Exception):
    def __init__(self, value):
        self.value = value


# ── finance and helper functions the code can call ────────────────────────────
def _num(x, what="value"):
    if isinstance(x, bool) or not isinstance(x, (int, float, decimal.Decimal, fractions.Fraction)):
        raise CalcError(f"{what} must be a number")
    return float(x)


def pmt(rate, nper, pv, fv=0.0, when=0):
    """Payment per period for a loan/annuity (negative = money paid out, like Excel)."""
    rate, nper, pv, fv = _num(rate, "rate"), _num(nper, "nper"), _num(pv, "pv"), _num(fv, "fv")
    if nper == 0:
        raise CalcError("nper can't be 0")
    if rate == 0:
        return -(pv + fv) / nper
    f = (1 + rate) ** nper
    return -(rate * (pv * f + fv)) / ((1 + rate * when) * (f - 1))


def fv(rate, nper, pmt_=0.0, pv=0.0, when=0):
    rate, nper, pmt_, pv = _num(rate), _num(nper), _num(pmt_), _num(pv)
    if rate == 0:
        return -(pv + pmt_ * nper)
    f = (1 + rate) ** nper
    return -(pv * f + pmt_ * (1 + rate * when) * (f - 1) / rate)


def pv(rate, nper, pmt_=0.0, fv_=0.0, when=0):
    rate, nper, pmt_, fv_ = _num(rate), _num(nper), _num(pmt_), _num(fv_)
    if rate == 0:
        return -(fv_ + pmt_ * nper)
    f = (1 + rate) ** nper
    return -(fv_ + pmt_ * (1 + rate * when) * (f - 1) / rate) / f


def nper(rate, pmt_, pv_, fv_=0.0, when=0):
    rate, pmt_, pv_, fv_ = _num(rate), _num(pmt_), _num(pv_), _num(fv_)
    if rate == 0:
        if pmt_ == 0:
            raise CalcError("with no interest and no payment it never ends")
        return -(pv_ + fv_) / pmt_
    z = pmt_ * (1 + rate * when) / rate
    try:
        return math.log((-fv_ + z) / (pv_ + z)) / math.log(1 + rate)
    except (ValueError, ZeroDivisionError):
        raise CalcError("this loan is never paid off with that payment")


def npv(rate, cashflows):
    """Net present value; the FIRST cash flow is today (time 0), like numpy-financial.
    (Excel's NPV() starts at time 1 — for that, use npv(rate, [0] + flows).)"""
    rate = _num(rate, "rate")
    return sum(_num(c, "cash flow") / (1 + rate) ** t for t, c in enumerate(cashflows))


def solve(f, lo, hi, tol=1e-12, max_iter=300):
    """A value x between lo and hi where f(x) == 0 (bisection + secant, needs a sign change)."""
    a, b = _num(lo), _num(hi)
    fa, fb = _num(f(a)), _num(f(b))
    if fa == 0:
        return a
    if fb == 0:
        return b
    if (fa > 0) == (fb > 0):
        raise CalcError("solve() needs f(lo) and f(hi) to have opposite signs — widen the range")
    for _ in range(max_iter):
        m = (a + b) / 2
        fm = _num(f(m))
        if fm == 0 or abs(b - a) < tol * max(1.0, abs(m)):
            return m
        if (fm > 0) == (fa > 0):
            a, fa = m, fm
        else:
            b, fb = m, fm
    return (a + b) / 2


def irr(cashflows):
    """Internal rate of return per period (first cash flow at time 0)."""
    flows = [_num(c, "cash flow") for c in cashflows]
    if not (any(c < 0 for c in flows) and any(c > 0 for c in flows)):
        raise CalcError("irr() needs at least one negative and one positive cash flow")
    f = lambda r: sum(c / (1 + r) ** t for t, c in enumerate(flows))
    lo, hi = -0.9999, 1.0
    while (f(lo) > 0) == (f(hi) > 0) and hi < 1e6:
        hi *= 2
    return solve(f, lo, hi)


def rate(nper_, pmt_, pv_, fv_=0.0, when=0):
    """Interest rate per period that makes the loan/annuity balance."""
    n = _num(nper_)
    g = lambda r: fv(r, n, pmt_, pv_, when) - _num(fv_)
    lo, hi = -0.99, 1.0
    if abs(g(0.0)) < 1e-12:
        return 0.0
    for lo_, hi_ in ((1e-9, 1.0), (-0.99, -1e-9), (1.0, 100.0)):
        if (g(lo_) > 0) != (g(hi_) > 0):
            return solve(g, lo_, hi_)
    raise CalcError("couldn't find a rate for those numbers")


def mirr(cashflows, finance_rate, reinvest_rate):
    flows = [_num(c) for c in cashflows]
    n = len(flows) - 1
    pos = sum(c * (1 + reinvest_rate) ** (n - t) for t, c in enumerate(flows) if c > 0)
    neg = sum(c / (1 + finance_rate) ** t for t, c in enumerate(flows) if c < 0)
    if neg == 0 or pos == 0 or n <= 0:
        raise CalcError("mirr() needs both positive and negative cash flows")
    return (pos / -neg) ** (1 / n) - 1


def _as_date(d):
    if isinstance(d, _dt.datetime):
        return d.date()
    if isinstance(d, _dt.date):
        return d
    if isinstance(d, str):
        return _dt.date.fromisoformat(d[:10])
    raise CalcError("dates must be date(...) or 'YYYY-MM-DD'")


def xnpv(rate_, cashflows, dates):
    ds = [_as_date(d) for d in dates]
    d0 = ds[0]
    return sum(_num(c) / (1 + rate_) ** ((d - d0).days / 365.0) for c, d in zip(cashflows, ds))


def xirr(cashflows, dates):
    return solve(lambda r: xnpv(r, cashflows, dates), -0.9999, 100.0)


def cagr(start, end, years):
    start, end, years = _num(start), _num(end), _num(years)
    if start <= 0 or years <= 0:
        raise CalcError("cagr() needs a positive start value and years")
    return (end / start) ** (1 / years) - 1


def effective_rate(nominal, periods_per_year):
    return (1 + _num(nominal) / _num(periods_per_year)) ** _num(periods_per_year) - 1


def amortization(principal, annual_rate, years, per_year=12):
    """Rows of a loan schedule: period, payment, interest, principal, balance."""
    n = int(round(_num(years) * _num(per_year)))
    if n > 20000:
        raise CalcError("that schedule is too long")
    r = _num(annual_rate) / _num(per_year)
    pay = -pmt(r, n, principal)
    bal, rows = float(principal), []
    for k in range(1, n + 1):
        interest = bal * r
        princ = pay - interest
        bal -= princ
        rows.append({"period": k, "payment": pay, "interest": interest, "principal": princ, "balance": max(bal, 0.0) if abs(bal) < 1e-6 else bal})
    return rows


def round_money(x, places=2):
    """Round like a bank/receipt does (halves go up), not Python's round-half-even."""
    q = decimal.Decimal(1).scaleb(-int(places))
    return float(decimal.Decimal(str(x)).quantize(q, rounding=decimal.ROUND_HALF_UP))


def money(x, places=2, symbol=""):
    """'1,234,567.89' — commas, fixed places, no '-0.00'."""
    v = round_money(x, places)
    if v == 0:
        v = 0.0
    s = f"{v:,.{int(places)}f}"
    return (symbol + " " if symbol else "") + s


def pct(x, places=2):
    """0.0725 → '7.25%'."""
    v = round_money(_num(x) * 100, places)
    if v == 0:
        v = 0.0
    return f"{v:.{int(places)}f}%"


def integrate(f, a, b, n=2000):
    """Area under f from a to b (Simpson's rule)."""
    a, b = _num(a), _num(b)
    n = int(n) + (int(n) % 2)
    if n > 200000:
        raise CalcError("too many integration steps")
    h = (b - a) / n
    s = _num(f(a)) + _num(f(b))
    for i in range(1, n):
        s += (4 if i % 2 else 2) * _num(f(a + i * h))
    return s * h / 3


def table(rows, headers=None, places=2):
    """Print rows (lists or dicts) as a neat text table."""
    rows = list(rows)
    if not rows:
        _PRINT[0]("(no rows)")
        return
    if isinstance(rows[0], dict):
        headers = headers or list(rows[0].keys())
        rows = [[r.get(h, "") for h in headers] for r in rows]

    def cell(v):
        if isinstance(v, float):
            return money(v, places)
        return str(v)
    body = [[cell(v) for v in r] for r in rows]
    head = [str(h) for h in (headers or [])]
    cols = max(len(r) for r in body + ([head] if head else []))
    widths = [max(len(r[i]) if i < len(r) else 0 for r in body + ([head] if head else [])) for i in range(cols)]
    fmt = lambda r: " | ".join((r[i] if i < len(r) else "").rjust(widths[i]) for i in range(cols))
    if head:
        _PRINT[0](fmt(head))
        _PRINT[0]("-+-".join("-" * w for w in widths))
    for r in body:
        _PRINT[0](fmt(r))


_CHARTS = [[]]
CHART_KINDS = ("line", "bar", "area", "pie", "doughnut", "scatter", "stacked")


def chart(kind, labels, series, title="", x="", y="", money_axis=False):
    """Draw a chart under the answer. kind: line, bar, area, stacked (stacked bars), pie,
    doughnut or scatter. labels: the x values (years, names…). series: a list of numbers,
    or a dict {"Series name": [numbers…]} for several lines/bars. For scatter, series is
    a list of (x, y) pairs or {"name": [(x, y), …]}."""
    if len(_CHARTS[0]) >= 4:
        raise CalcError("at most 4 charts per answer")
    kind = str(kind).lower()
    if kind not in CHART_KINDS:
        raise CalcError("chart kind must be one of: " + ", ".join(CHART_KINDS))
    labels = [l if isinstance(l, (int, float)) and not isinstance(l, bool) else str(l)[:40] for l in list(labels or [])][:1000]
    if not isinstance(series, dict):
        series = {"": series}
    if len(series) > 12:
        raise CalcError("at most 12 series in one chart")

    def val(v):
        if v is None:
            return None
        f = _num(v, "chart value")
        return None if f != f or f in (float("inf"), float("-inf")) else round(f, 6)
    out, total = [], 0
    for name, vals in series.items():
        vals = list(vals)[:2000]
        total += len(vals)
        if kind == "scatter":
            pts = []
            for p in vals:
                try:
                    pts.append([val(p[0]), val(p[1])])
                except (TypeError, IndexError):
                    raise CalcError("scatter points must be (x, y) pairs")
            out.append({"name": str(name)[:40], "points": pts})
        else:
            out.append({"name": str(name)[:40], "values": [val(v) for v in vals]})
    if total > 6000:
        raise CalcError("that chart has too many points (6,000 max)")
    _CHARTS[0].append({"kind": kind, "labels": labels, "series": out, "title": str(title)[:100],
                       "x": str(x)[:60], "y": str(y)[:60], "money": bool(money_axis)})
    return None


def set_precision(digits):
    """How many significant digits Decimal maths keeps (default 50)."""
    d = int(digits)
    if not 5 <= d <= 500:
        raise CalcError("precision must be between 5 and 500 digits")
    decimal.getcontext().prec = d
    return d


def today():
    return _dt.date.today()


_PRINT = [print]


# ── guarded versions of built-ins that could be made to eat the server ────────
def _range(*a):
    r = range(*a)
    if len(r) > MAX_RANGE:
        raise CalcError(f"range() is limited to {MAX_RANGE:,} numbers")
    return r


def _pow(a, b, m=None):
    _check_pow(a, b)
    return pow(a, b) if m is None else pow(a, b, m)


def _check_pow(a, b):
    if isinstance(a, int) and isinstance(b, int) and not isinstance(a, bool) and b > 0 and abs(a) > 1:
        if a.bit_length() * b > MAX_INT_BITS:
            raise CalcError("that power makes a number too big to work with")


def _factorial(n):
    if int(n) > 20000:
        raise CalcError("factorial() is limited to 20,000")
    return math.factorial(n)


def _comb(n, k):
    if int(n) > 100000:
        raise CalcError("comb() is limited to n ≤ 100,000")
    return math.comb(n, k)


def _perm(n, k=None):
    if int(n) > 100000:
        raise CalcError("perm() is limited to n ≤ 100,000")
    return math.perm(n, k)


def _width_guard(fn):
    def g(width, *a):
        if int(width) > 10000:
            raise CalcError("text width is limited to 10,000")
        return fn(width, *a)
    return g


class _Module:
    """A stand-in for an allowed module: only the listed names exist."""
    def __init__(self, name, names):
        self._name = name
        self._names = names


_MATH = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
_MATH.update(factorial=_factorial, comb=_comb, perm=_perm)
_STATS = {k: getattr(statistics, k) for k in (
    "mean", "fmean", "median", "median_low", "median_high", "mode", "multimode", "stdev", "pstdev", "variance",
    "pvariance", "geometric_mean", "harmonic_mean", "quantiles", "correlation", "covariance", "linear_regression")
    if hasattr(statistics, k)}
_DECIMAL = {"Decimal": decimal.Decimal, "ROUND_HALF_UP": decimal.ROUND_HALF_UP, "ROUND_HALF_EVEN": decimal.ROUND_HALF_EVEN,
            "ROUND_DOWN": decimal.ROUND_DOWN, "ROUND_UP": decimal.ROUND_UP, "ROUND_FLOOR": decimal.ROUND_FLOOR,
            "ROUND_CEILING": decimal.ROUND_CEILING}
_FRACTIONS = {"Fraction": fractions.Fraction}
_DATETIME = {"date": _dt.date, "datetime": _dt.datetime, "timedelta": _dt.timedelta}
_FIN = {"pmt": pmt, "fv": fv, "pv": pv, "nper": nper, "npv": npv, "irr": irr, "rate": rate, "mirr": mirr,
        "xnpv": xnpv, "xirr": xirr, "cagr": cagr, "effective_rate": effective_rate, "amortization": amortization}
_HELPERS = {"round_money": round_money, "money": money, "pct": pct, "solve": solve, "integrate": integrate,
            "table": table, "set_precision": set_precision, "today": today, "chart": chart}

MODULES = {
    "math": _MATH, "statistics": _STATS, "decimal": _DECIMAL, "fractions": _FRACTIONS, "datetime": _DATETIME,
    "fin": {**_FIN, **_HELPERS}, "numpy_financial": _FIN, "zcalc": {**_FIN, **_HELPERS},
}

_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict, "divmod": divmod, "enumerate": enumerate,
    "filter": filter, "float": float, "int": int, "len": len, "list": list, "map": map, "max": max, "min": min,
    "pow": _pow, "range": _range, "reversed": reversed, "round": round, "set": set, "frozenset": frozenset,
    "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "zip": zip, "isinstance": None, "hex": hex, "bin": bin,
    "oct": oct, "chr": chr, "ord": ord, "format": format, "repr": repr, "iter": iter, "next": next, "slice": slice,
    "complex": complex, "True": True, "False": False, "None": None,
    "ZeroDivisionError": ZeroDivisionError, "ValueError": ValueError, "OverflowError": OverflowError,
    "ArithmeticError": ArithmeticError, "TypeError": TypeError, "KeyError": KeyError, "IndexError": IndexError,
    "Exception": Exception, "StopIteration": StopIteration,
    "math": _Module("math", _MATH), "statistics": _Module("statistics", _STATS),
    "Decimal": decimal.Decimal, "Fraction": fractions.Fraction,
    "date": _dt.date, "datetime": _dt.datetime, "timedelta": _dt.timedelta,
    "pi": math.pi, "e": math.e, "inf": math.inf, "nan": math.nan,
    **_FIN, **_HELPERS,
}
_TYPES_FOR_ISINSTANCE = (int, float, str, list, dict, tuple, set, bool, complex, decimal.Decimal, fractions.Fraction,
                         _dt.date, _dt.datetime, _dt.timedelta, type(None))


def _isinstance(x, t):
    ts = t if isinstance(t, tuple) else (t,)
    if not all(tt in _TYPES_FOR_ISINSTANCE for tt in ts):
        raise CalcError("isinstance() only works with plain types like int, float, str, list")
    return isinstance(x, ts)


_BUILTINS["isinstance"] = _isinstance

# Methods and attributes allowed on values, per type.
_STR_SAFE = {"upper", "lower", "title", "capitalize", "strip", "lstrip", "rstrip", "split", "rsplit", "splitlines",
             "join", "replace", "startswith", "endswith", "find", "rfind", "index", "count", "isdigit", "isalpha",
             "isalnum", "isspace", "isupper", "islower", "partition", "rpartition", "casefold", "removeprefix",
             "removesuffix", "isnumeric", "isdecimal"}
_STR_WIDTH = {"ljust", "rjust", "center", "zfill"}
_ATTRS = {
    list: {"append", "extend", "insert", "pop", "remove", "index", "count", "sort", "reverse", "copy", "clear"},
    dict: {"get", "keys", "values", "items", "setdefault", "pop", "popitem", "update", "copy", "clear"},
    set: {"add", "remove", "discard", "union", "intersection", "difference", "symmetric_difference", "update",
          "copy", "pop", "issubset", "issuperset", "isdisjoint", "clear"},
    frozenset: {"union", "intersection", "difference", "issubset", "issuperset", "isdisjoint"},
    tuple: {"index", "count"},
    str: _STR_SAFE | _STR_WIDTH,
    int: {"bit_length", "real", "imag", "numerator", "denominator", "conjugate"},
    bool: {"real", "imag"},
    float: {"is_integer", "real", "imag", "conjugate", "as_integer_ratio"},
    complex: {"real", "imag", "conjugate"},
    decimal.Decimal: {"quantize", "sqrt", "ln", "log10", "exp", "normalize", "to_integral_value", "is_nan",
                      "is_zero", "is_signed", "copy_abs", "adjusted", "as_integer_ratio", "max", "min", "compare"},
    fractions.Fraction: {"numerator", "denominator", "limit_denominator", "as_integer_ratio"},
    _dt.date: {"year", "month", "day", "weekday", "isoweekday", "isoformat", "strftime", "replace", "toordinal",
               "isocalendar"},
    _dt.datetime: {"year", "month", "day", "hour", "minute", "second", "microsecond", "weekday", "isoweekday",
                   "isoformat", "strftime", "replace", "date", "time", "toordinal", "timestamp"},
    _dt.timedelta: {"days", "seconds", "microseconds", "total_seconds"},
}
# A few names allowed on the classes themselves (date.today(), dict.fromkeys(…)).
_CLASS_ATTRS = {
    _dt.date: {"today", "fromisoformat", "fromordinal"},
    _dt.datetime: {"now", "fromisoformat", "strptime", "combine"},
    dict: {"fromkeys"},
    decimal.Decimal: {"from_float"},
    fractions.Fraction: {"from_float", "from_decimal"},
    int: {"from_bytes"} - {"from_bytes"},
    float: {"fromhex"} - {"fromhex"},
}


def _size(x):
    try:
        return len(x)
    except Exception:
        return 0


class _Scope:
    def __init__(self, vars_, parent=None):
        self.vars = vars_
        self.parent = parent

    def get(self, name, node):
        s = self
        while s is not None:
            if name in s.vars:
                return s.vars[name]
            s = s.parent
        if name == "print":
            return _PRINT[0]
        if name in _BUILTINS:
            return _BUILTINS[name]
        if name in ("np", "numpy", "pd", "pandas", "sympy", "scipy"):
            raise CalcError(f"'{name}' isn't available in the calculation engine — use plain lists, loops, "
                            "math, statistics and the finance helpers instead", getattr(node, "lineno", None))
        raise CalcError(f"name '{name}' is not defined", getattr(node, "lineno", None))

    def set(self, name, value):
        self.vars[name] = value


class _Function:
    """A function the program defined (def or lambda)."""
    def __init__(self, interp, node, scope, name):
        self.interp, self.node, self.scope, self.name = interp, node, scope, name
        a = node.args
        if a.vararg or a.kwarg or a.posonlyargs:
            # *args / **kwargs are allowed but kept simple
            pass
        self.defaults = [interp.eval(d, scope) for d in a.defaults]
        self.kw_defaults = {arg.arg: interp.eval(d, scope) for arg, d in zip(a.kwonlyargs, a.kw_defaults) if d is not None}

    def __call__(self, *args, **kwargs):
        it = self.interp
        it.depth += 1
        if it.depth > MAX_DEPTH:
            it.depth -= 1
            raise CalcError("functions call each other too deeply (limit 60)", getattr(self.node, "lineno", None))
        try:
            a = self.node.args
            names = [x.arg for x in a.posonlyargs + a.args]
            local = {}
            if len(args) > len(names) and not a.vararg:
                raise CalcError(f"{self.name}() got too many values", self.node.lineno)
            for n, v in zip(names, args):
                local[n] = v
            if a.vararg:
                local[a.vararg.arg] = tuple(args[len(names):])
            extra = {}
            for k, v in kwargs.items():
                if k in names or k in [x.arg for x in a.kwonlyargs]:
                    if k in local:
                        raise CalcError(f"{self.name}() got '{k}' twice", self.node.lineno)
                    local[k] = v
                elif a.kwarg:
                    extra[k] = v
                else:
                    raise CalcError(f"{self.name}() has no setting called '{k}'", self.node.lineno)
            if a.kwarg:
                local[a.kwarg.arg] = extra
            first_default = len(names) - len(self.defaults)
            for i, n in enumerate(names):
                if n not in local:
                    if i >= first_default:
                        local[n] = self.defaults[i - first_default]
                    else:
                        raise CalcError(f"{self.name}() is missing '{n}'", self.node.lineno)
            for arg in a.kwonlyargs:
                if arg.arg not in local:
                    if arg.arg in self.kw_defaults:
                        local[arg.arg] = self.kw_defaults[arg.arg]
                    else:
                        raise CalcError(f"{self.name}() is missing '{arg.arg}'", self.node.lineno)
            scope = _Scope(local, self.scope)
            if isinstance(self.node, ast.Lambda):
                return it.eval(self.node.body, scope)
            try:
                it.exec_block(self.node.body, scope)
            except _Return as r:
                return r.value
            return None
        finally:
            it.depth -= 1


_BIN = {
    ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b, ast.FloorDiv: lambda a, b: a // b, ast.Mod: lambda a, b: a % b,
    ast.Pow: lambda a, b: a ** b, ast.BitAnd: lambda a, b: a & b, ast.BitOr: lambda a, b: a | b,
    ast.BitXor: lambda a, b: a ^ b, ast.LShift: lambda a, b: a << b, ast.RShift: lambda a, b: a >> b,
}
_CMP = {
    ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b,
    ast.Is: lambda a, b: a is b, ast.IsNot: lambda a, b: a is not b,
}
_UNARY = {ast.UAdd: lambda a: +a, ast.USub: lambda a: -a, ast.Not: lambda a: not a, ast.Invert: lambda a: ~a}
_SAFE_CONST = (int, float, complex, str, bool, type(None))


class Interp:
    def __init__(self):
        self.steps = 0
        self.depth = 0
        self.deadline = time.monotonic() + MAX_SECONDS
        self.out = []
        self.out_len = 0
        self.globals = _Scope({})
        self.line = None
        _PRINT[0] = self.print
        _CHARTS[0] = []

    # ── output ────────────────────────────────────────────────────────────
    def print(self, *args, sep=" ", end="\n", **_ignored):
        s = str(sep).join(str(a) for a in args) + str(end)
        if self.out_len + len(s) > MAX_OUTPUT:
            s = s[: max(0, MAX_OUTPUT - self.out_len)]
            self.out.append(s)
            self.out_len = MAX_OUTPUT
            raise CalcError(f"the program printed more than {MAX_OUTPUT:,} characters — print less")
        self.out.append(s)
        self.out_len += len(s)

    def tick(self, node):
        self.steps += 1
        if self.steps > MAX_STEPS:
            raise CalcError("the calculation took too many steps — simplify it", getattr(node, "lineno", None))
        if not self.steps & 4095 and time.monotonic() > self.deadline:
            raise CalcError(f"the calculation took longer than {MAX_SECONDS:.0f} seconds", getattr(node, "lineno", None))

    # ── statements ────────────────────────────────────────────────────────
    def exec_block(self, body, scope):
        for st in body:
            self.exec(st, scope)

    def exec(self, n, scope):
        self.tick(n)
        self.line = getattr(n, "lineno", self.line)
        t = type(n)
        if t is ast.Expr:
            self.eval(n.value, scope)
        elif t is ast.Assign:
            v = self.eval(n.value, scope)
            for tg in n.targets:
                self.assign(tg, v, scope)
        elif t is ast.AnnAssign:
            if n.value is not None:
                self.assign(n.target, self.eval(n.value, scope), scope)
        elif t is ast.AugAssign:
            cur = self.eval(self._as_load(n.target), scope)
            self.assign(n.target, self.binop(n.op, cur, self.eval(n.value, scope), n), scope)
        elif t is ast.If:
            self.exec_block(n.body if self.eval(n.test, scope) else n.orelse, scope)
        elif t is ast.For:
            it = self.eval(n.iter, scope)
            broke = False
            for v in self._iter(it, n):
                self.tick(n)
                self.assign(n.target, v, scope)
                try:
                    self.exec_block(n.body, scope)
                except _Break:
                    broke = True
                    break
                except _Continue:
                    continue
            if not broke:
                self.exec_block(n.orelse, scope)
        elif t is ast.While:
            broke = False
            while self.eval(n.test, scope):
                self.tick(n)
                try:
                    self.exec_block(n.body, scope)
                except _Break:
                    broke = True
                    break
                except _Continue:
                    continue
            if not broke:
                self.exec_block(n.orelse, scope)
        elif t is ast.Break:
            raise _Break()
        elif t is ast.Continue:
            raise _Continue()
        elif t is ast.Pass:
            pass
        elif t is ast.FunctionDef:
            if n.decorator_list:
                raise CalcError("decorators aren't supported", n.lineno)
            scope.set(n.name, _Function(self, n, scope, n.name))
        elif t is ast.Return:
            raise _Return(self.eval(n.value, scope) if n.value is not None else None)
        elif t is ast.Assert:
            if not self.eval(n.test, scope):
                msg = self.eval(n.msg, scope) if n.msg is not None else "a check in the program failed"
                raise CalcError(f"assert failed: {msg}", n.lineno)
        elif t is ast.Raise:
            msg = "the program stopped itself"
            if n.exc is not None:
                try:
                    e = self.eval(n.exc, scope)
                    msg = str(e) or msg
                except CalcError:
                    pass
            raise CalcError(msg, n.lineno)
        elif t is ast.Delete:
            for tg in n.targets:
                if isinstance(tg, ast.Name):
                    scope.vars.pop(tg.id, None)
                elif isinstance(tg, ast.Subscript):
                    obj = self.eval(tg.value, scope)
                    if type(obj) not in (list, dict):
                        raise CalcError("del only works on list items and dict keys", n.lineno)
                    del obj[self.eval(tg.slice, scope)]
                else:
                    raise CalcError("that kind of del isn't supported", n.lineno)
        elif t is ast.Try or t is getattr(ast, "TryStar", None):
            try:
                self.exec_block(n.body, scope)
            except (_Break, _Continue, _Return):
                raise
            except CalcError as ce:
                if not self._handle(n, ce, scope, calc_error=True):
                    raise
            except (ArithmeticError, ValueError, TypeError, KeyError, IndexError, StopIteration, decimal.DecimalException) as pe:
                if not self._handle(n, pe, scope):
                    raise
            else:
                self.exec_block(n.orelse, scope)
            finally:
                self.exec_block(n.finalbody, scope)
        elif t is ast.Import:
            for a in n.names:
                root = a.name.split(".")[0]
                if root not in MODULES:
                    raise CalcError(self._no_module(a.name), n.lineno)
                scope.set(a.asname or root, _Module(root, MODULES[root]))
        elif t is ast.ImportFrom:
            mod = (n.module or "").split(".")[0]
            if mod not in MODULES:
                raise CalcError(self._no_module(n.module or ""), n.lineno)
            for a in n.names:
                if a.name == "*":
                    for k, v in MODULES[mod].items():
                        scope.set(k, v)
                    continue
                if a.name not in MODULES[mod]:
                    raise CalcError(f"'{a.name}' isn't available from {mod}", n.lineno)
                scope.set(a.asname or a.name, MODULES[mod][a.name])
        elif t is ast.Global or t is ast.Nonlocal:
            raise CalcError("global/nonlocal aren't supported — return values from functions instead", n.lineno)
        else:
            raise CalcError(f"'{t.__name__}' isn't supported in the calculation engine", getattr(n, "lineno", None))

    def _no_module(self, name):
        return (f"'{name}' isn't available in the calculation engine. Available: math, statistics, decimal, fractions, "
                "datetime and the built-in finance helpers (pmt, fv, pv, npv, irr, rate, amortization, money, pct, table …)")

    def _handle(self, n, exc, scope, calc_error=False):
        for h in n.handlers:
            ok = h.type is None
            if not ok:
                types = self.eval(h.type, scope)
                types = types if isinstance(types, tuple) else (types,)
                for tt in types:
                    if not (isinstance(tt, type) and issubclass(tt, BaseException)):
                        raise CalcError("except needs an error type", h.lineno)
                if calc_error:
                    # Engine limits (time, size) can't be caught, only real maths errors.
                    if any(tt is Exception for tt in types) and not _is_limit(exc):
                        ok = True
                else:
                    ok = isinstance(exc, types)
            if ok:
                if h.name:
                    scope.set(h.name, str(exc))
                self.exec_block(h.body, scope)
                return True
        return False

    def _iter(self, it, node):
        if isinstance(it, (_Module,)) or callable(it) and not hasattr(it, "__next__") and not isinstance(it, (list, dict, str, tuple, set, frozenset, range)):
            raise CalcError("that can't be looped over", getattr(node, "lineno", None))
        try:
            return iter(it)
        except TypeError:
            raise CalcError(f"a {type(it).__name__} can't be looped over", getattr(node, "lineno", None))

    @staticmethod
    def _as_load(tg):
        return tg  # Name/Subscript/Attribute nodes evaluate fine whatever their ctx

    def assign(self, tg, v, scope):
        t = type(tg)
        if t is ast.Name:
            if tg.id.startswith("__"):
                raise CalcError("names starting with __ aren't allowed", tg.lineno)
            scope.set(tg.id, v)
        elif t in (ast.Tuple, ast.List):
            vals = list(self._iter(v, tg))
            star = [i for i, e in enumerate(tg.elts) if isinstance(e, ast.Starred)]
            if star:
                i = star[0]
                after = len(tg.elts) - i - 1
                if len(vals) < len(tg.elts) - 1:
                    raise CalcError("not enough values to unpack", tg.lineno)
                for e, x in zip(tg.elts[:i], vals[:i]):
                    self.assign(e, x, scope)
                self.assign(tg.elts[i].value, vals[i:len(vals) - after], scope)
                for e, x in zip(tg.elts[i + 1:], vals[len(vals) - after:]):
                    self.assign(e, x, scope)
                return
            if len(vals) != len(tg.elts):
                raise CalcError(f"expected {len(tg.elts)} values to unpack, got {len(vals)}", tg.lineno)
            for e, x in zip(tg.elts, vals):
                self.assign(e, x, scope)
        elif t is ast.Subscript:
            obj = self.eval(tg.value, scope)
            if type(obj) not in (list, dict):
                raise CalcError("only list items and dict keys can be assigned", tg.lineno)
            key = self.eval(tg.slice, scope)
            obj[key] = v
            if type(obj) is list and len(obj) > MAX_ITEMS:
                raise CalcError("that list got too big", tg.lineno)
        elif t is ast.Starred:
            self.assign(tg.value, list(self._iter(v, tg)), scope)
        else:
            raise CalcError("you can only assign to names, list items and dict keys", getattr(tg, "lineno", None))

    # ── expressions ───────────────────────────────────────────────────────
    def binop(self, op, a, b, node):
        t = type(op)
        if t is ast.Pow:
            _check_pow(a, b)
        elif t is ast.Mult:
            for x, y in ((a, b), (b, a)):
                if isinstance(x, (str, list, tuple)) and isinstance(y, int) and _size(x) * max(y, 0) > MAX_ITEMS:
                    raise CalcError("that makes a list or text too long", getattr(node, "lineno", None))
            if isinstance(a, int) and isinstance(b, int) and a.bit_length() + b.bit_length() > MAX_INT_BITS:
                raise CalcError("that number is too big to work with", getattr(node, "lineno", None))
        elif t is ast.LShift:
            if isinstance(b, int) and b > MAX_INT_BITS:
                raise CalcError("that shift makes a number too big", getattr(node, "lineno", None))
        elif t is ast.Add:
            if isinstance(a, (str, list, tuple)) and _size(a) + _size(b) > MAX_ITEMS:
                raise CalcError("that makes a list or text too long", getattr(node, "lineno", None))
        elif t is ast.Mod and isinstance(a, str):
            pass  # "%.2f" % x is fine: % formatting can't reach attributes
        f = _BIN.get(t)
        if not f:
            raise CalcError("that operator isn't supported", getattr(node, "lineno", None))
        return f(a, b)

    def eval(self, n, scope):
        self.tick(n)
        t = type(n)
        if t is ast.Constant:
            if not isinstance(n.value, _SAFE_CONST):
                raise CalcError("that kind of value isn't supported", getattr(n, "lineno", None))
            return n.value
        if t is ast.Name:
            return scope.get(n.id, n)
        if t is ast.BinOp:
            return self.binop(n.op, self.eval(n.left, scope), self.eval(n.right, scope), n)
        if t is ast.UnaryOp:
            return _UNARY[type(n.op)](self.eval(n.operand, scope))
        if t is ast.BoolOp:
            if isinstance(n.op, ast.And):
                v = True
                for x in n.values:
                    v = self.eval(x, scope)
                    if not v:
                        return v
                return v
            v = False
            for x in n.values:
                v = self.eval(x, scope)
                if v:
                    return v
            return v
        if t is ast.Compare:
            left = self.eval(n.left, scope)
            for op, rn in zip(n.ops, n.comparators):
                right = self.eval(rn, scope)
                if not _CMP[type(op)](left, right):
                    return False
                left = right
            return True
        if t is ast.IfExp:
            return self.eval(n.body if self.eval(n.test, scope) else n.orelse, scope)
        if t is ast.Call:
            return self.call(n, scope)
        if t is ast.Attribute:
            return self.attr(self.eval(n.value, scope), n.attr, n)
        if t is ast.Subscript:
            obj = self.eval(n.value, scope)
            if isinstance(obj, _Module) or callable(obj) and not isinstance(obj, (list, dict, str, tuple, range)):
                raise CalcError("that can't be indexed", n.lineno)
            return obj[self.eval(n.slice, scope)]
        if t is ast.Slice:
            return slice(*(self.eval(x, scope) if x is not None else None for x in (n.lower, n.upper, n.step)))
        if t is ast.List:
            return self._seq(n, scope)
        if t is ast.Tuple:
            return tuple(self._seq(n, scope))
        if t is ast.Set:
            return set(self._seq(n, scope))
        if t is ast.Dict:
            d = {}
            for k, v in zip(n.keys, n.values):
                if k is None:
                    src = self.eval(v, scope)
                    if not isinstance(src, dict):
                        raise CalcError("** needs a dict", n.lineno)
                    d.update(src)
                else:
                    d[self.eval(k, scope)] = self.eval(v, scope)
            return d
        if t in (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp):
            return self.comp(n, scope)
        if t is ast.JoinedStr:
            return "".join(str(self.eval(v, scope)) if not isinstance(v, ast.Constant) else str(v.value) for v in n.values)
        if t is ast.FormattedValue:
            v = self.eval(n.value, scope)
            if n.conversion == ord("r"):
                v = repr(v)
            elif n.conversion == ord("s"):
                v = str(v)
            elif n.conversion == ord("a"):
                v = ascii(v)
            spec = self.eval(n.format_spec, scope) if n.format_spec is not None else ""
            if len(spec) > 40 or re.search(r"\d{5,}", spec):
                raise CalcError("that number format is too wide", getattr(n, "lineno", None))
            return format(v, spec)
        if t is ast.Lambda:
            return _Function(self, n, scope, "lambda")
        if t is ast.NamedExpr:
            v = self.eval(n.value, scope)
            self.assign(n.target, v, scope)
            return v
        if t is ast.Starred:
            raise CalcError("* can only be used inside a list or a call", getattr(n, "lineno", None))
        raise CalcError(f"'{t.__name__}' isn't supported in the calculation engine", getattr(n, "lineno", None))

    def _seq(self, n, scope):
        out = []
        for e in n.elts:
            if isinstance(e, ast.Starred):
                out.extend(self._iter(self.eval(e.value, scope), e))
            else:
                out.append(self.eval(e, scope))
            if len(out) > MAX_ITEMS:
                raise CalcError("that list is too big", n.lineno)
        return out

    def comp(self, n, scope):
        inner = _Scope({}, scope)
        out_list, out_dict = [], {}

        def rec(i):
            if i == len(n.generators):
                if isinstance(n, ast.DictComp):
                    out_dict[self.eval(n.key, inner)] = self.eval(n.value, inner)
                else:
                    out_list.append(self.eval(n.elt, inner))
                    if len(out_list) > MAX_ITEMS:
                        raise CalcError("that list is too big", n.lineno)
                return
            g = n.generators[i]
            for v in self._iter(self.eval(g.iter, inner), g):
                self.tick(n)
                self.assign(g.target, v, inner)
                if all(self.eval(c, inner) for c in g.ifs):
                    rec(i + 1)
        rec(0)
        if isinstance(n, ast.DictComp):
            return out_dict
        if isinstance(n, ast.SetComp):
            return set(out_list)
        return out_list if isinstance(n, ast.ListComp) else iter(out_list)

    def attr(self, obj, name, node):
        if name.startswith("_"):
            raise CalcError("names starting with _ aren't allowed", node.lineno)
        if isinstance(obj, _Module):
            if name not in obj._names:
                raise CalcError(f"'{obj._name}.{name}' isn't available", node.lineno)
            return obj._names[name]
        if isinstance(obj, type):
            if name in _CLASS_ATTRS.get(obj, ()):
                return getattr(obj, name)
            raise CalcError(f"'{obj.__name__}.{name}' isn't available", node.lineno)
        allowed = _ATTRS.get(type(obj))
        if not allowed or name not in allowed:
            raise CalcError(f"'.{name}' isn't available on a {type(obj).__name__}", node.lineno)
        v = getattr(obj, name)
        if type(obj) is str and name in _STR_WIDTH:
            return _width_guard(v)
        return v

    def call(self, n, scope):
        f = self.eval(n.func, scope)
        args = []
        for a in n.args:
            if isinstance(a, ast.Starred):
                args.extend(self._iter(self.eval(a.value, scope), a))
            else:
                args.append(self.eval(a, scope))
        kwargs = {}
        for k in n.keywords:
            if k.arg is None:
                src = self.eval(k.value, scope)
                if not isinstance(src, dict):
                    raise CalcError("** needs a dict", n.lineno)
                kwargs.update(src)
            else:
                kwargs[k.arg] = self.eval(k.value, scope)
        if isinstance(f, _Module) or not callable(f):
            raise CalcError("that can't be called", n.lineno)
        if f == self.print or f in _SAFE_CALLABLES or isinstance(f, _Function) or _bound_ok(f):
            return f(*args, **kwargs)
        raise CalcError("that can't be called", n.lineno)

    def run(self, code):
        tree = ast.parse(code, mode="exec")
        self.exec_block(tree.body, self.globals)


def _is_limit(exc):
    s = str(exc)
    return any(w in s for w in ("too many steps", "longer than", "too big", "too long", "printed more than", "too deeply"))


_SAFE_CALLABLES = set()


def _collect_safe():
    for v in list(_BUILTINS.values()) + [x for m in MODULES.values() for x in m.values()]:
        try:
            if callable(v):
                _SAFE_CALLABLES.add(v)
        except TypeError:
            pass
    _SAFE_CALLABLES.add(print)


_collect_safe()


def _bound_ok(f):
    """A method we handed out via attr() (bound to an allowed value), or a guard wrapper."""
    owner = getattr(f, "__self__", None)
    name = getattr(f, "__name__", "")
    if owner is not None and not isinstance(owner, type(math)):
        if isinstance(owner, type):
            return name in _CLASS_ATTRS.get(owner, ())
        allowed = _ATTRS.get(type(owner))
        return bool(allowed and name in allowed)
    return getattr(f, "__qualname__", "").startswith("_width_guard.")


def _tidy(out):
    # "-0.00" → "0.00": a balance that is paid off shouldn't look negative.
    return re.sub(r"(?<![\w.])-(0(?:\.0+)?)(?![\d.])", r"\1", out)


def evaluate(code: str) -> dict:
    """Run a program right here (used inside the worker process)."""
    code = (code or "").replace("\r\n", "\n")
    code = re.sub(r"^\s*```[a-zA-Z]*\s*\n|\n?```\s*$", "", code.strip())
    if len(code) > MAX_CODE:
        return {"ok": False, "output": "", "error": f"the program is longer than {MAX_CODE:,} characters", "line": None}
    decimal.setcontext(decimal.Context(prec=50, rounding=decimal.ROUND_HALF_EVEN, Emax=999999, Emin=-999999))
    it = Interp()
    try:
        it.run(code)
        return {"ok": True, "output": _tidy("".join(it.out)), "error": "", "line": None, "steps": it.steps,
                "charts": _CHARTS[0]}
    except SyntaxError as e:
        return {"ok": False, "output": _tidy("".join(it.out)), "error": f"SyntaxError: {e.msg}", "line": e.lineno}
    except CalcError as e:
        return {"ok": False, "output": _tidy("".join(it.out)), "error": str(e), "line": e.line}
    except (_Break, _Continue):
        return {"ok": False, "output": _tidy("".join(it.out)), "error": "break/continue outside a loop", "line": None}
    except _Return:
        return {"ok": False, "output": _tidy("".join(it.out)), "error": "return outside a function", "line": None}
    except RecursionError:
        return {"ok": False, "output": _tidy("".join(it.out)), "error": "the program is nested too deeply", "line": None}
    except MemoryError:
        return {"ok": False, "output": "", "error": "the calculation needed too much memory", "line": None}
    except Exception as e:
        return {"ok": False, "output": _tidy("".join(it.out)), "error": f"{type(e).__name__}: {e}"[:600], "line": it.line}


async def run(code: str) -> dict:
    """Run a program in a separate, limited Python process. Never raises."""
    t0 = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-I", os.path.abspath(__file__), "--worker",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            preexec_fn=_limits if os.name == "posix" else None)
    except Exception as e:
        return {"ok": False, "output": "", "error": f"the calculation engine couldn't start ({type(e).__name__})", "line": None}
    try:
        out, err = await asyncio.wait_for(proc.communicate((code or "").encode("utf-8")), timeout=WALL_SECONDS)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        return {"ok": False, "output": "", "error": f"the calculation took longer than {WALL_SECONDS:.0f} seconds", "line": None}
    try:
        res = json.loads(out.decode("utf-8", "replace").strip().splitlines()[-1])
    except Exception:
        why = "it ran out of memory" if proc.returncode in (-9, 137) or b"MemoryError" in err else "it stopped unexpectedly"
        res = {"ok": False, "output": "", "error": f"the calculation failed: {why}", "line": None}
    res["ms"] = int((time.monotonic() - t0) * 1000)
    return res


def _limits():
    import resource
    for lim, val in ((resource.RLIMIT_CPU, (12, 13)), (resource.RLIMIT_AS, (768 * 2**20, 768 * 2**20)),
                     (resource.RLIMIT_FSIZE, (0, 0)), (resource.RLIMIT_NOFILE, (16, 16))):
        try:
            resource.setrlimit(lim, val)
        except (ValueError, OSError):
            pass


# ── what the AI is told about the engine ───────────────────────────────────────
GUIDE = """THE ZELPOPHAI CALCULATION ENGINE — write a program in plain Python that prints every result.
It runs on Zelpophai's server in a safe sandbox. What works:
- Numbers, strings, lists, dicts, sets, tuples; for/while loops; if/elif/else; def functions (with defaults);
  lambda; list/dict comprehensions; f-strings (e.g. f"{x:,.2f}"); try/except; print().
- Built-ins: abs all any bool dict divmod enumerate filter float int len list map max min pow range reversed round
  set sorted str sum tuple zip isinstance format.
- import math, import statistics, from decimal import Decimal, from fractions import Fraction,
  from datetime import date, datetime, timedelta (date.today() works).
- Finance helpers, already available without import: pmt(rate, nper, pv, fv=0, when=0) (Excel sign convention:
  a loan of +P gives a negative payment), fv, pv, nper, rate, npv(rate, flows) (first flow at time 0),
  irr(flows), mirr, xnpv(rate, flows, dates), xirr(flows, dates), cagr(start, end, years), effective_rate(nominal, n),
  amortization(principal, annual_rate, years, per_year=12) → list of dict rows.
- Other helpers: money(x, places=2) → '1,234.57' (bank rounding, no '-0.00'); pct(0.0725) → '7.25%';
  round_money(x, 2) (halves round up); solve(f, lo, hi) → root; integrate(f, a, b);
  table(rows, headers) prints a neat table; set_precision(digits) for Decimal (default 50 digits).
- Charts: chart(kind, labels, series, title="", x="", y="", money_axis=False) draws a chart under the answer.
  kind: "line", "bar", "area", "stacked", "pie", "doughnut" or "scatter". labels = x values; series = a list of
  numbers, or {"Name": [numbers], …} for several lines/bars (same length as labels). Up to 4 charts. Use one
  whenever the user asks for a chart/graph/plot, and for schedules or growth over time where a picture helps.
NOT available: numpy, pandas, scipy, sympy, matplotlib, files, internet, classes. Use lists and loops instead.
Rules: keep full precision while working and round only when printing; print every result the user asked for,
clearly labelled, one per line (e.g. print("Monthly payment:", money(p))); for a year-by-year schedule print a table.
Put the inputs at the top as named variables with a comment saying where each number came from."""


if __name__ == "__main__" and "--worker" in sys.argv:
    sys.setrecursionlimit(3000)
    src = sys.stdin.read()
    res = evaluate(src)
    sys.stdout.write("\n" + json.dumps(res) + "\n")
    sys.stdout.flush()
