"""Token coin for large sizes: the gold coin stamped with an hourglass.

The user chose it on 2026-10-07, over the star coin of 2026-10-05: it first appeared in the
lobby's HUD icons (art/academia/v2/raw/ui-iconos.png, cut by art/academia/v2/cortar.py into
piezas/ico_ficha.png). The name stays «tokens». Small sizes are an SVG drawn to match
(frontend/src/components/TokenCoin.jsx).

Usage: build_coin.py   (writes frontend/public/coin.webp)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def main():
    img = Image.open(ROOT / 'art/academia/v2/piezas/ico_ficha.png').convert('RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    img.thumbnail((256, 256), Image.LANCZOS)
    img.save(ROOT / 'frontend/public/coin.webp', 'WEBP', quality=92, method=6)


if __name__ == '__main__':
    main()
