"""
fix_math_ooxml.py
─────────────────────────────────────────────────────────────
Извлекает 47 пропущенных вопросов математики из МАТем.docx,
конвертируя OOXML-формулы (m:f, m:rad, m:sSup, m:sSub, m:d)
в LaTeX ($...$), и загружает их в Supabase.
"""

import os, sys, re, json, zipfile, urllib.request, urllib.parse
from xml.etree import ElementTree as ET

# ── env ──────────────────────────────────────────────────────
from pathlib import Path
env_path = Path(__file__).resolve().parents[1] / '.env'
env = {}
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = env.get('SUPABASE_URL', '')
SUPABASE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_ANON_KEY', '')
DOCX_PATH    = Path(__file__).resolve().parents[2] / 'МАТем.docx'

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit('❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не найдены в .env')

# ── namespaces ───────────────────────────────────────────────
W  = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M  = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

def wt(tag): return f'{{{W}}}{tag}'
def mt(tag): return f'{{{M}}}{tag}'

# ── OOXML math → LaTeX ───────────────────────────────────────

def omml_to_latex(node):
    """Рекурсивно конвертирует OOXML math узел в строку LaTeX."""
    tag = node.tag.split('}')[-1] if '}' in node.tag else node.tag

    # Plain math text
    if tag == 'r':
        parts = []
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 't':
                parts.append(child.text or '')
        return ''.join(parts)

    # Fraction: \frac{num}{den}
    if tag == 'f':
        num = den = ''
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'num':
                num = ''.join(omml_to_latex(c) for c in child)
            elif ctag == 'den':
                den = ''.join(omml_to_latex(c) for c in child)
        return f'\\frac{{{num}}}{{{den}}}'

    # Radical: \sqrt[deg]{base}  or  \sqrt{base}
    if tag == 'rad':
        deg = ''
        base = ''
        deg_hide = False
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'radPr':
                for subch in child:
                    if subch.tag.split('}')[-1] == 'degHide':
                        deg_hide = True
            elif ctag == 'deg':
                deg = ''.join(omml_to_latex(c) for c in child)
            elif ctag == 'e':
                base = ''.join(omml_to_latex(c) for c in child)
        if deg_hide or not deg.strip():
            return f'\\sqrt{{{base}}}'
        return f'\\sqrt[{deg}]{{{base}}}'

    # Superscript: base^{sup}
    if tag == 'sSup':
        base = sup = ''
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'e':
                base = ''.join(omml_to_latex(c) for c in child)
            elif ctag == 'sup':
                sup = ''.join(omml_to_latex(c) for c in child)
        # wrap base in braces if multi-char
        b = f'{{{base}}}' if len(base) > 1 else base
        return f'{b}^{{{sup}}}'

    # Subscript: base_{sub}
    if tag == 'sSub':
        base = sub = ''
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'e':
                base = ''.join(omml_to_latex(c) for c in child)
            elif ctag == 'sub':
                sub = ''.join(omml_to_latex(c) for c in child)
        b = f'{{{base}}}' if len(base) > 1 else base
        return f'{b}_{{{sub}}}'

    # Delimiter: (content) or [content] etc.
    if tag == 'd':
        beg_chr = '('
        end_chr = ')'
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'dPr':
                for subch in child:
                    sctag = subch.tag.split('}')[-1] if '}' in subch.tag else subch.tag
                    if sctag == 'begChr':
                        beg_chr = subch.attrib.get(f'{{{M}}}val', '(')
                    elif sctag == 'endChr':
                        end_chr = subch.attrib.get(f'{{{M}}}val', ')')
        inner_parts = []
        for child in node:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'e':
                inner_parts.append(''.join(omml_to_latex(c) for c in child))
        inner = ', '.join(inner_parts)
        return f'{beg_chr}{inner}{end_chr}'

    # oMath / oMathPara: recurse
    if tag in ('oMath', 'oMathPara'):
        return ''.join(omml_to_latex(c) for c in node)

    # Default: recurse into children
    return ''.join(omml_to_latex(c) for c in node)


# Unicode math-spacing chars that appear in OOXML math text
_MATH_SPACES = re.compile(r'[  ​   ]+')

# Latin letters that appear as Cyrillic option labels inside math nodes
_LATIN_TO_CYRILLIC = {'a': 'а', 'A': 'а', 'b': 'б', 'B': 'б'}

# Matches an option-letter prefix (Cyrillic or Latin lookalike) at string start
_OPT_PREFIX_RE = re.compile(r'^([aAbBабвгд])\)\s*', re.I)


