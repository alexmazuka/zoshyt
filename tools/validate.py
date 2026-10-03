#!/usr/bin/env python3
"""Перевіряє уроки на відповідність схемі AUTHORING.md (v2).

Запуск:
  python3 tools/validate.py g05                       усі уроки класу
  python3 tools/validate.py g05 data/g05/lessons/math/math-w03-d1.json [...]
  python3 tools/validate.py g05 --net [файли]         + перевірка, що зображення відкриваються (HTTP 200)
Код виходу 1, якщо є помилки.
"""
import json, os, re, sys, glob, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEORY = {"p", "rule", "example", "list", "steps", "table", "reading", "vocab", "dialogue", "tip", "image", "figure"}
AUTO = {"choice", "multi", "truefalse", "fill", "number", "input", "match", "order", "sort"}
MANUAL = {"text", "checklist", "speak"}
PRACTICAL = {"pe", "art", "design", "music"}
MATH = {"math", "alg", "geom"}
LICENSE_OK = re.compile(r"(public domain|суспільне надбання|cc0|cc[ -]by(?:[ -]sa)?[ -]?\d)", re.I)
CYR_ABBR = re.compile(r"(?<![А-ЯҐЄІЇа-яґєії'’A-Za-z])([А-ЯҐЄІЇ]{2,7})(?![А-ЯҐЄІЇа-яґєії'’A-Za-z])")
LAT_ABBR = re.compile(r"(?<![A-Za-z0-9])([A-Z]{2,7}[0-9]{0,2})(?![A-Za-z0-9])")
ROMAN = re.compile(r"^[IVXLCDM]+$")
CHEM_FORMULA = re.compile(r"^(?=.*\d)(?:[HBCNOFPSKVYIWU]\d{0,2})+$")  # CO2, NH3, HNO3 — формули, а не скорочення
CYR_ROMAN = re.compile(r"^[ХІVLСDМ]+$")

OPS = {'·': '*', '×': '*', '*': '*', ':': '/', '÷': '/', '+': '+', '−': '-', '–': '-', '-': '-'}
NUM = r"\d[\d ]*(?:[.,]\d+)?"
EXPR = re.compile(rf"(?<![\w{{])(\(?\s*{NUM}(?:\s*[·×*:÷+−–-]\s*\(?\s*{NUM}\s*\)?)+)\s*(?==|\?|$|\.|,|;)")


def _py(expr):
    e = expr
    for k, v in OPS.items():
        e = e.replace(k, f" {v} ")
    e = re.sub(r"(\d) (\d)", r"\1\2", e)
    e = re.sub(r"(\d) (\d)", r"\1\2", e).replace(",", ".")
    return e if re.fullmatch(r"[\d\s.+\-*/()]+", e) else None


def _eval(expr):
    e = _py(expr)
    if e is None:
        return None
    try:
        return eval(e, {"__builtins__": {}})
    except Exception:
        return None


def _num(s):
    try:
        return float(str(s).replace(" ", "").replace(",", "."))
    except Exception:
        return None


def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings(x)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("svg", "src", "page", "license", "credit", "lang", "type", "id", "subject"):
                continue
            yield from strings(v)


def check_svg(svg, where, errs):
    if not isinstance(svg, str) or not svg.strip().startswith("<svg"):
        errs.append(f"{where}: svg має починатися з <svg"); return
    if "viewBox" not in svg:
        errs.append(f"{where}: у svg потрібен viewBox")
    low = svg.lower()
    for bad in ("<script", "javascript:", "<foreignobject", "<iframe", "<image", "href=\"http", "href='http"):
        if bad in low:
            errs.append(f"{where}: у svg заборонено {bad!r}")
    if re.search(r"\son[a-z]+\s*=", low):
        errs.append(f"{where}: у svg заборонені обробники подій (on...=)")
    if not low.rstrip().endswith("</svg>"):
        errs.append(f"{where}: svg має закінчуватися </svg>")
    if len(svg) > 12000:
        errs.append(f"{where}: svg завеликий ({len(svg)} символів, максимум 12000)")


def check_image(b, where, errs, images):
    if b.get("emoji"):
        if not b.get("caption"):
            errs.append(f"{where}: image(emoji) без caption")
        return
    src = b.get("src", "")
    if not isinstance(src, str) or not src.startswith("https://upload.wikimedia.org/"):
        errs.append(f"{where}: image.src має бути з https://upload.wikimedia.org/ (Wikimedia Commons)"); return
    for k in ("alt", "caption", "credit", "license", "page"):
        if not isinstance(b.get(k), str) or not b.get(k).strip():
            errs.append(f"{where}: image без {k}")
    if b.get("license") and not LICENSE_OK.search(b["license"]):
        errs.append(f"{where}: ліцензія {b['license']!r} не підходить (потрібно Public domain / CC0 / CC BY / CC BY-SA)")
    if b.get("page") and not str(b["page"]).startswith("https://commons.wikimedia.org/wiki/File:"):
        errs.append(f"{where}: page має бути посиланням https://commons.wikimedia.org/wiki/File:...")
    images.append((where, src))


