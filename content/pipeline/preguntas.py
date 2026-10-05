"""Draft questions per OA with AI, check them with a second model, and build the files the
backend imports as drafts (status 'draft': they enter the game only after a teacher or UTP
approves them in the question bank).

  generar   Codex writes ~12 questions per OA from the official OA text (catalog in
            shared/curriculum/<grade>.json). Saved to content/pipeline/borradores/<grade>/<subject>/<OA>.json
  verificar Grok answers each question without the key and flags problems. A different model
            family on purpose: it does not share the writer's blind spots.
  armar     Writes content/questions/borradores/<subject>_<grade>.json for import-questions.js.

Usage:
  preguntas.py generar --grade 5b [--subjects ciencias,historia] [--only OA1,OA2] [--workers 3] [--redo]
  preguntas.py verificar --grade 5b [--subjects ...] [--only ...] [--workers 3] [--redo]
  preguntas.py armar --grade 5b

Codex and Grok are called directly, three at a time (like art/gen.sh): the orchestrator runs one
job at a time and stops them at 10 minutes, and a draft takes ~6. Each call first waits for 2 GB
of free RAM and for no deploy in progress, the same guard the orchestrator applies. A job that the
orchestrator already queued (a .job file next to the draft) is resumed there instead of asked again.
"""
import argparse
import fcntl
import json
import random
import re
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # academia/
WORK = Path(__file__).parent / 'borradores'
OUT = ROOT / 'content/questions/borradores'
MAU_JOB = '/root/.local/bin/mau-job'
CODEX = '/root/.local/bin/codex'
GROK = '/root/.grok/bin/grok'
DEPLOY_LOCK = Path('/root/apps/.deploy-guard/laravas-deploy.lock')
RAM_FLOOR_MB = 2048
CALL_TIMEOUT_S = 1500

WRITER = {'model': 'gpt-5.6-luna', 'effort': 'max'}
CHECKER = {'model': 'grok-4.6', 'effort': 'high'}
PER_OA = 12
MIX = {'easy': 4, 'medium': 4, 'hard': 4}

GRADE_NAMES = {'3b': '3° básico', '4b': '4° básico', '5b': '5° básico', '6b': '6° básico'}
AGES = {'3b': '8 a 9', '4b': '9 a 10', '5b': '10 a 11', '6b': '11 a 12'}
SUBJECT_NAMES = {'matematica': 'Matemática', 'lenguaje': 'Lenguaje y Comunicación', 'ciencias': 'Ciencias Naturales',
                 'historia': 'Historia, Geografía y Ciencias Sociales', 'ingles': 'Inglés'}

# A round gives 25 s per question and shows it on a projector: short texts, short options.
LIMITS = {'text': 230, 'text_reading': 300, 'option': 70, 'hint': 130, 'clue': 110, 'note': 90}
READING = ('lenguaje', 'ingles')

SUBJECT_RULES = {
    'matematica': 'Usa cálculos que un alumno pueda hacer mentalmente o con lápiz en 25 segundos. '
                  'Problemas con contextos chilenos cotidianos (precios en pesos, distancias entre ciudades).',
    'lenguaje': 'Si la pregunta necesita un texto para leer, escribe uno propio, breve (máximo 40 palabras), '
                'dentro del enunciado y entre comillas. No cites obras con derechos de autor.',
    'ciencias': 'Hechos científicos estables y verificables, al nivel del programa. Contextos de la naturaleza '
                'y la vida diaria en Chile cuando aporten.',
    'historia': 'Hechos verificables y aceptados por la historiografía escolar chilena; evita cifras '
                'discutidas y juicios de valor. Para geografía, usa las zonas naturales de Chile tal como las '
                'enseña el programa de 5° básico.',
    'ingles': 'Inglés nivel A1, vocabulario de las unidades del año. Las instrucciones pueden ir en español '
              'cuando el alumno necesita entender qué se le pide; los textos para leer, en inglés simple y '
              'breves (máximo 35 palabras).',
}


def curriculum(grade):
    return json.loads((ROOT / f'shared/curriculum/{grade}.json').read_text())


