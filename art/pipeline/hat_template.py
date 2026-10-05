"""Template for hair under a hat: the mannequin wearing a plain magenta cap that hugs the head.

GPT draws each hairstyle again on this template as it looks pressed under a hat; the browser
uses that version whenever the student wears a hat that flattens hair (clipsHair). The cap's
lower edge runs a little above the highest lower edge of those hats, so every real hat covers
where the hair starts. Magenta is the template's chroma key: extract.py never keeps it as hair.

Usage: hat_template.py  (reads manifest.json and the hat cuts, writes art/piezas/maestra-gorro.png)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
PIECES = ROOT / 'art/piezas'
OUT = PIECES / 'maestra-gorro.png'
MAGENTA = (246, 8, 251)
INK = (10, 8, 14)
LINE = 8         # outline width of the template drawing
MARGIN = 8       # cap edge above the highest hat edge, so hats hide where the hair starts
HEAD_X = (342, 658)  # columns where every hat's lowest pixel is its edge over the forehead


def hat_bottoms(hats):
    bottoms = []
    for hat in hats:
        alpha = np.asarray(Image.open(PIECES / 'recortes' / f'{hat}.png'))[..., 3] > 128
        rows = np.arange(alpha.shape[0])[:, None]
        bottoms.append(np.where(alpha.any(0), (alpha * rows).max(0), 10 ** 6))
    return np.min(bottoms, axis=0)


def cap_edge(width, hats):
    edge = hat_bottoms(hats).astype(float) - MARGIN
    x0, x1 = HEAD_X
    edge[:x0], edge[x1:] = edge[x0], edge[x1 - 1]
    return ndimage.gaussian_filter1d(ndimage.minimum_filter1d(edge, 15), 6)[:width]


def head_mask(t):
    head = t.min(-1) < 225
    head[345:] = False
    head = ndimage.binary_fill_holes(head)
    labels, n = ndimage.label(head)
    return labels == 1 + np.argmax(ndimage.sum(head, labels, range(1, n + 1)))


def main():
    manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
    hats = [p['id'] for p in manifest['parts'] if p.get('clipsHair')]
    t = np.asarray(Image.open(ROOT / manifest['templates']['maestra']).convert('RGB')).copy()
    h, w = t.shape[:2]
    edge = cap_edge(w, hats)
    rows = np.arange(h)[:, None]
    cap = ndimage.binary_dilation(head_mask(t), iterations=6) & (rows < edge[None, :])
    cap = ndimage.gaussian_filter(cap.astype(float), 2) > 0.5
    inner = ndimage.binary_erosion(cap, iterations=LINE)
    t[cap] = INK
    t[inner] = MAGENTA
    Image.fromarray(t).save(OUT)
    print(f'{OUT.relative_to(ROOT)}: borde del gorro y={edge[500]:.0f} al centro, {edge[HEAD_X[0]]:.0f} a los lados')


if __name__ == '__main__':
    main()
