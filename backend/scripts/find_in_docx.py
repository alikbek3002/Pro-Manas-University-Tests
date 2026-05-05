"""Find each broken-question fragment in the docx dump."""
import json, re
from pathlib import Path

dump = json.loads((Path(__file__).parent / 'math_docx_dump.json').read_text(encoding='utf-8'))
qs = dump['questions']

# Fragments we need to locate (substrings unique enough to identify)
TARGETS = [
    ('eaf8b622', 'буруш бөлчөк'),               # неправильную дробь
    ('f5a566b6', 'аралаш бөлчөк'),               # a + b - c аралаш
    ('1d20f8ca', '8'),                            # "Эсептегиле. 8 - 4" (придётся искать по структуре)
    ('5c4b519c', 'кыскарткыла'),                  # сократите дроби
    ('a679757e', 'Сумманы эсептегиле'),
    ('d664c1b7', 'Окшош кошулуучуларды'),
    ('493d4c7d', 'Теңдемени чыгаргыла'),
    ('1382e753', 'биссектрисаларын'),
    ('70a35bcb', '13 см, 14 см, 15 см'),
    ('3070dc25', 'sqrt[3]{5}'),                   # cube roots
    ('b8b69d5d', 'sqrt{45}'),
    ('57b2c9f8', '3^{\\frac{1}{4}}'),
    ('ca60be1b', 'векторлорунун'),
    ('855b74d7', 'Тикбурчтуктун узундугу'),
    ('20d7eb51', 'жөнөкөйлөткүлө'),
    ('cef82aa5', 'аныкталуу областын'),
]

def joined(q):
    return '\n'.join(q['paragraphs'])

for short_id, frag in TARGETS:
    matches = []
    for q in qs:
        text = joined(q)
        if frag in text:
            matches.append(q['num'])
    print(f'{short_id} | "{frag}" → {matches[:5]}{"..." if len(matches) > 5 else ""}')
