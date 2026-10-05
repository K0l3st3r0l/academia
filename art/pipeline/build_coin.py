"""Token coin for large sizes: the star coin (front view) from the coin sheet.

art/incoming/moneda-hoja.png holds four designs in columns, each drawn front-on and tilted
below; the user chose the star (first column) on 2026-10-05. Small sizes are an SVG drawn
to match (frontend/src/components/TokenCoin.jsx).

Usage: build_coin.py   (writes frontend/public/coin.webp)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from build_pets import cut_out

ROOT = Path(__file__).resolve().parents[2]


def main():
    sheet = Image.open(ROOT / 'art/incoming/moneda-hoja.png').convert('RGBA')
    column = sheet.crop((0, 0, sheet.width // 4, sheet.height))
    a = np.asarray(cut_out(column)).copy()
    labels, n = ndimage.label(a[..., 3] > 8)
    sizes = ndimage.sum(np.ones(labels.shape), labels, range(1, n + 1))
    # The front-view coin is the largest shape in the upper half (the tilted one sits below).
    upper = [i + 1 for i in range(n)
             if ndimage.center_of_mass(a[..., 3] > 8, labels, i + 1)[0] < sheet.height * 0.45]
    coin = max(upper, key=lambda i: sizes[i - 1])
    a[labels != coin, 3] = 0
    img = Image.fromarray(a, 'RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    img.thumbnail((256, 256), Image.LANCZOS)
    img.save(ROOT / 'frontend/public/coin.webp', 'WEBP', quality=92, method=6)


if __name__ == '__main__':
    main()
