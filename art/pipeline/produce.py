"""Produce character parts listed in manifest.json.

For each part not yet cut: ask GPT (art/gen.sh) for an edit of the template, check it
lines up, cut the part out and save it to art/piezas/recortes/<id>.png. A rejected or
empty edit is retried once. Every attempt is logged to art/piezas/produccion.jsonl.

Usage: produce.py [--kinds hair,eyes] [--only id1,id2] [--workers 4] [--limit N] [--recut]
--recut cuts again every part from its saved GPT image, without generating anything.
"""
import argparse
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract import MisalignedEdit, extract  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]  # academia/
PIECES = ROOT / 'art/piezas'
CUTS = PIECES / 'recortes'
LOG = PIECES / 'produccion.jsonl'
GEN = ROOT / 'art/gen.sh'

KEEP = ('Keep everything else pixel-identical to the first attached image: same bald head, blank face, '
        'magenta clothes, skin, body, bare feet, pose, proportions, size and exact position on the canvas, '
        'same plain white background, same 1024x1536 portrait canvas. Flat vector illustration, thick dark '
        'navy outlines, one shadow tone, no gradients, no text.')
ASK = {
    'hair': ('Add ONLY {desc}, in dark brown with one darker shadow tone and a few light highlights, in the art '
             'style of the second attached image. Do not add a face.'),
    'eyes': ('Add ONLY a pair of eyes on the blank face: {desc}. Same eye size and position as the eyes of the '
             'character in the second attached image. Do NOT add eyebrows, nose, mouth, blush or hair.'),
    'brows': ('Add ONLY a pair of eyebrows on the blank face: {desc}, in the same position as the eyebrows of the '
              'character in the second attached image. Do NOT add eyes, nose, mouth or hair.'),
    'nose': ('Add ONLY a nose on the blank face: {desc}, drawn in a slightly darker shade of the skin tone, in the '
             'same position as the nose of the character in the second attached image. Do NOT add eyes, '
             'eyebrows, mouth or hair.'),
    'mouth': ('Add ONLY a mouth on the blank face: {desc}, in the same position as the mouth of the character in '
              'the second attached image. Do NOT add eyes, eyebrows, nose or hair.'),
}
# Below this many pixels the cut is empty or GPT drew the part somewhere else.
MIN_AREA = {'hair': 20000, 'eyes': 3000, 'brows': 1200, 'nose': 120, 'mouth': 500}
ATTEMPTS = 2


def log(entry):
    with LOG.open('a') as f:
        f.write(json.dumps({'at': time.strftime('%Y-%m-%dT%H:%M:%S'), **entry}, ensure_ascii=False) + '\n')


def produce(part, templates):
    pid, kind = part['id'], part['kind']
    prompt_file = PIECES / f'p-{pid}.txt'
    prompt_file.write_text('Edit the first attached image (a bald, faceless child template). '
                           + ASK[kind].format(desc=part['desc']) + ' ' + KEEP + '\n')
    raw = PIECES / f'{pid}.png'
    # An image left by an earlier run is tried first: it already cost quota.
    if raw.exists():
        try:
            img, area = extract(str(ROOT / templates['maestra']), str(raw), kind)
            if area >= MIN_AREA[kind]:
                img.save(CUTS / f'{pid}.png')
                log({'id': pid, 'attempt': 0, 'result': 'ok', 'area': area, 'gen': 'reaprovechada'})
                return pid, 'ok (reaprovechada)'
        except MisalignedEdit:
            pass
        raw.unlink()
    for attempt in range(1, ATTEMPTS + 1):
        run = subprocess.run([str(GEN), str(raw), str(prompt_file), str(ROOT / templates['maestra']),
                              str(ROOT / templates['estilo'])], capture_output=True, text=True)
        summary = (run.stdout.strip().splitlines() or [''])[-1]
        if run.returncode != 0 or not raw.exists():
            log({'id': pid, 'attempt': attempt, 'result': 'sin imagen', 'detail': (run.stderr or run.stdout)[-300:]})
            continue
        try:
            img, area = extract(str(ROOT / templates['maestra']), str(raw), kind)
        except MisalignedEdit as err:
            log({'id': pid, 'attempt': attempt, 'result': 'rechazada', 'detail': str(err), 'gen': summary})
            continue
        if area < MIN_AREA[kind]:
            log({'id': pid, 'attempt': attempt, 'result': 'vacía', 'detail': f'{area} px', 'gen': summary})
            continue
        img.save(CUTS / f'{pid}.png')
        log({'id': pid, 'attempt': attempt, 'result': 'ok', 'area': area, 'gen': summary})
        return pid, 'ok'
    return pid, 'falló'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kinds')
    ap.add_argument('--only')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--limit', type=int)
    ap.add_argument('--recut', action='store_true')
    args = ap.parse_args()

    manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
    if args.recut:
        for part in manifest['parts']:
            raw = PIECES / f"{part['id']}.png"
            if not raw.exists():
                continue
            try:
                img, area = extract(str(ROOT / manifest['templates']['maestra']), str(raw), part['kind'])
                img.save(CUTS / f"{part['id']}.png")
                print(f"{part['id']}: {area} px", flush=True)
            except MisalignedEdit as err:
                print(f"{part['id']}: rechazada ({err})", flush=True)
        return
    CUTS.mkdir(parents=True, exist_ok=True)
    parts = [p for p in manifest['parts'] if not (CUTS / f"{p['id']}.png").exists()]
    if args.kinds:
        parts = [p for p in parts if p['kind'] in args.kinds.split(',')]
    if args.only:
        parts = [p for p in parts if p['id'] in args.only.split(',')]
    parts = parts[: args.limit] if args.limit else parts
    print(f'{len(parts)} piezas por producir', flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        for pid, result in pool.map(lambda p: produce(p, manifest['templates']), parts):
            print(f'{pid}: {result}', flush=True)


if __name__ == '__main__':
    main()