def quiz_oas(grade, subjects=None, only=None):
    cur = curriculum(grade)
    for s in cur['subjects']:
        if subjects and s['subject'] not in subjects:
            continue
        units = {u['number']: u['title'] for u in s['units']}
        for oa in s['oas']:
            if oa['quiz'] and (not only or oa['code'] in only):
                yield s['subject'], oa, units


def existing_questions(subject, grade, code):
    path = ROOT / f'content/questions/{subject}_{grade}.json'
    if not path.exists():
        return []
    return [q['text'] for q in json.loads(path.read_text()) if q.get('oa_code') == code]


def writer_prompt(subject, grade, oa, units):
    unit_titles = [f'Unidad {n}' + (f' ({units[n]})' if units.get(n) else '') for n in oa.get('units') or []]
    seen = existing_questions(subject, grade, oa['code'])
    lines = [
        f'Escribe {PER_OA} preguntas de selección múltiple para alumnos de {GRADE_NAMES[grade]} en Chile '
        f'({AGES[grade]} años), asignatura {SUBJECT_NAMES[subject]}, que evalúen este Objetivo de Aprendizaje '
        'de las Bases Curriculares del Mineduc:',
        '',
        f'{oa["code"]} · {oa["label"]} (eje {oa["eje"]})',
        f'«{oa["text"]}»',
    ]
    if oa.get('note'):
        lines.append(f'Enfoque al evaluarlo con alternativas: {oa["note"]}.')
    if unit_titles:
        lines.append('Se trabaja en: ' + ('todo el año' if oa.get('all_year') else ', '.join(unit_titles)) + '.')
    lines += [
        '',
        'Reglas:',
        '- Cubre todos los componentes del OA, repartidos; no repitas la misma estructura de pregunta.',
        f'- Dificultad: {MIX["easy"]} "easy" (un paso, reconocer o recordar), {MIX["medium"]} "medium" (aplicar, '
        f'dos pasos) y {MIX["hard"]} "hard" (varios pasos, problema no rutinario o inferencia), pensando en un '
        'alumno típico del curso.',
        '- Cuatro alternativas, una sola correcta e indiscutible. Las incorrectas, plausibles: cada una '
        'corresponde a un error típico de un niño de esa edad. Sin "todas las anteriores", "ninguna de las '
        'anteriores" ni combinaciones ("A y B"). Alternativas de largo parecido, sin pistas gramaticales.',
        '- Español de Chile, tratando al alumno de tú. Nada de voseo ni modismos de otros países. Contextos '
        'chilenos (nombres, lugares, comidas, flora y fauna nativa, precios en pesos) cuando aporten.',
        '- Números con punto de miles y coma decimal (12.500; 2,5). Unidades del sistema internacional.',
        f'- Enunciado de máximo {LIMITS["text"]} caracteres ({LIMITS["text_reading"]} si incluye un texto para '
        f'leer); alternativas de máximo {LIMITS["option"]}. Se leen en un proyector y hay 25 segundos para '
        'responder.',
        '- Solo texto: sin imágenes, tablas ni gráficos. Si hace falta una figura o un esquema, descríbelo con '
        'naturalidad dentro del enunciado. No menciones estas reglas en las preguntas.',
        '- Nada que dependa de la fecha actual; nada inapropiado para niños.',
        SUBJECT_RULES[subject],
        '',
        'Campos de cada pregunta:',
        '- "text": el enunciado.',
        '- "options": las 4 alternativas; la correcta en la posición que quieras.',
        '- "correct": copia exacta de la alternativa correcta.',
        f'- "hint": se muestra al revelar la respuesta: por qué la correcta es correcta, en una frase de máximo '
        f'{LIMITS["hint"]} caracteres.',
        f'- "clue": pista para antes de responder, que oriente sin revelar la respuesta (máximo {LIMITS["clue"]}).',
        '- "option_notes": objeto con cada alternativa incorrecta como clave y, como valor, el error que '
        f'llevaría a elegirla (máximo {LIMITS["note"]} caracteres).',
        '- "difficulty": "easy", "medium" o "hard".',
    ]
    if seen:
        lines += ['', 'Ya existen estas preguntas de este OA; no las repitas ni hagas variantes casi iguales:']
        lines += [f'- {t}' for t in seen]
    lines += ['', 'Responde solo con JSON, sin texto antes ni después: {"questions": [ ... ]}']
    return '\n'.join(lines)


