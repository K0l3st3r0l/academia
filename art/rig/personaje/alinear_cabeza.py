"""A new hairstyle head, aligned to the reference head so it fits the same per-frame anchors.

Grok redraws the reference head (kid-heads/heads/<view>.png, scaled x3 on green) with another
hairstyle from the editor's catalog (cabeza-<style>-<view>.txt). The face stays almost where it
was, but not exactly: the new head is cut out and moved and scaled so its face (the skin) lands on
the reference's face. Hair may reach past the reference piece (a ponytail), so the piece grows
and its pivot moves with it.

Usage: alinear_cabeza.py <reference.png> <pivots.json> <view> <grok.png> <upscale> <out.png>
       (prints the new piece's pivot as JSON)
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def skin(rgba):
    rgb = rgba[..., :3].astype(float) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = (mx - mn) / np.maximum(mx, 1e-6)
    return (rgba[..., 3] > 128) & (h > 8) & (h < 40) & (s > 0.2) & (s < 0.86) & (mx > 0.55)


def cut_green(path, upscale):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    bg = np.median(rgb[:24].reshape(-1, 3), 0)
    own = rgb[..., 1] - rgb[..., [0, 2]].max(-1)
    alpha = 1 - np.clip((own - 8) / ((bg[1] - max(bg[0], bg[2])) * 0.6), 0, 1)
    labels, n = ndimage.label(alpha > 0.5)
    keep = labels == 1 + int(np.argmax(ndimage.sum(alpha > 0.5, labels, range(1, n + 1))))
    alpha = np.where(ndimage.binary_dilation(keep, iterations=2), alpha, 0)
    rgb[..., 1] = np.minimum(rgb[..., 1], rgb[..., [0, 2]].max(-1))
    img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    return np.asarray(img.resize((round(img.width / upscale), round(img.height / upscale)), Image.LANCZOS))


def main():
    ref_path, pivots, view, grok, upscale, out = sys.argv[1:7]
    ref = np.asarray(Image.open(ref_path).convert('RGBA'))
    pivot = json.load(open(pivots))[view]['pivot']
    new = cut_green(grok, float(upscale))
    a, b = skin(ref), skin(new)
    # Face size from the skin's width (hair can cover the forehead, never the cheeks), then the
    # offset that best overlaps the two faces.
    width = lambda m: np.ptp(np.nonzero(m.any(0))[0])
    scale = width(a) / width(b)
    img = Image.fromarray(new)
    img = np.asarray(img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS))
    b = skin(img)
    ca, cb = np.array(ndimage.center_of_mass(a)), np.array(ndimage.center_of_mass(b))
    best = None
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            oy, ox = np.round(ca - cb).astype(int) + (dy, dx)
            shifted = np.zeros_like(a)
            ys, xs = np.nonzero(b)
            ys, xs = ys + oy, xs + ox
            ok = (ys >= 0) & (ys < a.shape[0]) & (xs >= 0) & (xs < a.shape[1])
            shifted[ys[ok], xs[ok]] = True
            iou = (a & shifted).sum() / max(1, (a | shifted).sum())
            if best is None or iou > best[0]:
                best = (iou, oy, ox)
    _, oy, ox = best
    # Place on a canvas big enough for both the reference box and the new hair.
    ys, xs = np.nonzero(img[..., 3] > 0)
    top, left = min(0, ys.min() + oy), min(0, xs.min() + ox)
    bottom, right = max(ref.shape[0], ys.max() + oy + 1), max(ref.shape[1], xs.max() + ox + 1)
    canvas = np.zeros((bottom - top, right - left, 4), np.uint8)
    y0, x0 = oy - top, ox - left
    sy0, sx0 = max(0, -y0), max(0, -x0)
    sub = img[sy0:, sx0:]
    sub = sub[:canvas.shape[0] - max(0, y0), :canvas.shape[1] - max(0, x0)]
    canvas[max(0, y0):max(0, y0) + sub.shape[0], max(0, x0):max(0, x0) + sub.shape[1]] = sub
    Image.fromarray(canvas).save(out)
    print(json.dumps({'pivot': [pivot[0] - left, pivot[1] - top], 'size': [canvas.shape[1], canvas.shape[0]],
                      'face_iou': round(float(best[0]), 3), 'scale': round(float(scale), 3)}))


if __name__ == '__main__':
    main()