def convert_math_node(node):
    """Конвертирует m:oMath в inline LaTeX $...$ или в текст варианта X) ..."""
    inner = ''.join(omml_to_latex(c) for c in node)
    # Normalize OOXML math-spacing characters to regular space
    inner = _MATH_SPACES.sub(' ', inner).strip()
    if not inner:
        return ''

    # If the content starts with an option letter (а) б) ...) extract it
    m = _OPT_PREFIX_RE.match(inner)
    if m:
        letter = m.group(1)
        # Normalize Latin a/b → Cyrillic а/б
        letter = _LATIN_TO_CYRILLIC.get(letter, letter).lower()
        rest = inner[m.end():].strip()
        if not rest:
            return f'{letter}) '
        # Only wrap in $...$ when actual LaTeX commands are present
        if re.search(r'\\[a-zA-Z]', rest):
            return f'{letter}) ${rest}$'
        return f'{letter}) {rest}'

    return f'${inner}$'


# ── Paragraph text extraction ────────────────────────────────

def extract_para_text(para):
    """Извлекает полный текст абзаца, включая OOXML-формулы → LaTeX."""
    parts = []
    for child in para.iter():
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        ns  = child.tag.split('}')[0].lstrip('{') if '}' in child.tag else ''

        if ns == W and tag == 't':
            parts.append(child.text or '')
        elif ns == W and tag == 'br':
            parts.append('\n')
        elif ns == M and tag == 'oMath':
            parts.append(convert_math_node(child))
            # skip children — already processed
    # de-duplicate consecutive math blocks inserted by iter()
    # (iter() goes depth-first so we get duplicates — need a different approach)
    return None  # use walk_para instead


def walk_para(para):
    """Обходит прямых потомков абзаца (не iter), собирает текст."""
    parts = []

    def collect(node):
        tag = node.tag.split('}')[-1] if '}' in node.tag else node.tag
        ns  = node.tag.split('}')[0].lstrip('{') if '}' in node.tag else ''

        if ns == M and tag == 'oMathPara':
            # Each oMath child is a logical line (question formula or option)
            math_lines = []
            for child in node:
                if child.tag == f'{{{M}}}oMath':
                    math_lines.append(convert_math_node(child))
            parts.append('\n'.join(math_lines))
            return

        if ns == M and tag == 'oMath':
            parts.append(convert_math_node(node))
            return  # don't recurse

        if ns == W and tag == 't':
            parts.append(node.text or '')
            return

        if ns == W and tag == 'br':
            parts.append('\n')
            return

        for child in node:
            collect(child)

    collect(para)
    return ''.join(parts)


# ── Parse document ───────────────────────────────────────────

def parse_document(docx_path):
    """Возвращает список абзацев как строки (с LaTeX)."""
    with zipfile.ZipFile(docx_path) as z:
        xml_raw = z.read('word/document.xml')
    root = ET.fromstring(xml_raw)
    body = root.find(f'{{{W}}}body')

    paragraphs = []
    for child in body:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag == 'p':
            text = walk_para(child).strip()
            if text:
                paragraphs.append(text)
        elif tag == 'tbl':
            for row in child.iter(f'{{{W}}}tr'):
                row_texts = []
                for cell in row.iter(f'{{{W}}}tc'):
                    cell_text = ' '.join(
                        walk_para(p).strip()
                        for p in cell.findall(f'{{{W}}}p')
                        if walk_para(p).strip()
                    )
                    if cell_text:
                        row_texts.append(cell_text)
                if row_texts:
                    paragraphs.append('  '.join(row_texts))

    return paragraphs


# ── Question parser ──────────────────────────────────────────

SKIPPED_NUMS = {97, 207, 263, 264, 265, 266}

OPT_RE = re.compile(r'^([абвгд])\)\s*(.+)', re.I)
Q_RE   = re.compile(r'^(\d+)-суроо')


