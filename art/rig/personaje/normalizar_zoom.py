"""Undo Grok's camera zoom in sitting clips, so every frame keeps the child's scale.

Asked for a locked camera, Grok still moved in when the child sat down to read, explore or paint:
the child grows up to 1.43 times between standing and sitting. The front hair is the yardstick (in
front view it is about as wide whatever the pose): each listed action's frames are scaled by
reference width / measured width, smoothed over neighbouring frames, about the horizontal centre
of the canvas. Then the frame is set down on the ground row by its lowest patch of skin (feet,
shins, the crossed legs once sitting), not by its lowest pixel: a magnifying glass or a book held
low hangs below the feet and would leave the child floating. Frames that need no scaling are still
set down (the sleeping child sat a little high in its clip).

Usage: normalizar_zoom.py <sprites_dir> <reference_width> <action> [<action> ...]
       (rewrites those actions' frames in place; prints the scale applied to each)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def hair_width(rgba):
    a = rgba[..., 3] > 128
    rgb = rgba[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = (mx - mn) / np.maximum(mx, 1e-6)
    hair = ndimage.binary_closing(a & (mx < 0.5) & (mx > 0.12) & (h < 35) & (s > 0.4), iterations=3)
    labels, n = ndimage.label(hair)
    sizes = ndimage.sum(hair, labels, range(1, n + 1))
    xs = np.nonzero((labels == 1 + int(np.argmax(sizes))).any(0))[0]
    return xs.max() - xs.min()


def lowest_skin(rgba):
    """Bottom row of the skin patches big enough to be feet or legs; the lowest pixel if none."""
    a = rgba[..., 3] > 128
    rgb = rgba[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = (mx - mn) / np.maximum(mx, 1e-6)
    skin = a & (h > 8) & (h < 40) & (s > 0.2) & (s < 0.86) & (mx > 0.62)
    labels, n = ndimage.label(skin)
    sizes = ndimage.sum(skin, labels, range(1, n + 1))
    rows = np.nonzero(np.isin(labels, 1 + np.nonzero(sizes >= 150)[0]).any(1))[0]
    return rows.max() if len(rows) else np.nonzero(a.any(1))[0].max()


def main():
    folder, ref, actions = Path(sys.argv[1]), float(sys.argv[2]), sys.argv[3:]
    sheet = json.loads((folder / 'sprites.json').read_text())
    ground = sheet['ground']
    for action in actions:
        names = sheet['actions'][action]
        frames = [np.asarray(Image.open(folder / n)).astype(float) for n in names]
        widths = np.array([hair_width(f) for f in frames], float)
        # A dolly is smooth; single-frame jumps in the measure are hands or props over the hair.
        widths = ndimage.median_filter(widths, size=3, mode='nearest')
        widths = ndimage.uniform_filter1d(widths, size=3, mode='nearest')
        scales = ref / widths
        for i, (name, rgba, scale) in enumerate(zip(names, frames, scales)):
            if abs(scale - 1) < 0.03:
                scale = scales[i] = 1.0
            h, w = rgba.shape[:2]
            img = Image.fromarray(rgba.astype(np.uint8))
            if scale != 1:
                img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            arr = np.asarray(img)
            # The outline under the skin is about 3 px thick: that is what touches the ground.
            target = ground - 3
            bottom = lowest_skin(arr.astype(float))
            if scale == 1 and abs(target - bottom) < 3:
                continue
            canvas = np.zeros_like(rgba, dtype=np.uint8)
            ox, oy = round(w / 2 - arr.shape[1] / 2), target - bottom
            sy0, sx0 = max(0, -oy), max(0, -ox)
            y0, x0 = max(0, oy), max(0, ox)
            sub = arr[sy0: sy0 + h - y0, sx0: sx0 + w - x0]
            canvas[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]] = sub
            Image.fromarray(canvas).save(folder / name)
        print(action, ' '.join(f'{s:.2f}' for s in scales))


if __name__ == '__main__':
    main()
