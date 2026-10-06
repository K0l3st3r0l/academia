"""World map islands: GPT image -> WebP for the web + level positions + where one can walk.

Each island is one image (art/incoming/mundo/<image>.png, made with art/gen.sh from the
prompts in art/mapa/). The prompt asks for plain stone pads along the path; they are found
here by their colour, so the level buttons drawn on top always sit on a pad. The topmost pad
is the plaza of the unit's final challenge; the rest are the levels, bottom to top.

The student walks the island with the keyboard or by tapping, so each island also gets a walk
grid: the sandy path with the pads and the plaza, a strip of ground on each side of it (the path
is barely wider than a pad, and the character needs room to stand next to a level without
covering it) and the dock, a hand-drawn "dock" polygon in the layout because the planks blend
with the posts and the cliff by colour. The strip does not widen the dock: past its edges is air.

Usage: build_world.py   (writes frontend/public/world/<image>-<width>.webp and the
                         "nodes", "boss.at" and "walk" of every island in shared/world/*.json)
"""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/incoming/mundo'
OUT = ROOT / 'frontend/public/world'
LAYOUTS = ROOT / 'shared/world'
WIDTHS = (640, 1024)  # phone and desktop; the map column is at most ~520 CSS px wide
PAD = np.array([227, 199, 172], float)  # top face of the stone pads
PAD_TOLERANCE = 16
MIN_PAD_AREA = 800
WALK_CELL = 8  # island pixels per cell of the walk grid
VERGE = 40  # island pixels of ground beside the path where one may also stand


def pad_mask(rgb):
    near = np.linalg.norm(rgb - PAD, axis=-1) < PAD_TOLERANCE
    return ndimage.binary_fill_holes(ndimage.binary_opening(near, iterations=2))


def sand_mask(rgb):
    """The sandy path: warm beige, lighter and less saturated than the ochre ground and the rock."""
    a = rgb / 255
    top, low = a.max(-1), a.min(-1)
    span = np.maximum(top - low, 1e-6)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.where(top == r, ((g - b) / span) % 6, np.where(top == g, (b - r) / span + 2, (r - g) / span + 4)) * 60
    sat = span / np.maximum(top, 1e-6)
    return (hue > 28) & (hue < 46) & (sat > 0.22) & (sat < 0.53) & (top > 0.80)


def walk_grid(rgb, island):
    """Cells where the student's feet may stand, run-length encoded row by row (blocked first)."""
    path = sand_mask(rgb) | pad_mask(rgb)
    path = ndimage.binary_opening(ndimage.binary_closing(path, iterations=3), iterations=2)
    labels, _ = ndimage.label(path)
    x, y = island['boss']['at']
    path = labels == labels[y, x]  # only what connects to the challenge: no stray sand patches
    dock = Image.new('1', (rgb.shape[1], rgb.shape[0]))
    ImageDraw.Draw(dock).polygon([tuple(p) for p in island['dock']], fill=1)
    dock = np.asarray(dock, bool)
    verge = ndimage.distance_transform_edt(~path) <= VERGE
    verge &= ~ndimage.binary_dilation(dock, iterations=VERGE)  # around the dock there is only air
    walk = ndimage.binary_closing(path | verge | dock, iterations=4)
    rows, cols = rgb.shape[0] // WALK_CELL, rgb.shape[1] // WALK_CELL
    cells = walk[:rows * WALK_CELL, :cols * WALK_CELL].reshape(rows, WALK_CELL, cols, WALK_CELL).mean((1, 3)) > 0.5
    flat = cells.ravel()
    edges = np.flatnonzero(np.diff(flat.astype(np.int8))) + 1
    runs = np.diff(np.concatenate(([0], edges, [flat.size]))).tolist()
    if flat[0]:
        runs.insert(0, 0)
    return {'cell': WALK_CELL, 'cols': cols, 'rows': rows, 'runs': ','.join(map(str, runs))}


def find_pads(rgb):
    labels, count = ndimage.label(pad_mask(rgb))
    pads = []
    for i in range(1, count + 1):
        mask = labels == i
        if mask.sum() < MIN_PAD_AREA:
            continue
        y, x = ndimage.center_of_mass(mask)
        pads.append([round(x), round(y)])
    return sorted(pads, key=lambda p: -p[1])


def dump(layout):
    text = json.dumps(layout, ensure_ascii=False, indent=2)
    # Coordinate pairs and level lists on one line each, so the layout stays readable by hand.
    return re.sub(r'\[\s+([^\[\]{}]*?)\s+\]', lambda m: '[' + ', '.join(v.strip() for v in m.group(1).split(',')) + ']', text) + '\n'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for layout_path in sorted(LAYOUTS.glob('*.json')):
        layout = json.loads(layout_path.read_text())
        for world_map in layout['maps']:
            for island in world_map['islands']:
                src = SRC / f"{island['image']}.png"
                img = Image.open(src).convert('RGB')
                if img.size != (island['width'], island['height']):
                    raise SystemExit(f"{src.name}: mide {img.size}, el layout dice {island['width']}x{island['height']}")
                pads = find_pads(np.asarray(img).astype(float))
                levels = island['levels']
                if len(pads) != len(levels) + 1:
                    raise SystemExit(f"{src.name}: {len(pads)} discos, se esperaban {len(levels)} niveles + la plaza del desafío")
                island['nodes'] = pads[:-1]
                island['boss']['at'] = pads[-1]
                island['walk'] = walk_grid(np.asarray(img).astype(float), island)
                for width in WIDTHS:
                    height = round(img.height * width / img.width)
                    img.resize((width, height), Image.LANCZOS).save(
                        OUT / f"{island['image']}-{width}.webp", 'WEBP', quality=82, method=6)
                print(f"{src.name}: {len(levels)} niveles + desafío")
        layout_path.write_text(dump(layout))


if __name__ == '__main__':
    main()
