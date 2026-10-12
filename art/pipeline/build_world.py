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
PAD_TOLERANCE_OWN = 24  # an island with its own pad colour (estimated): its stone and plaza are more shaded
MIN_PAD_AREA = 800
WALK_CELL = 8  # island pixels per cell of the walk grid
VERGE = 40  # island pixels of ground beside the path where one may also stand


def pad_mask(rgb, pad=PAD):
    tolerance = PAD_TOLERANCE if pad is PAD else PAD_TOLERANCE_OWN
    near = np.linalg.norm(rgb - np.asarray(pad, float), axis=-1) < tolerance
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


def path_near_pads(rgb, pads):
    """Pixels the colour of the path where the pads sit. The pads are always on the path, so the
    band around each one teaches its sand, whatever the island: sand_mask alone is tuned to the
    Atacama ochre and missed the orange path of the Elqui valley (2026-10-12)."""
    colors = []
    for x, y in pads:
        # Just above and below the pad, where the path runs on; the sides may already be grass.
        strips = [rgb[max(0, y - 75):max(0, y - 40), x - 30:x + 30], rgb[y + 42:y + 70, x - 30:x + 30]]
        sand = np.concatenate([w.reshape(-1, 3) for w in strips])
        r, g, b = sand[:, 0], sand[:, 1], sand[:, 2]
        sand = sand[(r > 170) & (g > 130) & (r >= g) & (g >= b) & (r - b > 30)]
        if len(sand) > 60:
            colors.append(np.median(sand, axis=0))
    near = np.zeros(rgb.shape[:2], bool)
    for c in colors:
        near |= np.linalg.norm(rgb - c, axis=-1) < 18
    return near


def walk_grid(rgb, island):
    """Cells where the student's feet may stand, run-length encoded row by row (blocked first)."""
    pads = island['nodes'] + [island['boss']['at']]
    x, y = island['boss']['at']

    def connected(path):
        path = ndimage.binary_opening(ndimage.binary_closing(path, iterations=3), iterations=2)
        labels, _ = ndimage.label(path)
        # Only what connects to the challenge: no stray sand patches.
        return labels == labels[y, x] if labels[y, x] else np.zeros_like(path)

    base = sand_mask(rgb) | pad_mask(rgb, island.get('pad', PAD))
    path = connected(base)
    # Islands whose sand sand_mask already sees keep exactly that path; the learned colour only
    # comes in when some level would be cut off from the challenge.
    if not all(path[py, px] for px, py in pads):
        # Pads come in path order and close together, so a strip from each one to the next runs
        # along the path: it bridges the spots where the sand changes shade (2026-10-12, the palm grove).
        strips = Image.new('1', (rgb.shape[1], rgb.shape[0]))
        ImageDraw.Draw(strips).line([tuple(p) for p in pads], fill=1, width=46, joint='curve')
        # The learned sand counts only near that line: in a desert the ground around the path is
        # the same colour, and the whole island became walkable (2026-10-12, the saltpeter pampa).
        corridor = Image.new('1', (rgb.shape[1], rgb.shape[0]))
        ImageDraw.Draw(corridor).line([tuple(p) for p in pads], fill=1, width=180, joint='curve')
        learned = path_near_pads(rgb, pads) & np.asarray(corridor, bool)
        path = connected(base | learned | np.asarray(strips, bool))
    if not all(path[py, px] for px, py in pads):
        raise SystemExit(f"{island['image']}: hay niveles que el camino no une con la plaza del desafío")
    dock = Image.new('1', (rgb.shape[1], rgb.shape[0]))
    ImageDraw.Draw(dock).polygon([tuple(p) for p in island['dock']], fill=1)
    dock = np.asarray(dock, bool)
    verge = ndimage.distance_transform_edt(~path) <= VERGE
    a = rgb / 255
    verge &= ~((a.max(-1) > 0.75) & (a.max(-1) - a.min(-1) < 0.15 * a.max(-1)))  # no walls, no salt
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


def estimate_pad_color(rgb):
    """The stone colour of an island whose pads came out another shade: among the light, greyish
    ellipses shaped like a pad, the colour most of them share (snow or salt crusts are whiter)."""
    # Every pad is drawn as some light beige-grey stone, and its dark outline keeps it apart from
    # the path even when the sand is a similar colour.
    near = np.linalg.norm(rgb - PAD, axis=-1) < 45
    labels, count = ndimage.label(ndimage.binary_fill_holes(ndimage.binary_opening(near, iterations=2)))
    found = []
    for i in range(1, count + 1):
        mask = labels == i
        if mask.sum() < MIN_PAD_AREA:
            continue
        ys, xs = np.nonzero(mask)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if mask.sum() / (np.pi * w * h / 4) >= 0.85 and 1.3 <= w / h <= 3.2:
            found.append(np.median(rgb[mask], axis=0))
    if not found:
        return None
    found = np.array(found)
    votes = [(np.linalg.norm(found - c, axis=1) < 14).sum() for c in found]
    best = found[int(np.argmax(votes))]
    return [int(v) for v in np.median(found[np.linalg.norm(found - best, axis=1) < 14], axis=0).round()]


def find_pads(rgb, pad=PAD):
    labels, count = ndimage.label(pad_mask(rgb, pad))
    pads = []
    for i in range(1, count + 1):
        mask = labels == i
        if mask.sum() < MIN_PAD_AREA:
            continue
        # A pad is a full ellipse about twice as wide as tall; a pale animal or rock of the same
        # stone colour fills its box much less (2026-10-12, Torres del Paine: 0.51 and 0.67).
        ys, xs = np.nonzero(mask)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if mask.sum() / (np.pi * w * h / 4) < 0.85 or not 1.3 <= w / h <= 3.2:
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
                # An island whose stone came out another shade says so in its layout ("pad").
                pads = find_pads(np.asarray(img).astype(float), island.get('pad', PAD))
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
