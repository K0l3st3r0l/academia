"""Turn the master template and the cut parts into web assets.

Each layer is scaled to half size (512x768, enough for a 2x screen at 384 px tall), cropped
to its content and saved as WebP with alpha. parts.json records where each crop goes and,
for recolorable layers, the source color the browser remaps from.

Usage: build_assets.py   (reads art/piezas, writes frontend/public/character/)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
from recolor import INK  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PIECES = ROOT / 'art/piezas'
OUT = ROOT / 'frontend/public/character'
SCALE = 0.5
SKIN_SOURCE = [244, 156, 98]
# Which color each kind of layer follows in the editor.
ROLE = {'body': 'skin', 'nose': 'skin', 'hair': 'hair', 'brows': 'hair', 'eyes': 'eye',
        'top': 'top', 'bottom': 'bottom', 'shoes': 'shoes', 'mouth': None}
# Clothes from the end-to-end test, until the clothing batch is produced.
EXTRA = [('top-raglan', 'top', 'recortes/prueba/top-raglan.png'),
         ('bottom-short', 'bottom', 'recortes/prueba/bottom-short.png'),
         ('calzado-zapatillas', 'shoes', 'recortes/prueba/zapatos.png')]


def dominant_color(rgba, exclude_white=False, chromatic=False):
    a = rgba[rgba[..., 3] > 200][:, :3].astype(int)
    a = a[np.abs(a - INK).sum(-1) > 90]  # not the outline
    a = a[a.sum(-1) > 60]  # not near-black pupils
    if exclude_white:
        a = a[a.min(-1) < 200]
    if chromatic:
        a = a[(a.max(-1) - a.min(-1)) > 30]  # an iris, not the grey shading of the eye white
    if not len(a):
        return None
    # Most frequent color after coarse quantization, then the mean of that bucket.
    q = (a // 24)
    keys, inv, counts = np.unique(q, axis=0, return_inverse=True, return_counts=True)
    top = counts.argmax()
    return [int(v) for v in a[inv.ravel() == top].mean(0)]


def without_background(img):
    """The template is drawn on white: clear the white connected to the border, keep eye whites."""
    a = np.asarray(img).copy()
    white = a[..., :3].min(-1) > 238
    labels, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    a[np.isin(labels, list(border)), 3] = 0
    return Image.fromarray(a, 'RGBA')


def export(src, dst_name, clear_background=False):
    img = Image.open(src).convert('RGBA')
    if clear_background:
        img = without_background(img)
    img = img.resize((int(img.width * SCALE), int(img.height * SCALE)), Image.LANCZOS)
    bbox = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    crop = img.crop(bbox)
    crop.save(OUT / f'{dst_name}.webp', 'WEBP', quality=90, method=6)
    return crop, bbox


def main():
    manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {}

    body, bbox = export(PIECES / 'maestra.png', 'body', clear_background=True)
    layers['body'] = {'kind': 'body', 'file': 'body.webp', 'x': bbox[0], 'y': bbox[1],
                      'w': body.width, 'h': body.height, 'role': 'skin', 'source': SKIN_SOURCE}

    sources = [(p['id'], p['kind'], PIECES / 'recortes' / f"{p['id']}.png", p['label']) for p in manifest['parts']]
    sources += [(pid, kind, PIECES / rel, None) for pid, kind, rel in EXTRA]
    for pid, kind, path, label in sources:
        if not path.exists():
            continue
        crop, bbox = export(path, pid)
        role = ROLE[kind]
        source = None
        if role == 'skin':
            source = SKIN_SOURCE
        elif role == 'eye':
            source = dominant_color(np.asarray(crop), exclude_white=True, chromatic=True)
        elif role in ('hair', 'shoes'):
            source = dominant_color(np.asarray(crop), exclude_white=True)
        elif role:
            source = dominant_color(np.asarray(crop))
        layers[pid] = {'kind': kind, 'label': label, 'file': f'{pid}.webp', 'x': bbox[0], 'y': bbox[1],
                       'w': crop.width, 'h': crop.height, 'role': role, 'source': source}

    doc = {'canvas': {'w': int(1024 * SCALE), 'h': int(1536 * SCALE)}, 'layers': layers}
    (OUT / 'parts.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    total = sum((OUT / v['file']).stat().st_size for v in layers.values())
    print(f'{len(layers)} capas · {total / 1024:.0f} KB en total')


if __name__ == '__main__':
    main()
