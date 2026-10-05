"""Produce character parts listed in manifest.json.

For each part not yet cut: ask GPT (art/gen.sh) for an edit of the template, check it
lines up, cut the part out and save it to art/piezas/recortes/<id>.png. A rejected or
empty edit is retried once. Every attempt is logged to art/piezas/produccion.jsonl.

Usage: produce.py [--kinds hair,eyes] [--only id1,id2] [--workers 4] [--limit N] [--recut]
--recut cuts again every part from its saved GPT image, without generating anything.

Every hairstyle also gets a version pressed under a hat (<id>-con-gorro, kind hair-hat), drawn
on maestra-gorro.png (hat_template.py) with the hairstyle's own image as reference.
"""
import argparse
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

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
KEEP_CHILD = ('Keep everything else pixel-identical to the attached image: same child, same hair, face, skin, '
              'body, arms, hands, legs, bare feet, pose, proportions, size and exact position on the canvas, same '
              'plain white background, same 1024x1536 portrait canvas. Flat vector illustration, thick dark navy '
              'outlines, one shadow tone, no gradients, no text.')
KEEP_BALD = ('Keep everything else pixel-identical to the attached image: same bald head, same face, magenta '
             'clothes, skin, body, bare feet, pose, proportions, size and exact position on the canvas, same plain '
             'white background, same 1024x1536 portrait canvas. Flat vector illustration, thick dark navy '
             'outlines, one shadow tone, no gradients, no text.')
# Clothes come in one recolorable main color; the browser repaints that color family.
MAIN = 'Main color medium blue (#3B82F6), small details in white.'
CLOTHES_ASK = {
    'top': ('Edit the attached image of a 10-year-old child character. Replace ONLY the magenta t-shirt with {desc}. '
            + MAIN + ' It must fully cover everything the magenta t-shirt covers now. Do not change the magenta '
            'shorts. ' + KEEP_CHILD),
    'dress': ('Edit the attached image of a 10-year-old child character. Replace the magenta t-shirt and the magenta '
              'shorts with {desc}. ' + MAIN + ' It must fully cover everything the magenta t-shirt and shorts cover '
              'now. ' + KEEP_CHILD),
    'bottom': ('Edit the attached image of a 10-year-old child character. Replace ONLY the magenta shorts with '
               '{desc}. ' + MAIN + ' It must fully cover everything the magenta shorts cover now. Do not change the '
               'magenta t-shirt. ' + KEEP_CHILD),
    'shoes': ('Edit the attached image of a 10-year-old child character. Add ONLY {desc} on both bare feet. Main '
              'color medium blue (#3B82F6) with white soles and white details. Do not change the clothes. '
              + KEEP_CHILD),
}
UNDER_HAT_SUFFIX = '-con-gorro'
UNDER_HAT_ASK = (
    'Edit the first attached image (a bald, faceless child template wearing a small magenta cap). Add ONLY hair: '
    'the same hairstyle as in the second attached image, a close-up of another child ({desc}), as it looks when '
    'the child wears a hat. The magenta cap stands for the hat and the hair is pressed flat under it: no hair '
    "above, over or beside the cap. Right below the cap's edge the hair lies flat and close to the head, with no volume sticking out "
    'above the ears; lower down it falls and continues exactly like in the second image, with the same length '
    'and shape below the ears. Whatever the hairstyle has on top of the head (buns, puffs, a high ponytail, '
    "height) is hidden under the hat. Bangs show only below the cap's edge. Dark brown with one darker shadow "
    'tone and a few light highlights, in the art style of the second attached image. Do not change or recolor '
    'the magenta cap. Do not add a face. Keep everything else pixel-identical to the first attached image: same '
    'magenta cap, same blank face, magenta clothes, skin, body, bare feet, pose, proportions, size and exact '
    'position on the canvas, same plain white background, same 1024x1536 portrait canvas. Flat vector '
    'illustration, thick dark navy outlines, one shadow tone, no gradients, no text.')
ACCESSORY_ASK = ('Edit the attached image of a bald 10-year-old child character. Add ONLY {desc}, in the same art '
                 'style. Do not add hair and do not change the face, the clothes or the body. ' + KEEP_BALD)
ACCESSORIES = ('headwear', 'eyewear', 'neckwear', 'backwear', 'earwear')
# Which template each kind is an edit of (keys of manifest["templates"]).
TEMPLATE = {**{k: 'maestra' for k in ASK}, **{k: 'ropa' for k in CLOTHES_ASK}, **{k: 'cara' for k in ACCESSORIES},
            'hair-hat': 'gorro'}
# Below this many pixels the cut is empty or GPT drew the part somewhere else.
MIN_AREA = {'hair': 20000, 'eyes': 3000, 'brows': 1200, 'nose': 120, 'mouth': 500, 'top': 40000, 'dress': 60000,
            'bottom': 20000, 'shoes': 15000, 'headwear': 4000, 'eyewear': 1500, 'neckwear': 2500, 'backwear': 4000,
            'earwear': 300, 'hair-hat': 3000}


