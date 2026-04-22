"""
upload_math_images.py
─────────────────────────────────────────────────────────────
Извлекает изображения из МАТем.docx, находит соответствующие
вопросы в Supabase и загружает картинки в bucket question-images.

Алгоритм:
  1. Парсит document.xml, чтобы понять: какой image{N}.png → какой номер вопроса
  2. Извлекает тексты вопросов с картинками через textutil (те же данные, что в БД)
  3. Загружает изображения в Supabase Storage (bucket: question-images)
  4. UPDATE uni_questions_math.image_url для совпавших строк
"""

import os, sys, re, json, zipfile, time, subprocess, urllib.request, urllib.error
from xml.etree import ElementTree as ET
from pathlib import Path

# ── env ──────────────────────────────────────────────────────
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

# ── XML namespaces ────────────────────────────────────────────
W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M   = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
A_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

# ── Supabase helpers ─────────────────────────────────────────

def supa_request(method, path, data=None, extra_headers=None):
    url = f'{SUPABASE_URL}{path}'
    body = json.dumps(data).encode() if data is not None else None
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            resp = r.read()
            return r.status, resp
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def upload_image_to_storage(bucket, storage_path, img_bytes, content_type='image/png'):
    """Upload raw bytes to Supabase Storage."""
    url = f'{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}'
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': content_type,
        'x-upsert': 'true',
    }
    req = urllib.request.Request(url, data=img_bytes, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def public_url(bucket, storage_path):
    return f'{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}'


# ── Step 1: Map question numbers → image filenames ────────────

def build_q_image_map(docx_path):
    """Returns {question_num: 'media/imageN.png'} by walking document.xml."""
    with zipfile.ZipFile(docx_path) as z:
        xml_raw  = z.read('word/document.xml')
        rels_raw = z.read('word/_rels/document.xml.rels')

    rels_root = ET.fromstring(rels_raw)
    rid_to_file = {}
    for rel in rels_root:
        if rel.attrib.get('Type', '').endswith('/image'):
            rid_to_file[rel.attrib['Id']] = rel.attrib['Target']

    root = ET.fromstring(xml_raw)
    body = root.find(f'{{{W}}}body')

    Q_RE = re.compile(r'(\d+)-суроо')

    def get_text(node):
        return ''.join(t.text or '' for t in node.iter(f'{{{W}}}t'))

    def find_rid_in_para(para):
        for node in para.iter():
            tag = node.tag.split('}')[-1] if '}' in node.tag else node.tag
            if tag == 'blip':
                for k, v in node.attrib.items():
                    if 'embed' in k.lower() and v in rid_to_file:
                        return rid_to_file[v]
        return None

    current_q = [None]
    q_image_map = {}

    def process(elem):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        ns  = elem.tag.split('}')[0].lstrip('{') if '}' in elem.tag else ''
        if ns == W and tag == 'p':
            text = get_text(elem)
            m = Q_RE.search(text)
            if m:
                current_q[0] = int(m.group(1))
            img = find_rid_in_para(elem)
            if img and current_q[0] is not None:
                q_image_map[current_q[0]] = img
        elif ns == W and tag == 'tbl':
            for row in elem.iter(f'{{{W}}}tr'):
                for cell in row.iter(f'{{{W}}}tc'):
                    for p in cell.findall(f'{{{W}}}p'):
                        process(p)
        else:
            for child in elem:
                ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                cns  = child.tag.split('}')[0].lstrip('{') if '}' in child.tag else ''
                if cns == W and ctag in ('p', 'tbl'):
                    process(child)

    for child in body:
        process(child)

    return q_image_map


# ── Step 2: Extract question texts via textutil ───────────────

def parse_questions_from_text(text):
    """
    Parses raw textutil output.
    Returns {question_num: question_text_str}
    """
    opt_letters = ['а', 'б', 'в', 'г', 'д']
    opt_pattern = re.compile(r'^([абвгд])\)\s*', re.I)
    q_marker    = re.compile(r'^(\d+)-суроо[:\s]*(.*)', re.I)
    answer_block = re.compile(r'\b\d+-[абвгдАБВГД]\b')

    # Find answer block start (last 30% of text)
    threshold = int(len(text) * 0.70)
    lines_raw = text.split('\n')
    answer_start_line = None
    pos = 0
    for i, line in enumerate(lines_raw):
        if pos >= threshold:
            hits = len(re.findall(r'\d+-[абвгдАБВГД]', line, re.I))
            if hits >= 3:
                answer_start_line = i
                break
        pos += len(line) + 1

    lines = lines_raw[:answer_start_line] if answer_start_line else lines_raw

    # Find all question start positions
    q_positions = []
    for i, line in enumerate(lines):
        m = q_marker.match(line.strip())
        if m:
            q_positions.append((i, int(m.group(1)), m.group(2).strip()))

    questions = {}
    for idx, (line_i, num, first_text) in enumerate(q_positions):
        end_i = q_positions[idx + 1][0] if idx + 1 < len(q_positions) else len(lines)
        block = lines[line_i:end_i]

        q_text_lines = [first_text] if first_text else []
        for line in block[1:]:
            stripped = line.strip()
            if not stripped:
                continue
            if opt_pattern.match(stripped):
                break
            q_text_lines.append(stripped)

        q_text = '\n'.join(l for l in q_text_lines if l).strip()
        if q_text:
            questions[num] = q_text

    return questions


# ── LaTeX converter (mirrors upload_chem_math.js convertLatex) ─

def convert_latex(text):
    """Convert (formula) → $formula$ and [formula] → $$formula$$"""
    if not text:
        return text
    # [formula] → $$formula$$ when has \ or ^
    def repl_display(m):
        inner = m.group(1)
        if re.search(r'\\[a-zA-Z]', inner) or re.search(r'[a-zA-Z0-9]\^', inner):
            return f'$${inner.strip()}$$'
        return m.group(0)
    text = re.sub(r'\[([^\[\]\n]{2,200})\]', repl_display, text)
    # (formula) → $formula$ when has LaTeX command
    def repl_inline(m):
        inner = m.group(1)
        if re.search(r'\\[a-zA-Z]', inner):
            return f'${inner.strip()}$'
        return m.group(0)
    text = re.sub(r'\(([^()\n]{2,200})\)', repl_inline, text)
    return text


# ── Step 3: Fetch all DB rows ─────────────────────────────────

def fetch_all_math_questions():
    """Returns list of {id, question_text, image_url}."""
    all_rows = []
    limit = 500
    offset = 0
    while True:
        path = f'/rest/v1/uni_questions_math?select=id,question_text,image_url&limit={limit}&offset={offset}'
        status, body = supa_request('GET', path)
        rows = json.loads(body)
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    return all_rows


# ── Step 4: Match question text to DB row ─────────────────────

def normalize(text):
    """Normalize text for matching: lowercase, collapse whitespace."""
    return re.sub(r'\s+', ' ', (text or '').strip().lower())


def find_db_row(q_text_raw, db_rows_indexed):
    """Find DB row by matching first 80 chars of question text.
    Tries both raw text and LaTeX-converted text (to handle formulas in question)."""
    candidates = [q_text_raw, convert_latex(q_text_raw)]

    for candidate in candidates:
        key = normalize(candidate)[:80]
        if not key:
            continue
        for row_key, row in db_rows_indexed.items():
            if row_key.startswith(key) or key.startswith(row_key[:80]):
                return row
        # 50-char fallback
        key50 = key[:50]
        for row_key, row in db_rows_indexed.items():
            if row_key.startswith(key50) or key50.startswith(row_key[:50]):
                return row

    return None


# ── Main ─────────────────────────────────────────────────────

def main():
    print('📂 Шаг 1: Строим карту вопрос → изображение...')
    q_image_map = build_q_image_map(str(DOCX_PATH))
    print(f'   Найдено {len(q_image_map)} вопросов с картинками')

    print('\n📝 Шаг 2: Парсим тексты вопросов (textutil)...')
    try:
        import subprocess
        text = subprocess.check_output(
            ['textutil', '-convert', 'txt', str(DOCX_PATH), '-stdout'],
            stderr=subprocess.DEVNULL
        ).decode('utf-8', errors='replace')
    except Exception as e:
        sys.exit(f'❌ textutil ошибка: {e}')

    q_texts = parse_questions_from_text(text)
    print(f'   Распаршено {len(q_texts)} вопросов из textutil')

    print('\n📊 Шаг 3: Загружаем все строки из БД...')
    db_rows = fetch_all_math_questions()
    print(f'   Найдено {len(db_rows)} строк в uni_questions_math')

    # Build indexed lookup (normalized first 80 chars → row)
    db_index = {}
    for row in db_rows:
        key = normalize(row['question_text'])[:80]
        db_index[key] = row

    print('\n🔍 Шаг 4: Сопоставляем и загружаем...')
    matched = 0
    skipped = 0
    errors  = 0

    with zipfile.ZipFile(str(DOCX_PATH)) as z:
        for q_num in sorted(q_image_map.keys()):
            img_path_in_zip = 'word/' + q_image_map[q_num]  # e.g. word/media/image1.png

            # Get question text from textutil parse
            q_text_raw = q_texts.get(q_num, '')
            if not q_text_raw:
                print(f'  ⚠  Q{q_num}: текст вопроса не найден в textutil — пропускаю')
                skipped += 1
                continue

            # Find DB row
            db_row = find_db_row(q_text_raw, db_index)
            if not db_row:
                print(f'  ⚠  Q{q_num}: строка в БД не найдена (текст: "{q_text_raw[:60]}")')
                skipped += 1
                continue

            # Skip if already has image_url
            if db_row.get('image_url') and 'math_q' in db_row.get('image_url', ''):
                print(f'  ✓  Q{q_num}: уже есть картинка — пропускаю')
                matched += 1
                continue

            # Extract image bytes from docx
            try:
                img_bytes = z.read(img_path_in_zip)
            except KeyError:
                print(f'  ❌ Q{q_num}: {img_path_in_zip} не найден в docx')
                errors += 1
                continue

            # Upload to Supabase Storage
            ts = int(time.time() * 1000)
            fname = f'math_q{q_num}_{ts}.png'
            status, body = upload_image_to_storage('question-images', fname, img_bytes)
            if status not in (200, 201):
                print(f'  ❌ Q{q_num}: ошибка загрузки {status}: {body[:100]}')
                errors += 1
                continue

            pub_url = public_url('question-images', fname)

            # Update DB row
            row_id = db_row['id']
            upd_path = f'/rest/v1/uni_questions_math?id=eq.{row_id}'
            status2, body2 = supa_request(
                'PATCH', upd_path,
                data={'image_url': pub_url},
                extra_headers={'Prefer': 'return=minimal'}
            )
            if status2 in (200, 201, 204):
                print(f'  ✓  Q{q_num}: загружено → {fname}')
                matched += 1
            else:
                print(f'  ❌ Q{q_num}: ошибка обновления БД {status2}: {body2[:100]}')
                errors += 1

    print(f'\n{"="*50}')
    print(f'✅ Загружено/обновлено: {matched}')
    print(f'⚠  Пропущено:           {skipped}')
    print(f'❌ Ошибок:              {errors}')


if __name__ == '__main__':
    main()
