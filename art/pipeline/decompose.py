"""Split a layer into what the browser recolors and what it never touches.

The browser used to decide per pixel, on lossy WebP, whether a pixel was hair, skin or
outline. Dark hair shading fell inside the outline threshold and stayed brown on blonde hair;
pixels blending hair with the outline or with the template's skin stayed half-colored and
showed as light halos on dark skin; ears and forehead redrawn inside a hair layer kept the
template's skin tone.

Here, on the lossless cut, every pixel becomes up to two components:
  - a family component (primary role color, or skin) with a coverage and a shade, the
    shade being the L* difference from that family's reference;
  - a fixed component (outline ink, white details, accessory colors) with a coverage and a color.
Pixels on the border between two classes are unmixed against the nearest pure pixels of each
class, so an anti-aliased hair line over skin becomes part hair, part skin, both recolored.

The browser then paints out = sum(coverage x color) / sum(coverage).
"""
import numpy as np
from scipy import ndimage

LUM = np.array([0.299, 0.587, 0.114])
# Shading is stored as the difference in CIELAB lightness (L*) from the family's reference,
# and the browser applies it to the target color in Lab: a blonde keeps golden shadows instead
# of the olive that multiplying yellow by a factor gives, and dark targets keep their contrast.
DL_SCALE = 2  # map byte = 128 + dL * DL_SCALE


