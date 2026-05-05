"""Dump every paragraph + parsed question block from МАТем.docx as JSON.

Re-uses OOXML→LaTeX converter from fix_math_ooxml.py.
"""
import sys, os, json, re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util
spec = importlib.util.spec_from_file_location('fix_math_ooxml', Path(__file__).parent / 'fix_math_ooxml.py')
fmo = importlib.util.module_from_spec(spec)

# stub out env check before loading (we don't need supabase)
import builtins
real_exit = sys.exit
sys.exit = lambda *a, **k: None
try:
    spec.loader.exec_module(fmo)
finally:
    sys.exit = real_exit

DOCX_PATH = Path(__file__).resolve().parents[2] / 'МАТем.docx'

paragraphs = fmo.parse_document(DOCX_PATH)

Q_RE = re.compile(r'^(\d+)-суроо')
OPT_RE = re.compile(r'^([абвгд])\)\s*(.*)', re.I)

# Find question starts
q_starts = []
for i, para in enumerate(paragraphs):
    m = Q_RE.match(para)
    if m:
        q_starts.append((int(m.group(1)), i))

questions = []
for idx, (num, start) in enumerate(q_starts):
    end = q_starts[idx + 1][1] if idx + 1 < len(q_starts) else len(paragraphs)
    block = paragraphs[start:end]
    questions.append({'num': num, 'paragraphs': block})

out = Path(__file__).parent / 'math_docx_dump.json'
out.write_text(json.dumps({'questions': questions}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Saved {len(questions)} questions → {out}')