def check_ex(ex, where, errs, images):
    t = ex.get("type")
    if t not in AUTO | MANUAL:
        errs.append(f"{where}: невідомий type={t!r}"); return
    if t != "truefalse" and (not isinstance(ex.get("q"), str) or not ex.get("q", "").strip()):
        errs.append(f"{where}: немає q")
    if "figure" in ex:
        check_svg(ex["figure"], f"{where}.figure", errs)
    if "image" in ex:
        if isinstance(ex["image"], dict):
            check_image(ex["image"], f"{where}.image", errs, images)
        else:
            errs.append(f"{where}: image у вправі має бути об'єктом")
    if t in ("choice", "multi"):
        opts = ex.get("options")
        if not isinstance(opts, list) or len(opts) < 2:
            errs.append(f"{where}: options має бути списком ≥2"); return
        if len(set(map(str, opts))) != len(opts):
            errs.append(f"{where}: повторювані options")
        a = ex.get("answer")
        if t == "choice":
            if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < len(opts):
                errs.append(f"{where}: answer має бути індексом 0..{len(opts) - 1}")
        else:
            if not isinstance(a, list) or not a or any((not isinstance(i, int)) or i < 0 or i >= len(opts) for i in a):
                errs.append(f"{where}: answer має бути списком індексів")
            elif len(set(a)) != len(a):
                errs.append(f"{where}: повтори в answer")
    elif t == "truefalse":
        items = ex.get("items")
        if not isinstance(items, list) or len(items) < 2:
            errs.append(f"{where}: items ≥2"); return
        for i, it in enumerate(items):
            if not isinstance(it, dict) or not isinstance(it.get("text"), str) or not isinstance(it.get("answer"), bool):
                errs.append(f"{where}: items[{i}] має мати text і answer:true/false")
    elif t == "fill":
        txt = ex.get("text")
        if not isinstance(txt, str):
            errs.append(f"{where}: fill потребує text"); return
        blanks = re.findall(r"\{([^{}]*)\}", txt)
        if not blanks:
            errs.append(f"{where}: у text немає пропусків {{...}}")
        for b in blanks:
            if not b.strip() or any(not v.strip() for v in b.split("|")):
                errs.append(f"{where}: порожній варіант у {{{b}}}")
        if txt.count("{") != txt.count("}"):
            errs.append(f"{where}: незбалансовані дужки")
    elif t == "number":
        a = ex.get("answer")
        if isinstance(a, str):
            if _num(a) is None:
                errs.append(f"{where}: answer не число")
        elif not isinstance(a, (int, float)) or isinstance(a, bool):
            errs.append(f"{where}: answer має бути числом")
    elif t == "input":
        a = ex.get("answer")
        if isinstance(a, str):
            a = [a]
        if not isinstance(a, list) or not a or any(not isinstance(v, str) or not v.strip() for v in a):
            errs.append(f"{where}: answer — список рядків")
    elif t == "match":
        pairs = ex.get("pairs")
        if not isinstance(pairs, list) or len(pairs) < 2 or any(not isinstance(p, list) or len(p) != 2 for p in pairs):
            errs.append(f"{where}: pairs — список пар [ліво, право] (≥2)"); return
        if len(set(str(p[1]) for p in pairs)) != len(pairs):
            errs.append(f"{where}: праві частини пар мають бути різними")
        if len(set(str(p[0]) for p in pairs)) != len(pairs):
            errs.append(f"{where}: ліві частини пар мають бути різними")
    elif t == "order":
        items = ex.get("items")
        if not isinstance(items, list) or len(items) < 3:
            errs.append(f"{where}: order потребує items ≥3")
        elif len(set(map(str, items))) != len(items):
            errs.append(f"{where}: повторювані items")
    elif t == "sort":
        g = ex.get("groups")
        if not isinstance(g, dict) or len(g) < 2:
            errs.append(f"{where}: groups — об'єкт з ≥2 групами"); return
        allitems = []
        for k, v in g.items():
            if not isinstance(v, list) or not v:
                errs.append(f"{where}: група {k!r} порожня")
            else:
                allitems += [str(x) for x in v]
        if len(set(allitems)) != len(allitems):
            errs.append(f"{where}: елемент повторюється у кількох групах")
    elif t == "text":
        if not isinstance(ex.get("sample"), str) or len(ex.get("sample", "")) < 10:
            errs.append(f"{where}: text потребує sample (зразок ≥10 символів)")
    elif t == "checklist":
        if not isinstance(ex.get("items"), list) or len(ex["items"]) < 2:
            errs.append(f"{where}: checklist потребує items ≥2")
    elif t == "speak":
        if not isinstance(ex.get("text"), str) or not ex["text"].strip():
            errs.append(f"{where}: speak потребує text")


