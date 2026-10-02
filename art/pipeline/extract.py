"""Cut a part out of a GPT edit of the mannequin template.

A part image is the template with one thing added or replaced. Pixels that differ from
the template, inside the region where that kind of part lives, are the part. Small specks
(GPT re-renders the whole canvas, so there is noise) and anything not connected to the
main shapes are dropped.

Before cutting, check_alignment() rejects edits where GPT redrew the whole figure instead
of editing the template (it happens): hands and feet must sit where the template has them.

Usage: extract.py <template.png> <part.png> <kind> <out.png>
kinds: hair, face, eyes, brows, nose, mouth, top, bottom, shoes
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# Regions on the 1024x1536 canvas (x0, y0, x1, y1) where each kind of part may appear.
REGIONS = {
    'hair': (120, 0, 904, 1000),
    'face': (330, 190, 700, 520),
    'eyes': (330, 190, 700, 520),
    'brows': (330, 190, 700, 520),
    'nose': (330, 190, 700, 520),
    'mouth': (330, 190, 700, 520),
    'top': (150, 470, 874, 1120),
    'bottom': (250, 830, 774, 1400),
    'shoes': (180, 1150, 844, 1536),
}
MIN_SPECK = {'face': 30, 'eyes': 60, 'brows': 60, 'nose': 20, 'mouth': 40, 'hair': 400, 'top': 400, 'bottom': 400, 'shoes': 400}
FEATURES = ('eyes', 'brows', 'nose', 'mouth')


def feature_of(cx, cy):
    """Which face feature a blob belongs to, by where its center falls (canvas 1024x1536)."""
    if cy < 300 and 340 <= cx <= 660:
        return 'brows'
    if 355 <= cy < 425 and 462 <= cx <= 538:
        return 'nose'
    if 288 <= cy < 420 and 340 <= cx <= 660:
        return 'eyes'
    if 405 <= cy < 515 and 410 <= cx <= 590:
        return 'mouth'
    return None
# Hands and lower legs: no part kind changes them, so they must match the template.
ANCHORS = [(200, 860, 340, 1030), (680, 860, 820, 1030), (330, 1180, 470, 1290), (550, 1180, 700, 1290)]


class MisalignedEdit(Exception):
    pass


def dark(a):
    return a.sum(-1) < 3 * 110


def check_alignment(t, p, kind, min_iou=0.8):
    for x0, y0, x1, y1 in ANCHORS:
        if kind in ('shoes', 'bottom') and y0 >= 1180:
            continue  # shoes and long trousers do cover the lower legs
        a, b = dark(t[y0:y1, x0:x1]), dark(p[y0:y1, x0:x1])
        a, b = ndimage.binary_dilation(a, iterations=4), ndimage.binary_dilation(b, iterations=4)
        iou = (a & b).sum() / max(1, (a | b).sum())
        if iou < min_iou:
            raise MisalignedEdit(f'outline at {(x0, y0)} matches the template only {iou:.2f}')


def skinlike(a, skin):
    return np.abs(a - skin).sum(-1) < 90


def whitish(a):
    return (a.min(-1) > 225)


def magentaish(a):
    """The template's chroma-key clothes: never part of hair or a face."""
    return (a[..., 0] > 170) & (a[..., 2] > 170) & (a[..., 1] < 130)


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int16)


def extract(template_path, part_path, kind):
    t, p = load(template_path), load(part_path)
    check_alignment(t, p, kind)
    diff = np.abs(p - t).sum(-1)
    mask = diff > 75
    if kind not in ('top', 'bottom'):
        mask &= ~magentaish(p)
    if kind == 'hair':
        # GPT also touches up the face and ears around new hair; those pixels are still skin.
        skin = np.median(t[300:450, 450:580].reshape(-1, 3), axis=0)
        mask &= ~skinlike(p, skin) & ~whitish(p)
    x0, y0, x1, y1 = REGIONS[kind]
    region = np.zeros_like(mask)
    region[y0:y1, x0:x1] = True
    mask &= region
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    if kind in FEATURES:
        # GPT often draws more than asked (eyebrows with the eyes): keep only this feature's blobs.
        labels, n = ndimage.label(ndimage.binary_dilation(mask, iterations=3))
        keep = np.zeros_like(mask)
        for i, sl in enumerate(ndimage.find_objects(labels)):
            blob = (labels == i + 1) & mask
            if blob.sum() < MIN_SPECK[kind]:
                continue
            ys, xs = np.nonzero(blob)
            if feature_of(xs.mean(), ys.mean()) == kind:
                keep |= blob
        mask = keep
    labels, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, labels, range(1, n + 1))
        floor = max(MIN_SPECK[kind], 0.05 * sizes.max()) if kind != 'face' else MIN_SPECK[kind]
        mask = np.isin(labels, 1 + np.nonzero(sizes >= floor)[0])
    # One pixel of softness so edges don't look cut with scissors.
    alpha = ndimage.gaussian_filter(mask.astype(float), 0.7)
    rgba = np.dstack([p.astype(np.uint8), (np.clip(alpha * 1.6, 0, 1) * 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA'), int(mask.sum())


if __name__ == '__main__':
    template, part, kind, out = sys.argv[1:5]
    try:
        img, area = extract(template, part, kind)
    except MisalignedEdit as err:
        print(f'{part}: RECHAZADA, GPT redibujó la figura ({err})')
        sys.exit(2)
    img.save(out)
    print(f'{out}: {area} px')