def checker_prompt(subject, grade, oa, questions):
    items = [{'i': i, 'text': q['text'], 'options': q['options']} for i, q in enumerate(questions)]
    return '\n'.join([
        f'Eres profesor de {SUBJECT_NAMES[subject]} de {GRADE_NAMES[grade]} en Chile. Responde cada pregunta '
        'eligiendo la alternativa correcta, sin ayuda externa, y revisa si tiene algún problema.',
        f'Deben evaluar el {oa["code"]} ({oa["label"]}): «{oa["text"]}»',
        '',
        'Problemas a reportar, si los hay: más de una alternativa correcta, ninguna correcta, enunciado '
        'ambiguo, error de hecho o de cálculo, fuera del nivel o del OA, español no chileno o voseo, algo '
        'inapropiado para niños. Si no hay problema, "problem" va en null.',
        '',
        'Preguntas:',
        json.dumps(items, ensure_ascii=False, indent=1),
        '',
        'Responde solo con JSON: {"answers": [{"i": 0, "answer": "<copia exacta de la alternativa>", '
        '"problem": null}]}',
    ])


def mau(*args):
    proc = subprocess.run([MAU_JOB, *args], capture_output=True, text=True)
    docs = [json.loads(m) for m in re.findall(r'^\{.*?^\}', proc.stdout, re.S | re.M)]
    return docs[-1] if docs else {}


def run_job(capability, params, pending):
    """Submits a job (or resumes the one recorded in `pending`) and waits; returns the report
    text. The job id is written down first: a long wait can drop its connection, and asking
    again would spend quota twice."""
    if pending.exists():
        job = pending.read_text().strip()
    else:
        job = mau('submit', capability, '--project', 'academia', '--params', json.dumps(params)).get('job_id')
        if not job:
            raise RuntimeError('el orquestador no aceptó el trabajo')
        pending.parent.mkdir(parents=True, exist_ok=True)
        pending.write_text(job)
    while True:
        state = mau('wait', job, '--timeout', '600') or mau('status', job)
        if state.get('status') in ('succeeded', 'failed', 'cancelled', 'rejected', 'expired'):
            break
    pending.unlink(missing_ok=True)
    if state['status'] != 'succeeded':
        raise RuntimeError(f"job {job}: {state['status']} {state.get('reason') or ''}")
    report = next(a['path'] for a in state['artifacts'] if a['path'].endswith('report.md'))
    return Path(report).read_text(), job


_launch = threading.Lock()


def deploy_running():
    if not DEPLOY_LOCK.exists():
        return False
    with DEPLOY_LOCK.open() as f:
        try:
            fcntl.flock(f, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(f, fcntl.LOCK_UN)
    return False


def available_mb():
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) // 1024
    return 0


def wait_for_room():
    """One launch at a time, and only with RAM to spare and no deploy running."""
    with _launch:
        while deploy_running() or available_mb() < RAM_FLOOR_MB:
            time.sleep(20)
        time.sleep(3)  # let the previous child allocate before measuring again


def ask_codex(prompt, model, effort):
    wait_for_room()
    with tempfile.TemporaryDirectory() as work:
        proc = subprocess.run([CODEX, 'exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ignore-user-config',
                               '--json', '-m', model, '-c', f'model_reasoning_effort={effort}', '-C', work, prompt],
                              capture_output=True, text=True, timeout=CALL_TIMEOUT_S)
    events = []
    for line in proc.stdout.splitlines():
        if line.strip().startswith('{'):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    for e in events:
        if e.get('type') in ('error', 'turn.failed'):
            err = e.get('error')
            raise RuntimeError(f"codex: {err.get('message') if isinstance(err, dict) else e.get('message')}")
    for e in reversed(events):
        item = e.get('item') if isinstance(e.get('item'), dict) else {}
        if (item.get('item_type') or item.get('type')) in ('agent_message', 'assistant_message', 'message'):
            content = item.get('text') or item.get('content')
            if isinstance(content, list):
                content = ''.join(c.get('text', '') for c in content if isinstance(c, dict))
            if content:
                return content
    raise RuntimeError(f'codex no devolvió texto: {proc.stderr[-300:]}')