def srgb_to_lab(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_srgb(lab):
    lab = np.asarray(lab, float)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * np.array([0.95047, 1.0, 1.08883])
    c = xyz @ np.array([[3.2406, -0.9689, 0.0557], [-1.5372, 1.8758, -0.2040], [-0.4986, 0.0415, 1.0570]])
    c = np.clip(c, 0, 1)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.clip(c * 255, 0, 255)


def shade_lut(target):
    """256 colors: what each map byte becomes for this target. Mirrors render.js."""
    lab = srgb_to_lab(target)
    dl = (np.arange(256) - 128) / DL_SCALE
    L = np.clip(lab[0] + dl, 0, 100)
    # Chroma fades toward black and white so extreme shades don't clip into odd hues.
    fade = np.clip(np.minimum(L, 100 - L) / 25, 0, 1) ** 0.5
    keep = np.clip(np.minimum(lab[0], 100 - lab[0]) / 25, 1e-3, 1) ** 0.5
    k = np.minimum(1, fade / keep)
    return lab_to_srgb(np.stack([L, lab[1] * k, lab[2] * k], -1))
INK = np.array([26, 26, 46], float)
SKIN_SOURCE = [244, 156, 98]

# Shade range (relative luminance) and hue tolerance of each kind of family.
# center: the family's usual shade; with two families the pixel goes to the closer one in
# log luminance (brown hair and skin share a hue: lightness is what tells them apart).
PARAMS = {
    # Skin is shaded with reddish lines (ears, chin, nose) that must darken with the skin too.
    'skin': {'smin': 0.3, 'smax': 1.35, 'angle': 30, 'center': 0.85},
    'skin-secondary': {'smin': 0.45, 'smax': 1.3, 'angle': 24, 'center': 0.85},
    # Accessories are gold, straw or flower colors close to skin; the only skin they carry is
    # the template's own forehead or ear, in its exact tone.
    'skin-accessory': {'smin': 0.6, 'smax': 1.2, 'angle': 8, 'center': 0.85},
    'hair': {'smin': 0.1, 'smax': 2.0, 'angle': 12, 'center': 1.0},
    'eye': {'smin': 0.2, 'smax': 2.0, 'angle': 14, 'center': 1.0},
    'cloth': {'smin': 0.2, 'smax': 1.7, 'angle': 14, 'center': 1.0},
}
MIX_RADIUS = 2.5
FIXED = 255  # class id of anything that keeps its color


def lum(rgb):
    return rgb @ LUM


def angle_to(rgb, source):
    s = np.asarray(source, float)
    n = np.linalg.norm(rgb, axis=-1) * np.linalg.norm(s) + 1e-6
    return np.degrees(np.arccos(np.clip((rgb @ s) / n, -1, 1)))


def family_match(rgb, source, params, warm_dark=False):
    """Shade relative to the source, and whether the pixel can be that family at all."""
    s = lum(rgb) / lum(np.asarray(source, float))
    l = lum(rgb)
    # Hue gets noisy near black: tolerate more as the pixel darkens.
    tol = params['angle'] + 25 * np.clip((30 - l) / 30, 0, 1)
    ok = (s >= params['smin']) & (s <= params['smax']) & (angle_to(rgb, source) <= tol)
    if warm_dark:
        # Hair is outlined and shaded in very dark brown, not navy: still hair.
        ok |= (l < 40) & (l >= 4) & (rgb[..., 0] > rgb[..., 2] + 6)
    return ok, s


def mode_smooth(cls, labels, size=5):
    """Flip isolated pixels among `labels` to the local majority (keeps borders, removes specks)."""
    counts = np.stack([ndimage.uniform_filter((cls == c).astype(float), size) for c in labels])
    among = np.isin(cls, labels)
    best = np.array(labels)[counts.argmax(0)]
    return np.where(among, best, cls)


def islands_to_skin(cls, hair_id, skin_id, max_share=0.05):
    """Ear lines redrawn inside a hair layer share the hair's reddish brown, so color can't
    tell them apart; shape can: they are small islands cut off from the hair mass and touching
    skin. Those become skin."""
    hair = cls == hair_id
    labels, n = ndimage.label(hair, np.ones((3, 3)))
    if n < 2:
        return cls
    sizes = ndimage.sum(hair, labels, range(1, n + 1))
    near_skin = ndimage.binary_dilation(cls == skin_id, np.ones((5, 5)))
    touching = ndimage.maximum(near_skin, labels, range(1, n + 1))
    small = np.nonzero((sizes < sizes.max() * max_share) & (touching > 0))[0] + 1
    out = cls.copy()
    out[np.isin(labels, small)] = skin_id
    return out


def decompose(rgba, families, hair_islands=False):
    """families: list of (name, source_rgb, params_key, warm_dark). Returns
    (fixed_rgba float, [(cov, shade) per family]) at the input resolution."""
    a = rgba.astype(float)
    rgb, alpha = a[..., :3], a[..., 3] / 255
    present = alpha > 0
    h, w = alpha.shape

    # 1. Color class of every pixel.
    shades, oks = [], []
    for name, source, pkey, warm in families:
        ok, s = family_match(rgb, source, PARAMS[pkey], warm)
        oks.append(ok & present)
        shades.append(s)
    cls = np.full((h, w), FIXED, np.uint8)
    cls[~present] = 0
    if len(families) == 1:
        cls[oks[0]] = 1
    else:
        # Both families possible (brown hair vs skin share a hue): the one whose usual shade
        # is closer in log luminance wins, then the local majority settles the border.
        dist = []
        for (name, source, pkey, _), s, ok in zip(families, shades, oks):
            d = np.abs(np.log(np.maximum(s, 1e-3) / PARAMS[pkey]['center']))
            dist.append(np.where(ok, d, np.inf))
        dist = np.stack(dist)
        best = dist.argmin(0)
        anyok = np.isfinite(dist.min(0))
        cls[anyok] = (best[anyok] + 1).astype(np.uint8)
    family_ids = list(range(1, len(families) + 1))
    # Only pixels that could be either family follow their neighbors: a thin ear line drawn
    # inside a hair layer is surrounded by hair but is clearly skin.
    ambiguous = np.sum(oks, axis=0) > 1
    smoothed = mode_smooth(cls, family_ids + [FIXED])
    cls = np.where(present & ambiguous, smoothed, cls).astype(np.uint8)
    if hair_islands and len(families) == 2:
        cls = islands_to_skin(cls, 1, 2)

    # 2. Pure pixels: same class all around (3x3). The rest blend two classes.
    labels = family_ids + [FIXED]
    core = {}
    for c in labels:
        m = cls == c
        core[c] = ndimage.binary_erosion(m, np.ones((3, 3)), border_value=0) & (alpha > 0.95)
    nearest = {}
    for c in labels:
        if core[c].any():
            d, idx = ndimage.distance_transform_edt(~core[c], return_indices=True)
            nearest[c] = (d, idx)

    comps = {c: (np.zeros((h, w)), np.zeros((h, w, 3))) for c in labels}  # weight, color
    is_core = np.zeros((h, w), bool)
    for c in labels:
        is_core |= core[c]
    for c in labels:
        wgt, col = comps[c]
        m = core[c]
        wgt[m] = 1
        col[m] = rgb[m]

    mixed = present & ~is_core
    ys, xs = np.nonzero(mixed)
    p = rgb[ys, xs]
    own = cls[ys, xs]
    cand_d = np.stack([nearest[c][0][ys, xs] if c in nearest else np.full(len(ys), np.inf) for c in labels])
    order = np.argsort(cand_d, axis=0)
    c1 = np.array(labels)[order[0]]
    c2 = np.array(labels)[order[1]]
    d1 = np.take_along_axis(cand_d, order[:1], 0)[0]
    d2 = np.take_along_axis(cand_d, order[1:2], 0)[0]

    def core_color(cs, sel):
        out = np.zeros((sel.sum(), 3))
        for c in labels:
            mm = cs[sel] == c
            if not mm.any() or c not in nearest:
                continue
            iy, ix = nearest[c][1]
            yy, xx = ys[sel][mm], xs[sel][mm]
            out[mm] = rgb[iy[yy, xx], ix[yy, xx]]
        return out

    two = (d1 <= MIX_RADIUS) & (d2 <= MIX_RADIUS) & (c1 != c2)
    one = ~two
    # Two classes nearby: unmix the pixel on the segment between their pure colors.
    if two.any():
        e1, e2 = core_color(c1, two), core_color(c2, two)
        diff = e1 - e2
        t = np.clip(((p[two] - e2) * diff).sum(1) / np.maximum((diff * diff).sum(1), 1e-6), 0, 1)
        for cs, es, tt in ((c1[two], e1, t), (c2[two], e2, 1 - t)):
            for c in labels:
                mm = cs == c
                if not mm.any():
                    continue
                wgt, col = comps[c]
                yy, xx = ys[two][mm], xs[two][mm]
                wgt[yy, xx] += tt[mm]
                col[yy, xx] += es[mm] * tt[mm, None]
    # One class (or none) nearby: the pixel is its own class, with its own color.
    if one.any():
        cs = np.where(own[one] != 0, own[one], c1[one])
        for c in labels:
            mm = cs == c
            if not mm.any():
                continue
            wgt, col = comps[c]
            yy, xx = ys[one][mm], xs[one][mm]
            wgt[yy, xx] += 1
            col[yy, xx] += p[one][mm]

    # 3. Coverage = component weight x pixel alpha; color = weighted mean color.
    fixed_w, fixed_c = comps[FIXED]
    fixed = np.zeros((h, w, 4))
    fm = fixed_w > 0
    fixed[fm, :3] = fixed_c[fm] / fixed_w[fm, None]
    fixed[..., 3] = fixed_w * alpha
    out = []
    for i, (name, source, pkey, _) in enumerate(families, start=1):
        wgt, col = comps[i]
        m = wgt > 0
        L = np.zeros((h, w))
        L[m] = srgb_to_lab(col[m] / wgt[m, None])[..., 0]
        if pkey.startswith('skin'):
            # Every layer measures skin against the same reference, so skin redrawn inside a
            # hair or clothes layer matches the body underneath it.
            ref = srgb_to_lab(SKIN_SOURCE)[0]
        else:
            # The family's typical shade (its median) is what becomes the chosen color.
            ref = np.median(L[core[i]]) if core[i].any() else (np.median(L[m]) if m.any() else 50)
        dl = np.where(m, L - ref, 0)
        out.append((wgt * alpha, dl))
    return fixed, out


def downsample2(arr):
    h, w = arr.shape[:2]
    arr = arr[:h - h % 2, :w - w % 2]
    return arr.reshape(h // 2, 2, w // 2, 2, *arr.shape[2:]).mean((1, 3))


def to_half(fixed, fams):
    """2x2 average in premultiplied space, matching build_assets' half scale."""
    fa = fixed[..., 3]
    fp = downsample2(fixed[..., :3] * fa[..., None])
    fa2 = downsample2(fa)
    fixed2 = np.zeros(fp.shape[:2] + (4,))
    m = fa2 > 1e-6
    fixed2[m, :3] = fp[m] / fa2[m, None]
    fixed2[..., 3] = fa2
    fams2 = []
    for cov, dl in fams:
        c2 = downsample2(cov)
        d2 = np.zeros_like(c2)
        mm = c2 > 1e-6
        d2[mm] = downsample2(dl * cov)[mm] / c2[mm]
        fams2.append((c2, d2))
    return fixed2, fams2


def encode_map(fams):
    """One RGB strip per family, stacked vertically: R = 128 + dL*2, G = coverage, B = 0."""
    strips = []
    for cov, dl in fams:
        r = np.clip(np.round(128 + dl * DL_SCALE), 0, 255)
        g = np.clip(np.round(cov * 255), 0, 255)
        strips.append(np.stack([r, g, np.zeros_like(r)], -1))
    return np.concatenate(strips, 0).astype(np.uint8)


def compose(fixed, fams, targets):
    """What the browser paints, in numpy: RGBA float 0..255."""
    num = fixed[..., :3] * fixed[..., 3:4]
    den = fixed[..., 3].copy()
    for (cov, dl), target in zip(fams, targets):
        code = np.clip(np.round(128 + dl * DL_SCALE), 0, 255).astype(int)
        num += shade_lut(target)[code] * cov[..., None]
        den += cov
    out = np.zeros(fixed.shape[:2] + (4,))
    m = den > 1e-6
    out[m, :3] = num[m] / den[m, None]
    out[..., 3] = np.clip(den, 0, 1) * 255
    return out