def all_parts(manifest):
    """The manifest's parts plus the under-hat version of every hairstyle."""
    parts = list(manifest['parts'])
    for p in manifest['parts']:
        if p['kind'] == 'hair':
            parts.append({'id': p['id'] + UNDER_HAT_SUFFIX, 'kind': 'hair-hat', 'of': p['id'], 'desc': p['desc']})
    return parts


def cut(part, template, raw):
    return extract(template, str(raw), part['kind'], drop_warm=part.get('dropWarm', False))


def prompt_for(part):
    kind = part['kind']
    if kind == 'hair-hat':
        return UNDER_HAT_ASK.format(desc=part['desc']) + '\n'
    if kind in ASK:
        return ('Edit the first attached image (a bald, faceless child template). '
                + ASK[kind].format(desc=part['desc']) + ' ' + KEEP + '\n')
    if kind in CLOTHES_ASK:
        return CLOTHES_ASK[kind].format(desc=part['desc']) + '\n'
    return ACCESSORY_ASK.format(desc=part['desc']) + '\n'


def head_closeup(hair_id):
    """The hairstyle's image cropped to the head: given whole, GPT took it for the image to edit
    and redrew the figure."""
    out = PIECES / 'referencias' / f'{hair_id}-cabeza.png'
    if not out.exists():
        out.parent.mkdir(exist_ok=True)
        Image.open(PIECES / f'{hair_id}.png').convert('RGB').crop((112, 0, 912, 800)).save(out)
    return out


def references(part, templates):
    """Face and hair parts also get the styled character for reference; clothes and accessories
    only their template (a second image made GPT redraw the whole figure)."""
    refs = [str(ROOT / templates[TEMPLATE[part['kind']]])]
    if part['kind'] == 'hair-hat':
        refs.append(str(head_closeup(part['of'])))
    elif part['kind'] in ASK:
        refs.append(str(ROOT / templates['estilo']))
    return refs
ATTEMPTS = 2
ATTEMPTS_UNDER_HAT = 3  # GPT redraws the whole figure more often with two figures attached


def log(entry):
    with LOG.open('a') as f:
        f.write(json.dumps({'at': time.strftime('%Y-%m-%dT%H:%M:%S'), **entry}, ensure_ascii=False) + '\n')


def produce(part, templates):
    pid, kind = part['id'], part['kind']
    prompt_file = PIECES / f'p-{pid}.txt'
    prompt_file.write_text(prompt_for(part))
    template = str(ROOT / templates[TEMPLATE[kind]])
    raw = PIECES / f'{pid}.png'
    # An image left by an earlier run is tried first: it already cost quota.
    if raw.exists():
        try:
            img, area = cut(part, template, raw)
            if area >= part.get('minArea', MIN_AREA[kind]):
                img.save(CUTS / f'{pid}.png')
                log({'id': pid, 'attempt': 0, 'result': 'ok', 'area': area, 'gen': 'reaprovechada'})
                return pid, 'ok (reaprovechada)'
        except MisalignedEdit:
            pass
        raw.unlink()
    for attempt in range(1, (ATTEMPTS_UNDER_HAT if kind == 'hair-hat' else ATTEMPTS) + 1):
        run = subprocess.run([str(GEN), str(raw), str(prompt_file), *references(part, templates)],
                             capture_output=True, text=True)
        summary = (run.stdout.strip().splitlines() or [''])[-1]
        if run.returncode != 0 or not raw.exists():
            log({'id': pid, 'attempt': attempt, 'result': 'sin imagen', 'detail': (run.stderr or run.stdout)[-300:]})
            continue
        try:
            img, area = cut(part, template, raw)
        except MisalignedEdit as err:
            log({'id': pid, 'attempt': attempt, 'result': 'rechazada', 'detail': str(err), 'gen': summary})
            continue
        if area < part.get('minArea', MIN_AREA[kind]):
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
        for part in all_parts(manifest):
            if args.only and part['id'] not in args.only.split(','):
                continue
            raw = PIECES / f"{part['id']}.png"
            if not raw.exists():
                continue
            try:
                img, area = cut(part, str(ROOT / manifest['templates'][TEMPLATE[part['kind']]]), raw)
                img.save(CUTS / f"{part['id']}.png")
                print(f"{part['id']}: {area} px", flush=True)
            except MisalignedEdit as err:
                print(f"{part['id']}: rechazada ({err})", flush=True)
        return
    CUTS.mkdir(parents=True, exist_ok=True)
    parts = [p for p in all_parts(manifest) if not (CUTS / f"{p['id']}.png").exists()]
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