def parse_skipped_questions(paragraphs, answers):
    """Парсит только пропущенные вопросы из списка абзацев."""
    # Найдём индексы начала каждого вопроса
    q_starts = {}  # num → para_index
    for i, para in enumerate(paragraphs):
        m = Q_RE.match(para)
        if m:
            num = int(m.group(1))
            q_starts[num] = i

    questions = []

    for num in sorted(SKIPPED_NUMS):
        if num not in q_starts:
            print(f'  ⚠  Q{num}: не найден в документе')
            continue

        start_i = q_starts[num]
        sorted_nums = sorted(q_starts.keys())
        idx_in_sorted = sorted_nums.index(num)
        if idx_in_sorted + 1 < len(sorted_nums):
            next_num = sorted_nums[idx_in_sorted + 1]
            end_i = q_starts[next_num]
        else:
            end_i = len(paragraphs)

        block = paragraphs[start_i:end_i]

        # Соединяем все абзацы блока и разбиваем по строкам
        # (варианты могут быть в одном абзаце с \n через <w:br/>)
        full_text = '\n'.join(block)
        lines = [l.strip() for l in full_text.split('\n') if l.strip()]

        q_text_lines = []
        opts = []

        for line in lines:
            # Убираем маркер "N-суроо:" из строки
            cleaned = Q_RE.sub('', line).strip().lstrip(':').strip()
            if not cleaned:
                continue

            opt_m = OPT_RE.match(cleaned)
            if opt_m:
                opts.append({'letter': opt_m.group(1).lower(), 'text': opt_m.group(2).strip()})
            elif not opts:
                q_text_lines.append(cleaned)
            else:
                # Продолжение последнего варианта (перенос строки)
                opts[-1]['text'] += ' ' + cleaned

        q_text = '\n'.join(q_text_lines).strip()

        if not q_text:
            print(f'  ⚠  Q{num}: пустой текст вопроса — пропускаю')
            continue
        if len(opts) < 2:
            print(f'  ⚠  Q{num}: меньше 2 вариантов ({len(opts)}) — пропускаю')
            continue

        correct_letter = answers.get(num)
        if not correct_letter:
            print(f'  ⚠  Q{num}: нет ключа ответа — пропускаю')
            continue

        # Удаляем пустые варианты
        opts = [o for o in opts if o['text'].strip()]
        if len(opts) < 2:
            print(f'  ⚠  Q{num}: после фильтрации пустых < 2 вариантов — пропускаю')
            continue

        final_opts = [
            {'text': o['text'], 'is_correct': o['letter'] == correct_letter}
            for o in opts
        ]
        if not any(o['is_correct'] for o in final_opts):
            print(f'  ⚠  Q{num}: ключ "{correct_letter}" не совпал ни с одним вариантом')
            final_opts[0]['is_correct'] = True

        questions.append({'num': num, 'question_text': q_text, 'options': final_opts})
        print(f'  ✓  Q{num}: "{q_text[:60]}..." ({len(opts)} вариантов)')

    return questions


# ── Answer key parser ────────────────────────────────────────

def parse_answers(paragraphs):
    answers = {}
    for para in paragraphs:
        for part in re.split(r'[\s,;]+', para):
            m = re.match(r'^(\d+)\s*-\s*([абвгдАБВГД])$', part)
            if m:
                answers[int(m.group(1))] = m.group(2).lower()
    return answers


# ── Supabase HTTP client ─────────────────────────────────────

def supabase_request(method, path, data=None):
    url = f'{SUPABASE_URL}/rest/v1{path}'
    body = json.dumps(data).encode() if data is not None else None
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read()
            return resp.status, resp_body
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def get_subject_id(subject_code):
    path = f'/uni_subjects?code=eq.{subject_code}&select=id'
    status, body = supabase_request('GET', path)
    rows = json.loads(body)
    if rows:
        return rows[0]['id']
    return None


def insert_questions(subject_id, questions):
    rows = [
        {
            'subject_id': subject_id,
            'template_id': None,
            'question_text': q['question_text'],
            'options': q['options'],
            'explanation': '[MANAS_ONLY]',
            'image_url': '',
        }
        for q in questions
    ]
    BATCH = 50
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        status, body = supabase_request('POST', '/uni_questions_math', batch)
        if status in (200, 201):
            inserted += len(batch)
            print(f'  📤 Загружено: {inserted}/{len(rows)}')
        else:
            print(f'  ❌ Ошибка {status}: {body.decode()[:200]}')
    return inserted


# ── Main ─────────────────────────────────────────────────────

def main():
    print('🔍 Парсинг МАТем.docx (OOXML → LaTeX)...')
    paragraphs = parse_document(str(DOCX_PATH))
    print(f'   Абзацев найдено: {len(paragraphs)}')

    print('\n🔑 Парсинг ключей ответов...')
    answers = parse_answers(paragraphs)
    print(f'   Ключей найдено: {len(answers)}')

    print(f'\n📐 Извлекаем {len(SKIPPED_NUMS)} пропущенных вопросов...')
    questions = parse_skipped_questions(paragraphs, answers)
    print(f'\n   Успешно извлечено: {len(questions)}')

    if not questions:
        print('⚠  Нечего загружать.')
        return

    print('\n🆔 Получаем subject_id для math...')
    subject_id = get_subject_id('math')
    if not subject_id:
        print('❌ subject math не найден в БД')
        return
    print(f'   subject_id: {subject_id}')

    print(f'\n📤 Загружаем {len(questions)} вопросов в uni_questions_math...')
    total = insert_questions(subject_id, questions)

    print(f'\n✅ Загружено {total} из {len(questions)} вопросов.')


if __name__ == '__main__':
    main()
