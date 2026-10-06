"""Welcome page background: GPT image -> WebP for the web.

Two pictures of the same night scene over Atacama (made with art/gen.sh from the prompts in
art/portada/): a wide one for desktops and landscape tablets, whose centre is open sky for the
menu, and a tall one for phones, whose top half is open sky for the logo. The twinkles, glows
and meteors drawn on top are placed by hand on these pixels in
frontend/src/components/welcome/TitleBackdrop.jsx: regenerating a picture means re-placing them.

Usage: build_portada.py   (writes frontend/public/portada/<image>-<width>.webp)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/incoming/portada'
OUT = ROOT / 'frontend/public/portada'
WIDTHS = {'fondo-ancho': (960, 1536), 'fondo-alto': (640, 1024)}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, widths in WIDTHS.items():
        img = Image.open(SRC / f'{name}.png').convert('RGB')
        for width in widths:
            height = round(img.height * width / img.width)
            out = OUT / f'{name}-{width}.webp'
            img.resize((width, height), Image.LANCZOS).save(out, 'WEBP', quality=80, method=6)
            print(f'{out.name}: {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
