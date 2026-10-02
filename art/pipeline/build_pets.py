"""Companion pets: GPT images on white -> transparent WebP for the web.

Each image is one pet at one growth stage (art/incoming/mascotas/<species>-<stage>.png, made
with art/gen.sh from the prompts in art/mascotas/). The white background connected to the
border is removed, and the anti-aliased rim along the outline is un-mixed from that white:
the app is dark, and a rim left half white would show as a light halo.

Usage: build_pets.py   (writes frontend/public/pets/<species>-<stage>.webp)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/incoming/mascotas'
OUT = ROOT / 'frontend/public/pets'
CATALOG = ROOT / 'shared/pet-catalog.json'
SIZE = 384  # longest side: the largest place a pet is shown is ~190 px on a 2x screen
INK = np.array([26, 26, 46], float)
LUM = np.array([0.299, 0.587, 0.114])


def cut_out(img):
    a = np.asarray(img.convert('RGBA')).astype(float)
    rgb = a[..., :3]
    l = rgb @ LUM
    white = (rgb.min(-1) > 232) & (rgb.max(-1) - rgb.min(-1) < 20)
    labels, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    background = np.isin(labels, list(border))
    a[background, 3] = 0
    # Rim: pixels next to the removed background that are lighter than the outline are a mix
    # of outline and white. Keep the outline color, with the share of it as alpha.
    rim = ndimage.binary_dilation(background, np.ones((5, 5))) & ~background
    ink_l = INK @ LUM
    share = np.clip((255 - l) / (255 - ink_l), 0, 1)
    soft = rim & (rgb.max(-1) - rgb.min(-1) < 40)
    a[soft, 3] = np.minimum(a[soft, 3], share[soft] * 255)
    a[soft, :3] = INK
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    catalog = json.loads(CATALOG.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for species in catalog['species']:
        for stage in catalog['stages']:
            src = SRC / f"{species['id']}-{stage['stage']}.png"
            if not src.exists():
                print('falta', src.name)
                continue
            img = cut_out(Image.open(src))
            img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
            img.thumbnail((SIZE, SIZE), Image.LANCZOS)
            dst = OUT / f"{species['id']}-{stage['stage']}.webp"
            img.save(dst, 'WEBP', quality=90, method=6)
            total += dst.stat().st_size
    print(f'{total / 1024:.0f} KB en total')


if __name__ == '__main__':
    main()
