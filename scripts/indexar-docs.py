#!/usr/bin/env python3
"""Inserta/actualiza una tabla índice (sección -> línea) al principio de los docs
de referencia largos (8k-15k tokens). Idempotente. Uso: python3 scripts/indexar-docs.py [archivo ...]"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
A, B = "<!-- INDICE-INICIO -->", "<!-- INDICE-FIN -->"
files = sys.argv[1:] or ["ZOOM_AUTOMATION.md"]
for name in files:
    p = ROOT / name; t = p.read_text()
    t = re.sub(re.escape(A) + r".*?" + re.escape(B) + r"\n*", "", t, flags=re.S)
    lines = t.split("\n")
    # el índice se inserta tras el título (línea 1) y su bloque inicial; calculamos con el offset final
    def build(off):
        rows = [f"| {l[3:]} | {i + 1 + off} |" for i, l in enumerate(lines) if l.startswith("## ")]
        return f"{A}\n## Índice (usar `sed -n 'L,+60p'`; no leer el doc entero)\n\n| Sección | Línea |\n|---|---|\n" + "\n".join(rows) + f"\n{B}\n\n"
    off = build(0).count("\n")
    idx = build(off)
    ins = 1
    while ins < len(lines) and lines[ins].strip() == "": ins += 1
    new = "\n".join(lines[:1]) + "\n\n" + idx + "\n".join(lines[1:]).lstrip("\n")
    # corrección de offset por el título + línea en blanco agregados
    p.write_text(new)
    print(name, "indexado")