def check_theory(b, where, errs, images):
    t = b.get("type")
    if t not in THEORY:
        errs.append(f"{where}: невідомий type блоку {t!r}"); return
    if t == "image":
        check_image(b, where, errs, images); return
    if t == "figure":
        check_svg(b.get("svg"), where, errs)
        if not b.get("caption") or not b.get("alt"):
            errs.append(f"{where}: figure потребує caption і alt")
        return
    need = {"p": ["text"], "rule": ["text"], "example": ["text"], "list": ["items"], "steps": ["items"],
            "table": ["head", "rows"], "reading": ["title", "text"], "vocab": ["items"], "dialogue": ["lines"],
            "tip": ["text"]}[t]
    for k in need:
        if k not in b or not b[k]:
            errs.append(f"{where}: блок {t} без {k}")
    if t == "table":
        w = len(b.get("head", []))
        for i, r in enumerate(b.get("rows", [])):
            if not isinstance(r, list) or len(r) != w:
                errs.append(f"{where}: рядок таблиці {i} має {len(r) if isinstance(r, list) else '?'} комірок, а head — {w}")
    if t == "vocab":
        for i, it in enumerate(b.get("items", [])):
            if not isinstance(it, dict) or not it.get("en") or not it.get("uk"):
                errs.append(f"{where}: vocab.items[{i}] потребує en і uk")
    if t == "dialogue":
        for i, it in enumerate(b.get("lines", [])):
            if not isinstance(it, dict) or not it.get("who") or not it.get("text"):
                errs.append(f"{where}: dialogue.lines[{i}] потребує who і text")


def check_abbr(d, errs, warns):
    terms = d.get("terms") or {}
    caps = set(d.get("caps") or [])
    if not isinstance(terms, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not v.strip() for k, v in terms.items()):
        errs.append("terms має бути об'єктом {\"СКОРОЧЕННЯ\": \"повна назва\"}"); return
    texts = []
    for k in ("title", "goal", "theory", "exercises", "homework", "reflection"):
        texts += list(strings(d.get(k)))
    blob = re.sub(r"[*_`]", "", "\n".join(texts))
    seen_c, seen_l = set(), set()
    for m in CYR_ABBR.finditer(blob):
        tok = m.group(1)
        if CYR_ROMAN.match(tok):
            errs.append(f"римські цифри «{tok}» набрано кирилицею — пиши латиницею (XIX, XX)"); continue
        if tok not in terms and tok not in caps and tok not in seen_c:
            seen_c.add(tok)
            errs.append(f"скорочення «{tok}» не розшифроване: додай у terms і розгорни при першій згадці"
                        f" (або не пиши слова великими літерами — для наголосу є **жирний**)")
    if d.get("subject") != "eng":
        for m in LAT_ABBR.finditer(blob):
            tok = m.group(1)
            if ROMAN.match(tok) or CHEM_FORMULA.match(tok) or tok in terms or tok in caps or tok in seen_l:
                continue
            seen_l.add(tok)
            warns.append(f"латинське скорочення «{tok}» без розшифровки в terms")


def check_math(d, errs):
    for kind in ("exercises", "homework"):
        for i, ex in enumerate(d.get(kind) or []):
            t = ex.get("type")
            if t == "number":
                q = ex.get("q", "")
                exprs = [x for x in EXPR.findall(q.replace("=", " = ")) if re.search(r"[·×*:÷+−–-]", x)]
                if len(exprs) == 1 and not re.search(r"остач|розряд|цифр|периметр|площ|швидк|км/год|задач|рівнян|x|х", q, re.I):
                    val, a = _eval(exprs[0]), _num(ex.get("answer"))
                    if val is not None and a is not None and abs(val - a) > 1e-6:
                        errs.append(f"{kind}[{i}] number: «{exprs[0].strip()}» = {val:g}, а answer = {a:g}")
            if t == "fill":
                for m in re.finditer(rf"({NUM}(?:\s*[·×*:÷+−–-]\s*{NUM})+)\s*=\s*\{{([^{{}}|]+)(?:\|[^{{}}]*)?\}}", ex.get("text", "")):
                    val, a = _eval(m.group(1)), _num(m.group(2))
                    if val is not None and a is not None and abs(val - a) > 1e-6:
                        errs.append(f"{kind}[{i}] fill: «{m.group(1).strip()}» = {val:g}, а в пропуску {a:g}")


