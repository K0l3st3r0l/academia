"""Base frames for the child's Grok videos: profile, front and running pose on one scale.

Grok draws the profile and running bases (base-perfil.txt, base-correr.txt, with the clothes
template, the profile head and the parts sheet as references) on a green that is not quite flat
and at its own size; the front view is the editor's clothes template on white. Each is cut out,
scaled so the standing child is 500 px tall, and put on flat #00B140 at 1280x720 with the feet
on y = 650 and the body centred, so a clip can start on one base and end on another (the idle
turn goes from profile to front) and every clip's sprites share a scale.

Usage: normalizar_bases.py <perfil-grok.png> <correr-grok.png> <plantilla-frente.png> <out_dir>
       (writes nino-base-perfil.png, nino-base-frente.png and nino-base-correr.png)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

GREEN = np.array([0, 177, 64.])
HEIGHT, FEET = 500, 650


def largest(mask):
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    return labels == 1 + int(np.argmax(sizes))


def cut(path, white=False):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    if white:
        # Only the paper reaching the border is background: the eyes are white too.
        paper = rgb.min(-1) > 232
        labels, _ = ndimage.label(paper)
        border = set(np.unique(np.r_[labels[0], labels[-1], labels[:, 0], labels[:, -1]])) - {0}
        paper = np.isin(labels, list(border))
        alpha = np.where(paper, 0.0, 1.0)
        edge = ~paper & ndimage.binary_dilation(paper, iterations=2)
        alpha[edge] = np.clip((255 - rgb[edge].min(-1)) / 90, 0, 1)
    else:
        own = rgb[..., 1] - rgb[..., [0, 2]].max(-1)
        bg = np.median(rgb[:20].reshape(-1, 3), 0)
        alpha = 1 - np.clip((own - 8) / ((bg[1] - max(bg[0], bg[2])) * 0.6), 0, 1)
    child = ndimage.binary_dilation(largest(ndimage.binary_fill_holes(alpha > 0.5)), iterations=2)
    alpha = np.where(child, alpha, 0)
    colour = rgb.copy()
    colour[..., 1] = np.minimum(colour[..., 1], colour[..., [0, 2]].max(-1))  # green spill
    ys, xs = np.nonzero(alpha > 0.5)
    return colour, alpha, (ys.min(), ys.max())


def place(piece, scale, out):
    colour, alpha, (top, feet) = piece
    trunk = alpha[top + (feet - top) // 3: feet - (feet - top) // 3] > 0.5
    cx = np.nonzero(trunk.any(0))[0].mean()
    rgba = Image.fromarray(np.dstack([colour, alpha * 255]).astype(np.uint8))
    rgba = np.asarray(rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.LANCZOS)).astype(float)
    canvas = np.tile(GREEN, (720, 1280, 1))
    ox, oy = round(640 - cx * scale), round(FEET - feet * scale)
    h, w = rgba.shape[:2]
    y0, x0, y1, x1 = max(0, oy), max(0, ox), min(720, oy + h), min(1280, ox + w)
    sub = rgba[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    a = sub[..., 3:] / 255
    canvas[y0:y1, x0:x1] = sub[..., :3] * a + canvas[y0:y1, x0:x1] * (1 - a)
    Image.fromarray(canvas.astype(np.uint8)).save(out)


def main():
    side, running, front, out = sys.argv[1], sys.argv[2], sys.argv[3], Path(sys.argv[4])
    side, running, front = cut(side), cut(running), cut(front, white=True)
    scale = HEIGHT / (side[2][1] - side[2][0])
    place(side, scale, out / 'nino-base-perfil.png')
    place(running, scale, out / 'nino-base-correr.png')  # drawn at the profile's scale
    place(front, HEIGHT / (front[2][1] - front[2][0]), out / 'nino-base-frente.png')


if __name__ == '__main__':
    main()
