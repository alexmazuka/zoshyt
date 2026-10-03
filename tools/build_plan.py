#!/usr/bin/env python3
"""Збирає data/gXX/plan.json з календаря (data/calendar.json), розкладу (data/gXX/subjects.json → timetable)
та планів предметів (data/gXX/plan/<subj>.json). Кожному уроку — слот (тиждень, день), id = <subj>-w<WW>-d<D>.

Запуск:
  python3 tools/build_plan.py g05            зібрати plan.json, показати підсумок
  python3 tools/build_plan.py g05 -v         + список уроків без файлів
  python3 tools/build_plan.py g05 --slots    лише порахувати слоти за розкладом (до написання плану)
  python3 tools/build_plan.py g05 --missing-json   надрукувати JSON {subject: [id без файлу, ...]}
Код виходу 1, якщо кількість тем у плані не дорівнює кількості слотів.
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def slots_for(grade):
    cal = json.load(open(f"{ROOT}/data/calendar.json", encoding="utf-8"))
    subj = json.load(open(f"{ROOT}/data/{grade}/subjects.json", encoding="utf-8"))
    timetable = subj["timetable"]
    slots = {}
    for w in cal["weeks"]:
        for d in w["days"]:
            for i, s in enumerate(timetable.get(str(d), [])):
                if "|" in s:
                    a, b = s.split("|")
                    s = a if w["week"] % 2 == 1 else b
                if s in ("", "-"):
                    continue
                slots.setdefault(s, []).append((w["week"], d, i + 1))
    return subj, slots


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not args:
        print(__doc__); sys.exit(2)
    grade = args[0] if args[0].startswith("g") else f"g{int(args[0]):02d}"
    subj, slots = slots_for(grade)
    ids = [s["id"] for s in subj["subjects"]]
    unknown = sorted(set(slots) - set(ids))
    if unknown:
        print(f"ПОМИЛКА: у розкладі є предмети, яких немає в subjects: {unknown}"); sys.exit(1)

    if "--slots" in sys.argv:
        for s in subj["subjects"]:
            print(f"{s['id']:8s} {s['name']:40s} слотів: {len(slots.get(s['id'], []))}")
        print("Разом:", sum(len(v) for v in slots.values())); return

    lessons, errors = [], []
    for s in subj["subjects"]:
        sid = s["id"]
        path = f"{ROOT}/data/{grade}/plan/{sid}.json"
        if not os.path.exists(path):
            errors.append(f"{sid}: немає файлу plan/{sid}.json"); continue
        plan = json.load(open(path, encoding="utf-8"))
        flat = [(sec["name"], l) for sec in plan["sections"] for l in sec["lessons"]]
        have, need = len(flat), len(slots.get(sid, []))
        if have != need:
            errors.append(f"{sid}: у плані {have} тем, а слотів у розкладі {need} (різниця {have - need:+d})")
        for n, ((week, day, pos), (secname, l)) in enumerate(zip(slots.get(sid, []), flat), start=1):
            lid = f"{sid}-w{week:02d}-d{day}"
            rel = f"data/{grade}/lessons/{sid}/{lid}.json"
            lessons.append({
                "id": lid, "subject": sid, "week": week, "day": day, "pos": pos, "n": n,
                "section": secname, "title": l["t"], "brief": l.get("b", ""),
                "file": rel, "exists": os.path.exists(f"{ROOT}/{rel}"),
            })
    if errors:
        print("ПОМИЛКИ:\n  " + "\n  ".join(errors)); sys.exit(1)

    lessons.sort(key=lambda x: (x["week"], x["day"], x["pos"]))
    out = {"grade": grade, "generated": datetime.date.today().isoformat(), "total": len(lessons),
           "written": sum(1 for l in lessons if l["exists"]), "lessons": lessons}
    json.dump(out, open(f"{ROOT}/data/{grade}/plan.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)

    if "--missing-json" in sys.argv:
        miss = {}
        for l in sorted(lessons, key=lambda x: (x["subject"], x["n"])):
            if not l["exists"]:
                miss.setdefault(l["subject"], []).append(l["id"])
        print(json.dumps(miss, ensure_ascii=False)); return

    print(f"{grade}/plan.json: {out['total']} уроків, готових файлів: {out['written']}")
    if "-v" in sys.argv:
        missing = [l["id"] for l in lessons if not l["exists"]]
        if missing:
            print("Немає файлів:", " ".join(missing))


if __name__ == "__main__":
    main()
