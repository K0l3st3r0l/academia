"""Recolor a region of a part (skin, hair) keeping its shading and the navy outline.

Pixels close to the source color family are remapped by luminance: shadows stay
proportionally darker and highlights lighter, on the new color.
"""
import numpy as np

INK = np.array([26, 26, 46])


def luminance(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def recolor(rgba, source_rgb, target_rgb, tolerance=150):
    a = rgba.astype(float)
    rgb = a[..., :3]
    src = np.array(source_rgb, float)
    tgt = np.array(target_rgb, float)
    # Same color family: close in chroma (color minus its own brightness), not an outline.
    chroma = rgb - luminance(rgb)[..., None]
    src_chroma = src - luminance(src[None])[0]
    family = np.abs(chroma - src_chroma).sum(-1) < tolerance * 0.45
    family &= np.abs(rgb - INK).sum(-1) > 70
    family &= a[..., 3] > 0
    ratio = luminance(rgb) / max(1.0, luminance(src[None])[0])
    darker = tgt * np.minimum(ratio, 1)[..., None]
    lighter = tgt + (255 - tgt) * np.clip(ratio - 1, 0, 1)[..., None] * 1.4
    new = np.where((ratio <= 1)[..., None], darker, lighter)
    out = a.copy()
    out[..., :3] = np.where(family[..., None], np.clip(new, 0, 255), rgb)
    return out.astype(np.uint8)