def ask_grok(prompt, model, effort):
    wait_for_room()
    with tempfile.TemporaryDirectory() as work:
        proc = subprocess.run([GROK, '-p', prompt, '--output-format', 'json', '--tools', 'read_file,list_dir,grep',
                               '-m', model, '--reasoning-effort', effort],
                              capture_output=True, text=True, timeout=CALL_TIMEOUT_S, cwd=work)
    payload = json.loads(proc.stdout.strip() or '{}')
    if payload.get('error'):
        raise RuntimeError(f"grok: {payload['error']}")
    if not payload.get('text', '').strip():
        raise RuntimeError(f"grok no devolvió texto ({payload.get('stopReason')})")
    return payload['text']


def ask(capability, params, pending):
    """A job the orchestrator already has is resumed there; anything new is asked directly."""
    if pending.exists():
        return run_job(capability, params, pending)
    fn = ask_codex if capability == 'ask_codex' else ask_grok
    return fn(params['prompt'], params['model'], params['effort']), f"directo:{params['model']}@{params['effort']}"


def parse_json(text):
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        raise ValueError('sin JSON en la respuesta')
    return json.loads(m.group(0))


def norm(s):
    s = unicodedata.normalize('NFKC', str(s)).strip().lower()
    return re.sub(r'\s+', ' ', s)


BANNED = re.compile(r'todas las anteriores|ninguna de las anteriores|\b[a-d] y [a-d]\b', re.I)
VOSEO = re.compile(r'\b(vos|sabés|tenés|querés|podés|hacés|decís|sos|mirá|fijate)\b', re.I)
BIG_NUMBER = re.compile(r'(?<![\d.,])\d{5,}(?![\d.,])')
DOT_DECIMAL = re.compile(r'(?<![\d.])\d+\.\d{1,2}(?![\d.])')


def problems(q, subject):
    """Hard errors drop the question; warnings travel with it as check notes."""
    errors, warnings = [], []
    opts = q.get('options')
    if not isinstance(opts, list) or len(opts) != 4:
        return ['no tiene 4 alternativas'], []
    if len({norm(o) for o in opts}) != 4:
        errors.append('alternativas repetidas')
    if q.get('correct') not in opts:
        errors.append('la correcta no es una de las alternativas')
    if q.get('difficulty') not in MIX:
        errors.append('dificultad inválida')
    text_limit = LIMITS['text_reading'] if subject in READING else LIMITS['text']
    if len(q.get('text', '')) > text_limit:
        warnings.append(f'enunciado largo ({len(q["text"])} caracteres)')
    if any(len(o) > LIMITS['option'] for o in opts):
        warnings.append('alternativa larga')
    if any(BANNED.search(o) for o in opts):
        errors.append('alternativa del tipo «todas/ninguna de las anteriores»')
    blob = ' '.join([q.get('text', ''), *opts, q.get('hint', ''), q.get('clue', '')])
    if VOSEO.search(blob):
        warnings.append('posible voseo')
    if subject != 'ingles' and BIG_NUMBER.search(blob):
        warnings.append('número sin punto de miles')
    if subject != 'ingles' and DOT_DECIMAL.search(blob):
        warnings.append('posible punto decimal')
    if not q.get('hint'):
        warnings.append('sin explicación')
    return errors, warnings


def balance_positions(questions, seed):
    """The game shows options in stored order: spread the correct one over the four places."""
    rng = random.Random(seed)
    slots = [i % 4 for i in range(len(questions))]
    rng.shuffle(slots)
    for q, slot in zip(questions, slots):
        others = [o for o in q['options'] if o != q['correct']]
        rng.shuffle(others)
        others.insert(slot, q['correct'])
        q['options'] = others


def work_file(grade, subject, code):
    return WORK / grade / subject / f'{code}.json'


