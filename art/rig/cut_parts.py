"""Side-view body for the platform rig (prototype): cut the parts sheet into pieces with pivots.

The sheet (art/incoming/rig/partes-cuerpo.png, made with art/gen.sh from art/rig/partes-cuerpo.txt
and the clothes template as reference) has five pieces in a row on white: torso with neck, upper
arm with sleeve, forearm with hand, thigh with shorts, lower leg with foot. Each piece is cut by
its silhouette and gets its joints in piece pixels: limbs pivot at the centre of their rounded
top end and hold the next piece at the centre of their rounded bottom end.

The head is drawn in profile too (art/rig/cabeza-perfil.txt): a front-facing head on a running
body looked stiff. The pet is a puppet of its own (art/rig/partes-zorro.txt): body, head, tail,
front leg and hind leg; the far legs reuse the near ones, darker.

Usage: cut_parts.py <out_dir> [scale]   (writes <name>.png per piece and rig.json)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / 'art/incoming/rig/partes-cuerpo.png'
HEAD = ROOT / 'art/incoming/rig/cabeza-perfil.png'
FOX = ROOT / 'art/incoming/rig/partes-zorro-v2.png'
# Standing still the body stays in profile and only the head turns to us: the child's from the
# clothes template (in the game, the student's own front head), the fox's drawn on its own.
TEMPLATE = ROOT / 'art/piezas/plantilla-ropa-nino.png'
FOX_HEAD_FRONT = ROOT / 'art/incoming/rig/cabeza-zorro-frente.png'
NAMES = ['torso', 'upper_arm', 'forearm', 'thigh', 'shin']
# Two rows: body, head, tail base, tail tip / front upper, front lower, hind upper, hind lower.
FOX_NAMES = ['body', 'head', 'tail_base', 'tail_tip', 'front_upper', 'front_lower', 'hind_upper', 'hind_lower']


def silhouette(rgb, ink=235):
    """Everything that is not paper, holes filled: the outline closes each piece."""
    solid = rgb.min(-1) < ink
    solid = ndimage.binary_closing(solid, iterations=2)
    return ndimage.binary_fill_holes(solid)


def cut(rgb, mask, scale):
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min() - 3, ys.max() + 4, xs.min() - 3, xs.max() + 4
    crop = rgb[y0:y1, x0:x1].astype(float)
    m = mask[y0:y1, x0:x1]
    # Soft edge: the outline's antialiasing fades into the paper, so alpha follows darkness there.
    edge = m & ~ndimage.binary_erosion(m, iterations=2)
    alpha = np.where(m, 1.0, 0.0)
    darkness = np.clip((255 - crop.min(-1)) / 120, 0, 1)
    alpha = np.where(edge, np.maximum(darkness, 0.0), alpha)
    rgba = np.dstack([np.where(edge[..., None], np.array([26, 26, 46]), crop), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    if scale != 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    return img, m


def end_centre(m, top):
    """Centre of the rounded end of a vertical limb: half its width in from the tip."""
    rows = np.nonzero(m.any(1))[0]
    tip = rows.min() if top else rows.max()
    probe = tip + (1 if top else -1) * max(4, len(rows) // 6)
    xs = np.nonzero(m[probe])[0]
    width = xs.max() - xs.min()
    y = tip + (1 if top else -1) * width / 2
    return [float((xs.min() + xs.max()) / 2), float(y)]


def pieces_of(path, count):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    mask = silhouette(rgb)
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = sorted((1 + np.argsort(sizes)[-count:]).tolist(), key=lambda i: ndimage.center_of_mass(labels == i)[1])
    return rgb, labels, keep


def at(m, fx, fy):
    """A point at a fraction of the piece's bounding box."""
    ys, xs = np.nonzero(m)
    return [float(xs.min() + fx * (xs.max() - xs.min())), float(ys.min() + fy * (ys.max() - ys.min()))]


def scaled(part, scale):
    for key, value in part.items():
        if key != 'size':
            part[key] = [round(v * scale, 1) for v in value]
    return part


