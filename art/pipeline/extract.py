"""Cut a part out of a GPT edit of the mannequin template.

A part image is the template with one thing added or replaced. Pixels that differ from
the template, inside the region where that kind of part lives, are the part. Small specks
(GPT re-renders the whole canvas, so there is noise) and anything not connected to the
main shapes are dropped.

Before cutting, check_alignment() rejects edits where GPT redrew the whole figure instead
of editing the template (it happens): hands and feet must sit where the template has them.

Usage: extract.py <template.png> <part.png> <kind> <out.png>
kinds: hair, hair-hat, face, eyes, brows, nose, mouth, top, dress, bottom, shoes,
       headwear, eyewear, neckwear, backwear, earwear
hair-hat is a hairstyle drawn under the magenta cap of maestra-gorro.png (see hat_template.py).
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# Regions on the 1024x1536 canvas (x0, y0, x1, y1) where each kind of part may appear.
REGIONS = {
    'hair': (120, 0, 904, 1000),
    'hair-hat': (120, 0, 904, 1000),
    'face': (330, 190, 700, 520),
    'eyes': (330, 190, 700, 520),
    'brows': (330, 190, 700, 520),
    'nose': (330, 190, 700, 520),
    'mouth': (330, 190, 700, 520),
    'top': (120, 470, 904, 1120),
    'dress': (120, 470, 904, 1300),
    'bottom': (230, 830, 794, 1440),
    'shoes': (180, 1150, 844, 1536),
    'headwear': (100, 0, 924, 520),
    'eyewear': (280, 230, 744, 470),
    'neckwear': (260, 420, 764, 760),
    'backwear': (80, 380, 944, 1250),
    'earwear': (200, 250, 824, 560),
}
MIN_SPECK = {'face': 30, 'eyes': 60, 'brows': 60, 'nose': 20, 'mouth': 40, 'hair': 400, 'hair-hat': 400, 'top': 400,
             'dress': 400, 'bottom': 400, 'shoes': 400, 'headwear': 300, 'eyewear': 60, 'neckwear': 200, 'backwear': 300, 'earwear': 60}
CLOTHES = ('top', 'dress', 'bottom')
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
# Bare feet: every kind except footwear leaves them alone, so a dress still has a reference.
FEET = [(250, 1390, 470, 1480), (560, 1390, 780, 1480)]


class MisalignedEdit(Exception):
    pass


def dark(a):
    return a.sum(-1) < 3 * 110


def check_alignment(t, p, kind, min_iou=0.8):
    anchors = ANCHORS + ([] if kind in ('shoes', 'bottom') else FEET)
    for x0, y0, x1, y1 in anchors:
        if kind in ('shoes', 'bottom', 'dress') and 1180 <= y0 < 1390:
            continue  # shoes, long trousers and long dresses do cover the lower legs
        if kind in ('top', 'dress', 'backwear') and y0 < 1180:
            continue  # long sleeves and capes reach the hands
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


def warm(a):
    """Skin and brown: what GPT redraws under a cap's visor (its shadow on the forehead)."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r >= g) & (g >= b) & (r - b > 40)


def slits_in_hair(mask, t, min_share=0.75):
    """Hair drawn over the head's outline in a shadow tone as dark as the outline matches the
    template there, so the cut leaves a slit through the hair that shows the body's black line.
    A slit is template outline with hair on both sides; outline along the jaw, an ear or a
    shoulder has hair on one side only and stays out."""
    candidates = ndimage.binary_closing(mask, iterations=6) & ~mask & dark(t)
    labels, n = ndimage.label(candidates)
    keep = np.zeros_like(mask)
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        sl = tuple(slice(max(0, s.start - 2), s.stop + 2) for s in sl)
        blob = labels[sl] == i
        ring = ndimage.binary_dilation(blob, iterations=2) & ~blob
        if mask[sl][ring].mean() >= min_share:
            keep[sl] |= blob
    return keep


def extract(template_path, part_path, kind, drop_warm=False):
    t, p = load(template_path), load(part_path)
    check_alignment(t, p, kind)
    diff = np.abs(p - t).sum(-1)
    mask = diff > 75
    if kind not in CLOTHES:
        mask &= ~magentaish(p)
    if drop_warm:
        mask &= ~warm(p)
    if kind in ('hair', 'hair-hat'):
        # GPT also touches up the face and ears around new hair; those pixels are still skin.
        # Where the template is background, though, that skin (a jaw drawn a little wider) is
        # the only thing between face and hair: dropping it left white gaps (afro). Keep it;
        # build_assets repaints it with the student's skin.
        skin = np.median(t[300:450, 450:580].reshape(-1, 3), axis=0)
        mask &= ~(skinlike(p, skin) & ~whitish(t)) & ~whitish(p)
        # No hairstyle puts hair over the middle of the neck: lines there are GPT redrawing the collar.
        mask[500:760, 440:584] = False
    if kind == 'hair-hat':
        # Under a hat no hair goes above the cap's lower edge, not even beside it; the cap's own
        # outline (when GPT shifts it) and a few pixels below it go too: real hats cover them.
        cap = magentaish(t)
        cap[345:] = False  # the magenta clothes are not the cap
        cap = ndimage.binary_dilation(cap, iterations=14)
        rows = np.arange(cap.shape[0])[:, None]
        cols = cap.any(0)
        edge = np.where(cols, (cap * rows).max(0), 0)
        xs = np.nonzero(cols)[0]
        edge[: xs[0]], edge[xs[-1] + 1:] = edge[xs[0]], edge[xs[-1]]
        mask &= rows > edge[None, :]
        # Where the cut crosses a curl it leaves thin bits of outline, which poked out beside hats.
        mask &= (rows > edge[None, :] + 30) | ndimage.binary_opening(mask, iterations=4)
    x0, y0, x1, y1 = REGIONS[kind]
    region = np.zeros_like(mask)
    region[y0:y1, x0:x1] = True
    mask &= region
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    if kind in ('hair', 'hair-hat'):
        # After filling holes: a slit that closed a ring of hair would fill the ear inside it.
        slits = slits_in_hair(mask, t)
        if kind == 'hair-hat':
            slits &= rows > edge[None, :]
        mask |= slits & region
        mask[500:760, 440:584] = False
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
