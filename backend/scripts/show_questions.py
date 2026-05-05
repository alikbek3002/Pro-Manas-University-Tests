"""Show full text of given question numbers."""
import json, sys
from pathlib import Path

dump = json.loads((Path(__file__).parent / 'math_docx_dump.json').read_text(encoding='utf-8'))
nums = [int(x) for x in sys.argv[1:]]
for q in dump['questions']:
    if q['num'] in nums:
        print('=' * 80)
        print(f'Q{q["num"]}')
        for p in q['paragraphs']:
            print(p)
