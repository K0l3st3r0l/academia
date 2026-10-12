"""Finds an island's dock and its glowing crystals, so new islands do not need them measured by hand.

Usage: muelle.py <island.png> ...   (prints the dock polygon, the entry point and the sparkles)

The dock is the biggest patch of plank-brown just below the lowest pad, where the path begins;
its polygon is that patch reduced to four corners, the entry the centre of its planks. Sparkles
go where the violet crystals glow on the island's sides.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))


def dock(rgb, lowest_pad):
    """The dock is where the path begins: the biggest plank-brown patch just below the lowest pad.
    Searching only there keeps fences, trunks and rocks of the same brown out."""
    h, w = rgb.shape[:2]
    px, py = lowest_pad
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    wood = (r > 110) & (r < 235) & (g > 55) & (g < 175) & (b < 120) & (r - g > 25) & (g - b > 15)
    window = np.zeros_like(wood)
    window[py + 30:min(h, py + 360), max(0, px - 260):px + 260] = True
    wood = ndimage.binary_closing(ndimage.binary_opening(wood & window, iterations=1), iterations=3)
    labels, count = ndimage.label(wood)
    if not count:
        raise SystemExit('No encontré el muelle bajo el primer disco')
    sizes = ndimage.sum(wood, labels, range(1, count + 1))
    ys, xs = np.nonzero(labels == 1 + int(np.argmax(sizes)))
    pts = np.stack([xs, ys], 1)
    # Four corners: the extremes along both diagonals of the 3/4 view.
    corners = [pts[np.argmin(xs + ys)], pts[np.argmin(-xs + ys)], pts[np.argmax(xs + ys)], pts[np.argmax(-xs + ys)]]
    # The planks, not the posts hanging under them: the upper part of the patch.
    top = ys < np.percentile(ys, 65)
    return [[int(x), int(y)] for x, y in corners], [int(xs[top].mean()), int(ys[top].mean())]


def sparkles(rgb, limit=6):
    h = rgb.shape[0]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    glow = (b > 215) & (r > 160) & (b - g > 60) & (r - g > 20)
    # Crystals stud the island's sides (lower half) and the underside of the next island (top strip);
    # distant violet mountains sit in between.
    glow[int(h * 0.08):int(h * 0.5)] = False
    labels, count = ndimage.label(ndimage.binary_opening(glow))
    found = []
    for i in range(1, count + 1):
        ys, xs = np.nonzero(labels == i)
        if 120 < len(xs) < 6000:
            found.append((len(xs), [int(xs.mean()), int(ys.mean())]))
    return [p for _, p in sorted(found, reverse=True)[:limit]]


def main():
    from build_world import PAD, find_pads
    for path in sys.argv[1:]:
        rgb = np.asarray(Image.open(path).convert('RGB')).astype(int)
        polygon, entry = dock(rgb, find_pads(rgb.astype(float), PAD)[0])
        print(path.split('/')[-1], {'dock': polygon, 'entry': entry, 'sparkles': sparkles(rgb)})


if __name__ == '__main__':
    main()