def generate_one(grade, subject, oa, units, redo):
    path = work_file(grade, subject, oa['code'])
    if path.exists() and not redo:
        return f'{subject} {oa["code"]}: ya existe'
    prompt = writer_prompt(subject, grade, oa, units)
    text, job = ask('ask_codex', {'prompt': prompt, **WRITER}, path.with_suffix('.job'))
    data = parse_json(text)
    seen = {norm(t) for t in existing_questions(subject, grade, oa['code'])}
    kept, dropped = [], []
    for q in data.get('questions', []):
        errors, warnings = problems(q, subject)
        if norm(q.get('text', '')) in seen:
            errors.append('repetida')
        if errors:
            dropped.append({'text': q.get('text'), 'errors': errors})
            continue
        seen.add(norm(q['text']))
        notes = q.get('option_notes') if isinstance(q.get('option_notes'), dict) else {}
        kept.append({
            'oa_code': oa['code'], 'difficulty': q['difficulty'], 'text': q['text'].strip(),
            'options': [o.strip() for o in q['options']], 'correct': q['correct'].strip(),
            'hint': (q.get('hint') or '').strip(), 'clue': (q.get('clue') or '').strip(),
            'option_notes': {k: v for k, v in notes.items() if k in q['options'] and k != q['correct']},
            'warnings': warnings,
        })
    balance_positions(kept, f'{grade}-{subject}-{oa["code"]}')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'oa': oa['code'], 'source': f'ia:{WRITER["model"]}', 'job': job,
                                'questions': kept, 'dropped': dropped}, ensure_ascii=False, indent=1) + '\n')
    return f'{subject} {oa["code"]}: {len(kept)} preguntas' + (f', {len(dropped)} descartadas' if dropped else '')


def check_one(grade, subject, oa, redo):
    path = work_file(grade, subject, oa['code'])
    if not path.exists():
        return f'{subject} {oa["code"]}: sin borradores'
    doc = json.loads(path.read_text())
    if doc.get('checked') and not redo:
        return f'{subject} {oa["code"]}: ya verificada'
    qs = doc['questions']
    text, job = ask('ask_grok', {'prompt': checker_prompt(subject, grade, oa, qs), **CHECKER},
                    path.with_suffix('.check-job'))
    answers = {a.get('i'): a for a in parse_json(text).get('answers', [])}
    flagged = 0
    for i, q in enumerate(qs):
        a = answers.get(i) or {}
        notes = []
        if not a:
            notes.append('el verificador no la respondió')
        elif norm(a.get('answer', '')) != norm(q['correct']):
            notes.append(f'el verificador eligió «{a.get("answer")}»')
        if a.get('problem'):
            notes.append(f'verificador: {a["problem"]}')
        q['check'] = notes
        flagged += bool(notes)
    doc['checked'] = {'model': CHECKER['model'], 'job': job}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    return f'{subject} {oa["code"]}: {flagged} de {len(qs)} marcadas'


def build(grade):
    OUT.mkdir(parents=True, exist_ok=True)
    by_subject = {}
    for subject, oa, _ in quiz_oas(grade):
        path = work_file(grade, subject, oa['code'])
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        for q in doc['questions']:
            note = '; '.join(q.get('warnings', []) + q.get('check', []))
            by_subject.setdefault(subject, []).append({
                **{k: q[k] for k in ('oa_code', 'difficulty', 'text', 'options', 'correct', 'hint', 'clue', 'option_notes')},
                'source': doc['source'], 'check_note': note or None,
            })
    for subject, qs in by_subject.items():
        (OUT / f'{subject}_{grade}.json').write_text(json.dumps(qs, ensure_ascii=False, indent=1) + '\n')
        print(f'{subject}_{grade}.json: {len(qs)} borradores, {sum(1 for q in qs if q["check_note"])} con observaciones')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('step', choices=['generar', 'verificar', 'armar'])
    ap.add_argument('--grade', default='5b')
    ap.add_argument('--subjects')
    ap.add_argument('--only')
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--redo', action='store_true')
    args = ap.parse_args()
    if args.step == 'armar':
        build(args.grade)
        return
    subjects = args.subjects.split(',') if args.subjects else None
    only = args.only.split(',') if args.only else None
    tasks = list(quiz_oas(args.grade, subjects, only))

    def run(task):
        subject, oa, units = task
        try:
            if args.step == 'generar':
                return generate_one(args.grade, subject, oa, units, args.redo)
            return check_one(args.grade, subject, oa, args.redo)
        except Exception as err:  # one OA failing must not stop the rest
            return f'{subject} {oa["code"]}: ERROR {err}'

    print(f'{len(tasks)} OA', flush=True)
    with ThreadPoolExecutor(args.workers) as pool:
        for line in pool.map(run, tasks):
            print(line, flush=True)


if __name__ == '__main__':
    sys.exit(main())