def cut_head(out, scale, torso_width):
    """Profile head, sized so it reads as the same chibi child: about 1.45 times the torso's depth
    (torso_width is the torso piece as saved, already scaled; the head is cut at its own scale)."""
    rgb = np.asarray(Image.open(HEAD).convert('RGB'))
    mask = silhouette(rgb)
    labels, n = ndimage.label(mask)
    mask = labels == 1 + np.argmax(ndimage.sum(mask, labels, range(1, n + 1)))
    ys, xs = np.nonzero(mask)
    own = torso_width * 1.45 / (xs.max() - xs.min())
    img, m = cut(rgb, mask, own)
    img.save(out / 'head.png')
    rows = np.nonzero(m.any(1))[0]
    bottom = np.nonzero(m[rows.max() - max(3, len(rows) // 25)])[0]
    # The neck meets the head under the jaw, closer to the back than to the chin.
    pivot = [bottom.min() + 0.3 * (bottom.max() - bottom.min()), rows.max() - 0.05 * len(rows)]
    return {'size': [img.width, img.height], 'pivot': [round(v * own, 1) for v in pivot]}


def side_end(m, right):
    """Centre of the rounded end of a horizontal piece: half its height in from the tip."""
    cols = np.nonzero(m.any(0))[0]
    tip = cols.max() if right else cols.min()
    probe = tip + (-1 if right else 1) * max(4, len(cols) // 6)
    ys = np.nonzero(m[:, probe])[0]
    height = ys.max() - ys.min()
    return [float(tip + (-1 if right else 1) * height / 2), float((ys.min() + ys.max()) / 2)]


def cut_fox(out, scale):
    rgb = np.asarray(Image.open(FOX).convert('RGB'))
    mask = silhouette(rgb)
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = (1 + np.argsort(sizes)[-8:]).tolist()
    centres = {i: ndimage.center_of_mass(labels == i) for i in keep}
    split = np.median([c[0] for c in centres.values()])
    rows = [sorted([i for i in keep if (centres[i][0] < split) == top], key=lambda i: centres[i][1]) for top in (True, False)]
    fox = {}
    for name, label in zip(FOX_NAMES, rows[0] + rows[1]):
        img, m = cut(rgb, labels == label, scale)
        if name.startswith('tail'):
            # Drawn reaching right; behind a fox that faces right it has to reach left.
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            m = m[:, ::-1]
        img.save(out / f'fox_{name}.png')
        part = {'size': [img.width, img.height]}
        if name == 'body':
            part.update(neck=at(m, 0.84, 0.18), tail=at(m, 0.06, 0.32), shoulder=at(m, 0.78, 0.72),
                        hip=at(m, 0.22, 0.62), rump=at(m, 0.12, 0.98))
        elif name == 'head':
            part['pivot'] = at(m, 0.4, 0.88)
        elif name.startswith('tail'):
            part['pivot'] = side_end(m, right=True)  # joins the body, or the base
            part['end'] = side_end(m, right=False)
        else:
            part['pivot'] = end_centre(m, top=True)
            part['end'] = end_centre(m, top=False)
            bottom = np.nonzero(m.any(1))[0].max()
            sole = np.nonzero(m[bottom - 3])[0]
            part['paw'] = [float((sole.min() + sole.max()) / 2), float(bottom)]
        fox[name] = scaled(part, scale)
    return fox


def cut_front_head(path, out, name, height, crop=None):
    """A front-facing head as tall as its profile piece; its pivot is the bottom of the chin."""
    rgb = np.asarray(Image.open(path).convert('RGB'))
    if crop:
        rgb = rgb[:crop]
    mask = silhouette(rgb)
    labels, n = ndimage.label(mask)
    mask = labels == 1 + np.argmax(ndimage.sum(mask, labels, range(1, n + 1)))
    if crop:
        mask[crop - 15:] = False  # the neck belongs to the torso
    ys, xs = np.nonzero(mask)
    own = height / (ys.max() - ys.min())
    img, m = cut(rgb, mask, own)
    img.save(out / f'{name}.png')
    rows = np.nonzero(m.any(1))[0]
    chin = np.nonzero(m[rows.max() - 6])[0]
    pivot = [(chin.min() + chin.max()) / 2, rows.max() - 10]
    return {'size': [img.width, img.height], 'pivot': [round(v * own, 1) for v in pivot]}


def main():
    out = Path(sys.argv[1])
    scale = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    out.mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(SHEET).convert('RGB'))
    mask = silhouette(rgb)
    labels, count = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    pieces = sorted((1 + np.argsort(sizes)[-5:]).tolist(), key=lambda i: ndimage.center_of_mass(labels == i)[1])
    rig = {'scale': scale, 'parts': {}}
    for name, label in zip(NAMES, pieces):
        img, m = cut(rgb, labels == label, scale)
        img.save(out / f'{name}.png')
        h, w = m.shape
        part = {'size': [img.width, img.height]}
        if name == 'torso':
            # Neck top holds the head; shoulder and hip sit on the body's vertical centre line.
            rows = np.nonzero(m.any(1))[0]
            neck = np.nonzero(m[rows.min() + 8])[0]
            body = np.nonzero(m[int(h * 0.6)])[0]
            centre = (body.min() + body.max()) / 2
            part['neck'] = [float((neck.min() + neck.max()) / 2), float(rows.min() + 10)]
            part['shoulder'] = [float(centre), float(h * 0.36)]
            part['hip'] = [float(centre), float(h * 0.9)]
        else:
            part['pivot'] = end_centre(m, top=True)
            part['end'] = end_centre(m, top=False)
            if name == 'thigh':
                part['pivot'][1] = h * 0.12  # flat waistband top: turn a little below it
        for key in ('neck', 'shoulder', 'hip', 'pivot', 'end'):
            if key in part:
                part[key] = [round(v * scale, 1) for v in part[key]]
        rig['parts'][name] = part

    rig['parts']['head'] = cut_head(out, scale, rig['parts']['torso']['size'][0])
    rig['fox'] = cut_fox(out, scale)
    rig['parts']['head_front'] = cut_front_head(TEMPLATE, out, 'head_front', rig['parts']['head']['size'][1], crop=520)
    if FOX_HEAD_FRONT.exists():
        rig['fox']['head_front'] = cut_front_head(FOX_HEAD_FRONT, out, 'fox_head_front', rig['fox']['head']['size'][1] * 1.05)
    (out / 'rig.json').write_text(json.dumps(rig, indent=2))
    print(json.dumps(rig, indent=1))


if __name__ == '__main__':
    main()
