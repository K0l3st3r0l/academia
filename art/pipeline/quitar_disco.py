"""Paint the sandy path over one stone pad of an island, when the image model drew one too many.

Usage: quitar_disco.py <island.png> <x> <y> [r g b]   (x, y: the pad's centre; r g b: the
       island's pad colour when its layout has "pad")

The pad's ellipse, its outline and its shadow are replaced by the colour of the sand around it,
with a little grain so the patch does not read as flat. Only sand pixels around the pad are
sampled, so grass or rocks next to the path do not tint it. The original is kept as .orig.png.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_world import PAD, pad_mask  # noqa: E402


def main():
    cover_pad(Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), [int(v) for v in sys.argv[4:7]] or PAD)


def cover_pad(path, cx, cy, pad=PAD):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    labels, _ = ndimage.label(pad_mask(rgb, pad))
    label = labels[cy, cx]
    if not label:
        raise SystemExit(f'No hay disco en ({cx}, {cy})')
    face = labels == label
    ys, xs = np.nonzero(face)
    # The face is the light top; the rim, its dark outline and the shadow reach further, mostly below.
    rx, ry = (xs.max() - xs.min()) / 2 + 20, (ys.max() - ys.min()) / 2 + 18
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    d = np.hypot((xx - xs.mean()) / rx, (yy - ys.mean() - 7) / ry)
    # Sand here is whatever warm ground dominates the ring around the pad: build_world's sand_mask
    # is tuned to the first island and misses more saturated sand.
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    around = (d > 1.1) & (d < 2.6)
    warm = around & (r > 190) & (g > 150) & (r >= g) & (g >= b) & (r - b > 40)
    if warm.sum() < 400:
        raise SystemExit('El disco no está sobre arena: este método no sirve aquí')
    # The pad sits on the path, so the band right around it is path sand, not the grass beyond.
    band = warm & (d < 1.4)
    typical = np.median(rgb[band if band.sum() > 50 else warm], axis=0)
    ring = warm & (np.linalg.norm(rgb - typical, axis=-1) < 28)
    # The sand around, spread smoothly over the hole (normalized convolution), so the patch keeps
    # the path's own gradient instead of one flat colour.
    weight = ndimage.gaussian_filter(ring.astype(float), 22)
    sand = np.stack([ndimage.gaussian_filter(rgb[..., c] * ring, 22) for c in range(3)], -1) / np.maximum(weight, 1e-6)[..., None]
    grain = ndimage.gaussian_filter(np.random.default_rng(3).normal(0, 1, d.shape), 1.0)[..., None] * 3
    alpha = np.clip((1.12 - d) / 0.22, 0, 1)[..., None]
    out = rgb * (1 - alpha) + (sand + grain) * alpha
    backup = path.with_suffix('.orig.png')
    if not backup.exists():
        shutil.copy(path, backup)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(path)
    print(f'{path.name}: disco en ({cx}, {cy}) cubierto con arena')


if __name__ == '__main__':
    main()
