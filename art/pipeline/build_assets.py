"""Turn the master template and the cut parts into web assets.

Each layer is split (decompose.py) into what keeps its color and the shade map of what the
browser recolors (skin, hair, eyes, clothes), scaled to half size (512x768, enough for a 2x
screen at 384 px tall) and cropped to its content. parts.json records where each crop goes
and which color families its map holds.

Usage: build_assets.py   (reads art/piezas, writes frontend/public/character/)
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
from recolor import INK  # noqa: E402
import decompose as D  # noqa: E402
from produce import UNDER_HAT_SUFFIX  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PIECES = ROOT / 'art/piezas'
OUT = ROOT / 'frontend/public/character'
SCALE = 0.5


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


# Color families each kind of layer is split into (see decompose.py). Every layer also looks
# for skin: GPT redraws ears, foreheads, necks and arms around what it adds.
SKIN_SECONDARY = ('skin', D.SKIN_SOURCE, 'skin-secondary', False)
PRIMARY = {'hair': ('hair', 'hair', True), 'hair-hat': ('hair', 'hair', True), 'brows': ('hair', 'hair', True),
           'eyes': ('eye', 'eye', False),
           'top': ('top', 'cloth', False), 'dress': ('top', 'cloth', False),
           'bottom': ('bottom', 'cloth', False), 'shoes': ('shoes', 'cloth', False)}


def families_for(kind, rgba):
    if kind in ('body', 'nose'):
        return [('skin', D.SKIN_SOURCE, 'skin', False)]
    if kind in PRIMARY:
        role, pkey, warm = PRIMARY[kind]
        # Clothes are drawn blue with white details: the blue family is what gets repainted.
        source = dominant_color(rgba, exclude_white=True, chromatic=kind == 'eyes')
        return [(role, source, pkey, warm), SKIN_SECONDARY]
    if kind == 'mouth':
        return [SKIN_SECONDARY]
    return [('skin', D.SKIN_SOURCE, 'skin-accessory', False)]


def clean_input(rgba, kind):
    """Two leftovers of the GPT edits that the browser should never show."""
    a = rgba.copy()
    rgb = a[..., :3].astype(int)
    # A faint light haze GPT leaves around what it adds (seen beside the legs): nothing real
    # in the drawing is light gray and translucent, white details are opaque.
    haze = (a[..., 3] < 128) & (rgb.min(-1) > 120) & (rgb.max(-1) - rgb.min(-1) < 30)
    a[haze, 3] = 0
    # Thin strips of opaque background white outside the outline (beside the jeans). Real white
    # parts (socks, collars, soles) are wide areas; a strip lies almost entirely along the edge.
    white = (a[..., 3] > 0) & (rgb.min(-1) > 200) & (rgb.max(-1) - rgb.min(-1) < 30)
    near_edge = ndimage.binary_dilation(a[..., 3] == 0, np.ones((5, 5)))
    labels, n = ndimage.label(white, np.ones((3, 3)))
    if n:
        edge_share = ndimage.mean(near_edge, labels, range(1, n + 1))
        a[np.isin(labels, np.nonzero(edge_share > 0.6)[0] + 1), 3] = 0
    if kind in ('body', 'top', 'dress', 'bottom', 'shoes'):
        # The template wears magenta clothes so new garments can be told apart, and some of it
        # survives at garment edges (bottom of the hoodie). As outline ink it reads as a seam.
        # Not in hair or accessories: a hair tie can really be magenta.
        magenta = (rgb[..., 0] - rgb[..., 1] > 70) & (rgb[..., 2] - rgb[..., 1] > 50)
        a[magenta, :3] = INK
    return a


def split_back(rgba, below):
    """A wide brim seen from below shows its underside beside the head. That part is behind the
    hair hanging there, the rest of the hat in front: split along the polyline `below` (canvas
    pixels), under which the underside starts."""
    xs, ys = np.array(below, float).T
    line = np.interp(np.arange(rgba.shape[1]), xs, ys)
    rows = np.arange(rgba.shape[0])[:, None]
    front, back = rgba.copy(), rgba.copy()
    front[rows > line[None, :], 3] = 0
    # The back reaches a little under the front: each layer is scaled on its own, and where both
    # end on the same row their half-transparent edges let a light hairline through.
    back[rows <= line[None, :] - 4, 3] = 0
    return front, back


def export(src, dst_name, kind, clear_background=False, keep_colors=False):
    """Writes <id>.webp (what never changes color) and <id>.map.webp (shade and coverage of
    each color family, one strip per family, lossless). Returns the layer's parts.json entry.
    src is a path or an RGBA array. keep_colors: nothing is repainted (a straw hat is as orange
    as the template's skin and came out skin-colored)."""
    if isinstance(src, np.ndarray):
        img = Image.fromarray(src, 'RGBA')
    else:
        img = Image.open(src).convert('RGBA')
    if clear_background:
        img = without_background(img)
    rgba = clean_input(np.asarray(img), kind)
    fams = families_for(kind, rgba)
    if keep_colors:
        a = rgba.astype(float)
        fixed = np.dstack([a[..., :3], a[..., 3] / 255])
        comps = [(np.zeros(a.shape[:2]), np.zeros(a.shape[:2]))]
    else:
        fixed, comps = D.decompose(rgba, fams, hair_islands=kind in ('hair', 'hair-hat'))
    fixed, comps = D.to_half(fixed, comps)

    present = fixed[..., 3] > 8 / 255
    for cov, _ in comps:
        present |= cov > 8 / 255
    ys, xs = np.nonzero(present)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

    out = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    f = fixed[y0:y1, x0:x1]
    out[..., 3] = np.clip(np.round(f[..., 3] * 255), 0, 255)
    out[..., :3] = np.where(out[..., 3:4] > 0, np.clip(np.round(f[..., :3]), 0, 255), 0)
    Image.fromarray(out, 'RGBA').save(OUT / f'{dst_name}.webp', 'WEBP', quality=90, method=6)
    strips = D.encode_map([(c[y0:y1, x0:x1], d[y0:y1, x0:x1]) for c, d in comps])
    Image.fromarray(strips, 'RGB').save(OUT / f'{dst_name}.map.webp', 'WEBP', lossless=True, method=6)
    return {'kind': kind, 'file': f'{dst_name}.webp', 'map': f'{dst_name}.map.webp',
            'families': [name for name, *_ in fams],
            'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}


def main():
    manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {'body': export(PIECES / 'maestra.png', 'body', 'body', clear_background=True)}

    flags = {p['id']: {k: p[k] for k in ('clipsHair',) if p.get(k)} for p in manifest['parts']}
    for p in manifest['parts']:
        path = PIECES / 'recortes' / f"{p['id']}.png"
        if not path.exists():
            continue
        entry = {'label': p['label'], **flags.get(p['id'], {})}
        keep = p.get('keepColors', False)
        if p.get('backBelow'):
            front, back = split_back(np.asarray(Image.open(path).convert('RGBA')), p['backBelow'])
            back_id = p['id'] + '-atras'
            layers[p['id']] = {**export(front, p['id'], p['kind'], keep_colors=keep), **entry, 'back': back_id}
            layers[back_id] = export(back, back_id, 'headwear-back', keep_colors=keep)
        else:
            layers[p['id']] = {**export(path, p['id'], p['kind'], keep_colors=keep), **entry}
        # The hairstyle pressed under a hat, for hats that flatten hair (see produce.py).
        under = PIECES / 'recortes' / f"{p['id']}{UNDER_HAT_SUFFIX}.png"
        if p['kind'] == 'hair' and under.exists():
            layers[p['id'] + UNDER_HAT_SUFFIX] = export(under, p['id'] + UNDER_HAT_SUFFIX, 'hair-hat')
            layers[p['id']]['underHat'] = p['id'] + UNDER_HAT_SUFFIX
        print(p['id'], end=' ', flush=True)
    print()

    # Layer files keep their names, so browsers and Cloudflare could pair a cached old image with
    # a new parts.json: the browser asks for every image with ?v=<hash of all of them>.
    digest = hashlib.sha1()
    for v in sorted(layers.values(), key=lambda v: v['file']):
        digest.update((OUT / v['file']).read_bytes())
        digest.update((OUT / v['map']).read_bytes())
    doc = {'version': digest.hexdigest()[:10], 'canvas': {'w': int(1024 * SCALE), 'h': int(1536 * SCALE)}, 'layers': layers}
    (OUT / 'parts.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    total = sum((OUT / v['file']).stat().st_size + (OUT / v['map']).stat().st_size for v in layers.values())
    print(f'{len(layers)} capas · {total / 1024:.0f} KB en total')


if __name__ == '__main__':
    main()