def validate(path, grade, plan, net):
    errs, warns, images = [], [], []
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        return [f"{path}: невалідний JSON: {e}"], []
    lid = d.get("id")
    if lid != os.path.basename(path)[:-5]:
        errs.append(f"id={lid!r} не збігається з іменем файлу")
    if lid in plan:
        if d.get("subject") != plan[lid]["subject"]:
            errs.append(f"subject={d.get('subject')!r}, у плані {plan[lid]['subject']!r}")
    else:
        errs.append(f"id {lid!r} відсутній у data/{grade}/plan.json")
    for k in ("title", "goal"):
        if not isinstance(d.get(k), str) or len(d.get(k, "")) < 5:
            errs.append(f"немає {k}")
    m = d.get("minutes")
    if not isinstance(m, int) or not 10 <= m <= 90:
        errs.append("minutes має бути цілим 10..90")
    th = d.get("theory")
    if not isinstance(th, list) or len(th) < 2:
        errs.append("theory: потрібно ≥2 блоки")
    else:
        for i, b in enumerate(th):
            check_theory(b, f"theory[{i}]", errs, images)
    subj = d.get("subject")
    ex = d.get("exercises")
    if not isinstance(ex, list) or len(ex) < 4:
        errs.append("exercises: потрібно ≥4 (краще 5–8)")
    else:
        for i, e in enumerate(ex):
            check_ex(e, f"exercises[{i}]", errs, images)
        auto = sum(1 for e in ex if e.get("type") in AUTO)
        need = 2 if subj in PRACTICAL else 3
        if auto < need:
            errs.append(f"exercises: автоматичних вправ {auto}, потрібно ≥{need}")
    hw = d.get("homework")
    if not isinstance(hw, list) or len(hw) < 2:
        errs.append("homework: потрібно ≥2 завдання")
    else:
        for i, e in enumerate(hw):
            check_ex(e, f"homework[{i}]", errs, images)
        types = {e.get("type") for e in hw}
        if not (types & AUTO):
            errs.append("homework: потрібне ≥1 завдання з автоперевіркою")
        if subj in PRACTICAL or grade in ("g01", "g02"):
            if not (types & {"text", "checklist", "speak"}):
                errs.append("homework: потрібне text, checklist або speak")
        elif "text" not in types:
            errs.append("homework: потрібне ≥1 письмове завдання type=text")
    check_abbr(d, errs, warns)
    if subj in MATH:
        check_math(d, errs)
    if subj == "eng":
        alltypes = {e.get("type") for e in (ex or []) + (hw or [])}
        if "speak" not in alltypes:
            warns.append("eng: бажано мати вправу speak")
    size = os.path.getsize(path)
    if size < 2500:
        warns.append(f"файл малий ({size} байт) — можливо, урок закороткий")
    if net:
        for where, src in images:
            try:
                req = urllib.request.Request(src, method="HEAD", headers={"User-Agent": "zoshyt-validator/1.0 (info@nexteducationai.org)"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    ct = r.headers.get("Content-Type", "")
                    if r.status != 200 or not ct.startswith("image/"):
                        errs.append(f"{where}: зображення відповідає {r.status} {ct}")
            except Exception as e:
                errs.append(f"{where}: зображення не відкривається ({e})")
    return [f"{path}: {e}" for e in errs], [f"{path}: {w}" for w in warns]


def main():
    args = sys.argv[1:]
    net = "--net" in args
    args = [a for a in args if a != "--net"]
    if not args:
        print(__doc__); sys.exit(2)
    grade = args[0] if args[0].startswith("g") else f"g{int(args[0]):02d}"
    plan = {l["id"]: l for l in json.load(open(f"{ROOT}/data/{grade}/plan.json", encoding="utf-8"))["lessons"]}
    targets = args[1:] or [f"{ROOT}/data/{grade}/lessons"]
    files = []
    for a in targets:
        files += sorted(glob.glob(f"{a}/**/*.json", recursive=True)) if os.path.isdir(a) else [a]
    E, W = [], []
    for f in files:
        e, w = validate(f, grade, plan, net)
        E += e; W += w
    for w in W:
        print("УВАГА:", w)
    for e in E:
        print("ПОМИЛКА:", e)
    print(f"Перевірено файлів: {len(files)}; помилок: {len(E)}; попереджень: {len(W)}")
    sys.exit(1 if E else 0)


if __name__ == "__main__":
    main()
