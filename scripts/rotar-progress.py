#!/usr/bin/env python3
"""Rota PROGRESS.md: deja las últimas N entradas fechadas y manda el resto,
sin tocar el texto, a docs/historial/AAAA-MM.md. Regenera la tabla índice.
Idempotente: si ya hay <= N entradas, no mueve nada. Uso: python3 scripts/rotar-progress.py [N]"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "PROGRESS.md"; H = ROOT / "docs" / "historial"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
DATE = re.compile(r"^## (\d{4})-(\d{2})-\d{2}")
A, B = "<!-- INDICE-INICIO -->", "<!-- INDICE-FIN -->"

text = P.read_text()
if A in text:  # sacar el índice viejo antes de partir
    text = re.sub(re.escape(A) + r".*?" + re.escape(B) + r"\n*", "", text, flags=re.S)
lines = text.split("\n")
starts = [i for i, l in enumerate(lines) if DATE.match(l)]
head = "\n".join(lines[: starts[0]]).rstrip("\n") if starts else text
entries = [(lines[s], "\n".join(lines[s: e]).rstrip("\n")) for s, e in zip(starts, starts[1:] + [len(lines)])]
old, keep = entries[:-N] if len(entries) > N else [], entries[-N:]
H.mkdir(parents=True, exist_ok=True)
for title, body in old:
    m = DATE.match(title); f = H / f"{m.group(1)}-{m.group(2)}.md"
    cur = f.read_text() if f.exists() else f"# PROGRESS — historial {m.group(1)}-{m.group(2)}\n\n> Rotado desde PROGRESS.md (texto sin cambios).\n"
    if body not in cur:
        f.write_text(cur.rstrip("\n") + "\n\n" + body + "\n")
rows = []
for f in sorted(H.glob("*.md")):
    for l in f.read_text().split("\n"):
        if DATE.match(l): rows.append(f"| {l[3:]} | `docs/historial/{f.name}` |")
idx = f"{A}\n## Índice del historial (entradas rotadas)\n\n| Entrada | Archivo |\n|---|---|\n" + "\n".join(rows) + f"\n{B}\n"
out = head + "\n\n" + idx + "\n" + "\n\n".join(b for _, b in keep) + "\n"
P.write_text(out)
print(f"rotadas {len(old)}, vigentes {len(keep)}, índice {len(rows)} filas")
