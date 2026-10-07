"""Cut the lobby v2 art (art/academia/v2/raw) out of its chroma green into transparent pieces.

Usage: cortar.py   (writes v2/piezas/*.png and v2/piezas/piezas.json with each piece's size)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'rig' / 'mascotas'))
from video_a_sprites import cut_chroma, keyed  # noqa: E402

HERE = Path(__file__).resolve().parent
RAW, OUT = HERE / 'raw', HERE / 'piezas'

# (piece, source, crop box in source pixels or None for the whole image)
CUTS = [
    ('galeria', 'arquitectura.png', (0, 40, 1536, 236)),
    ('baranda', 'arquitectura.png', (0, 236, 1536, 425)),
    ('columna', 'arquitectura.png', (60, 430, 290, 975)),
    ('colgante', 'arquitectura.png', (600, 620, 1536, 810)),
    ('suelo', 'suelo.png', (0, 200, 2172, 560)),
    ('escalera', 'escalera.png', None),
    ('cofre', 'cofre.png', None),
    ('cofre_abierto', 'cofre-abierto.png', None),
]
# Inventory icons: a 4 x 2 grid on one sheet, keyed by the catalogue's and the chests' item ids.
# Menu kit (ui-marcos.png) and HUD icons (ui-iconos.png): boxes in source pixels.
UI = {
    'ui_marco': (40, 47, 920, 668), 'ui_cinta': (923, 43, 1656, 280), 'ui_pergamino': (952, 278, 1633, 677),
    'ui_casilla': (29, 706, 218, 891), 'ui_etiqueta': (243, 715, 448, 883), 'ui_cerrar': (463, 739, 599, 874),
    'ui_boton_oro': (615, 757, 904, 861), 'ui_boton_teal': (917, 756, 1183, 866), 'ui_repisa': (1193, 743, 1645, 889),
}
HUD = {
    'ico_ficha': (49, 104, 337, 403), 'ico_chispa': (401, 106, 678, 399), 'ico_pieza': (754, 88, 1039, 420),
    'ico_mochila': (1075, 84, 1390, 417), 'ico_gestos': (1432, 111, 1725, 422), 'ico_objetivos': (29, 468, 352, 791),
    'ico_ajustes': (383, 478, 690, 786), 'ico_sonido': (761, 465, 1032, 781), 'ico_candado': (1086, 463, 1331, 794),
    'ico_libro': (1362, 481, 1756, 779),
}
ICONS = ['medallon', 'insignia', 'panuelo', 'sombrero', 'brujula', 'capa', 'linterna', 'mapa']


def cut(rgb, solid_inside=False):
    bg = rgb[3, 3].astype(int)
    key = keyed(rgb, bg)
    rgba, _ = cut_chroma(rgb, bg, key)
    if solid_inside:
        # The open chest's teal velvet is green enough to key out. Only green reachable from the
        # image border is background; anything enclosed by the chest keeps its own colour.
        outside = ndimage.binary_propagation(np.zeros_like(key, bool) | _border(key.shape) & (key > 0.5),
                                             mask=key > 0.35)
        inner = ndimage.binary_erosion(~outside, iterations=3)
        rgba[inner, :3] = rgb[inner]
        rgba[inner, 3] = 255
    return rgba


def _border(shape):
    b = np.zeros(shape, bool)
    b[0], b[-1], b[:, 0], b[:, -1] = True, True, True, True
    return b


def trim(rgba, box=None):
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    box = box or (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return rgba[box[1]:box[3], box[0]:box[2]], box


# The atrium ends at the outer edge of its two columns (source px), so against the plain wall it
# reads as columns standing in front of it instead of a picture with a hard vertical cut. Outside
# them, a soft shadow the columns cast on the wall. Size and coordinates stay those of the source.
ATRIUM_EDGES = (40, 1632)
SHADOW = 40


def atrium(rgb):
    h, w = rgb.shape[:2]
    left, right = ATRIUM_EDGES
    x = np.arange(w, dtype=float)
    inside = np.clip(np.minimum(x - left, right - x) / 4 + 0.5, 0, 1)  # 4 px antialiased edge
    shade = np.clip(1 - np.maximum(left - x, x - right) / SHADOW, 0, 1) ** 2 * 0.35
    alpha = np.maximum(inside, (1 - inside) * shade)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.where(inside[None, :, None] > 0, rgb, 0)
    out[..., 3] = np.round(np.broadcast_to(alpha, (h, w)) * 255).astype(np.uint8)
    return out


def main():
    OUT.mkdir(exist_ok=True)
    sizes = {}
    chest_box = None
    for name, src, crop in CUTS:
        rgb = np.asarray(Image.open(RAW / src).convert('RGB'))
        if crop:
            rgb = rgb[crop[1]:crop[3], crop[0]:crop[2]]
        rgba = cut(rgb, solid_inside=name.startswith('cofre'))
        if name.startswith('cofre'):
            # Both chest states share one box, so the closed and open chest line up when swapped.
            if chest_box is None:
                a = np.asarray(Image.open(RAW / 'cofre.png').convert('RGB'))
                b = np.asarray(Image.open(RAW / 'cofre-abierto.png').convert('RGB'))
                ma, mb = cut(a)[..., 3] > 8, cut(b)[..., 3] > 8
                ys, xs = np.nonzero(ma | mb)
                chest_box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
            rgba, _ = trim(rgba, chest_box)
        else:
            rgba, _ = trim(rgba)
        Image.fromarray(rgba).save(OUT / f'{name}.png')
        sizes[name] = [int(rgba.shape[1]), int(rgba.shape[0])]
        print(name, sizes[name])
    sheet = np.asarray(Image.open(RAW / 'objetos.png').convert('RGB'))
    h, w = sheet.shape[0] // 2, sheet.shape[1] // 4
    for i, name in enumerate(ICONS):
        cell = sheet[(i // 4) * h:(i // 4 + 1) * h, (i % 4) * w:(i % 4 + 1) * w]
        rgba = cut(cell)
        # Neighbouring icons reach into a grid cell (the hat's brim next to the neckerchief):
        # keep the cell's own icon, its biggest shape, plus parts at least a tenth of its size.
        labels, count = ndimage.label(rgba[..., 3] > 40)
        if count > 1:
            areas = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
            keep = np.isin(labels, 1 + np.nonzero(areas >= areas.max() * 0.1)[0])
            rgba[~ndimage.binary_dilation(keep, iterations=2), 3] = 0
        rgba, _ = trim(rgba)
        Image.fromarray(rgba).save(OUT / f'objeto_{name}.png')
        sizes[f'objeto_{name}'] = [int(rgba.shape[1]), int(rgba.shape[0])]
    for sheet_name, boxes in (('ui-marcos.png', UI), ('ui-iconos.png', HUD)):
        sheet = np.asarray(Image.open(RAW / sheet_name).convert('RGB'))
        for name, (x0, y0, x1, y1) in boxes.items():
            rgba, _ = trim(cut(sheet[y0:y1, x0:x1]))
            Image.fromarray(rgba).save(OUT / f'{name}.png')
            sizes[name] = [int(rgba.shape[1]), int(rgba.shape[0])]
    im = Image.open(RAW / 'muro.png').convert('RGB')
    im.save(OUT / 'muro.png')
    sizes['muro'] = list(im.size)
    atrio = atrium(np.asarray(Image.open(RAW / 'atrio.png').convert('RGB')))
    Image.fromarray(atrio).save(OUT / 'atrio.png')
    sizes['atrio'] = [atrio.shape[1], atrio.shape[0]]
    (OUT / 'piezas.json').write_text(json.dumps(sizes, indent=1))


if __name__ == '__main__':
    main()
