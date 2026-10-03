#!/usr/bin/env python3
"""Переносить готові уроки історії 10 класу з ../istoriya-10klas у data/g10 за порядковим номером теми.
ukr → istu (Історія України), world → vsist (Всесвітня історія). Запускати після `build_plan.py g10`.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(os.path.dirname(ROOT), "istoriya-10klas")
MAP = {"ukr": "istu", "world": "vsist"}

old = json.load(open(f"{OLD}/data/plan.json", encoding="utf-8"))["lessons"]
new = json.load(open(f"{ROOT}/data/g10/plan.json", encoding="utf-8"))["lessons"]
by_n = {(l["subject"], l["n"]): l for l in new}
moved, problems = 0, []
for l in sorted(old, key=lambda x: (x["subject"], x["n"])):
    if not l.get("exists"):
        continue
    ns = MAP[l["subject"]]
    target = by_n.get((ns, l["n"]))
    if not target:
        problems.append(f"{l['id']}: у новому плані немає {ns} №{l['n']}"); continue
    if target["title"].strip() != l["title"].strip():
        problems.append(f"{l['id']} → {target['id']}: різні теми «{l['title']}» / «{target['title']}»")
        continue
    d = json.load(open(f"{OLD}/{l['file']}", encoding="utf-8"))
    d["id"], d["subject"] = target["id"], ns
    os.makedirs(f"{ROOT}/data/g10/lessons/{ns}", exist_ok=True)
    json.dump(d, open(f"{ROOT}/data/g10/lessons/{ns}/{target['id']}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    moved += 1
print(f"Перенесено уроків: {moved}")
for p in problems:
    print("ПРОБЛЕМА:", p)
sys.exit(1 if problems else 0)
