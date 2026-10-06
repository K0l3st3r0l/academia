"""World map islands: GPT image -> WebP for the web + level positions.

Each island is one image (art/incoming/mundo/<image>.png, made with art/gen.sh from the
prompts in art/mapa/). The prompt asks for plain stone pads along the path; they are found
here by their colour, so the level buttons drawn on top always sit on a pad. The topmost pad
is the plaza of the unit's final challenge; the rest are the levels, bottom to top.

Usage: build_world.py   (writes frontend/public/world/<image>-<width>.webp and the
                         "nodes" and "boss.at" of every island in shared/world/*.json)
"""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/incoming/mundo'
OUT = ROOT / 'frontend/public/world'
LAYOUTS = ROOT / 'shared/world'
WIDTHS = (640, 1024)  # phone and desktop; the map column is at most ~520 CSS px wide
PAD = np.array([227, 199, 172], float)  # top face of the stone pads
PAD_TOLERANCE = 16
MIN_PAD_AREA = 800


def find_pads(rgb):
    near = np.linalg.norm(rgb - PAD, axis=-1) < PAD_TOLERANCE
    near = ndimage.binary_fill_holes(ndimage.binary_opening(near, iterations=2))
    labels, count = ndimage.label(near)
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
                for width in WIDTHS:
                    height = round(img.height * width / img.width)
                    img.resize((width, height), Image.LANCZOS).save(
                        OUT / f"{island['image']}-{width}.webp", 'WEBP', quality=82, method=6)
                print(f"{src.name}: {len(levels)} niveles + desafío")
        layout_path.write_text(dump(layout))


if __name__ == '__main__':
    main()
