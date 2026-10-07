"""Pet animation from video: the pet's poses as frame-by-frame sprites.

The cutout rig looked stiff on a pet, so pets are animated frame by frame from short videos in the
game's style made with Grok (art/incoming/animaciones/). Cycles (walk, run) come from a clip that
pins the same base image as first and last frame, so the motion loops by construction; the pet
moves in place on a flat chroma green with a locked camera (prompts: art/rig/mascotas/*.txt).
Older clips on a flat cream background with a ground strip still work (sit, scratch).

All poses share one scale and one ground line. Frames of the same action from the same clip keep
their position in the clip, so the body's rise and fall and its surge in a gallop stay in.

Usage: video_a_sprites.py <out_dir> <action>=<video.mp4>@<frames> [...]
       frames are 1-based: "12-23", "1,5,9", every other one "74-102:2", or a mix
       writes <out_dir>/<action>-<i>.png and sprites.json ({actions, size, ground})
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

GROUND_MARGIN = 3  # px above a ground strip, so the soft contact shadow stays out


def parse_frames(text):
    frames = []
    for part in text.split(','):
        span, _, step = part.partition(':')
        a, _, b = span.partition('-')
        frames += list(range(int(a), int(b or a) + 1, int(step or 1)))
    return frames


def ground_line(rgb):
    """First row (from the middle down) that is mostly not background: the top of a ground strip,
    or the frame's height when there is none."""
    bg = rgb[5, rgb.shape[1] // 2].astype(int)
    for y in range(rgb.shape[0] // 2, rgb.shape[0]):
        if (np.abs(rgb[y].astype(int) - bg).sum(1) > 40).mean() > 0.5:
            return y
    return rgb.shape[0]


def keyed(rgb, bg):
    """How far each pixel is into a saturated (chroma) background: 0 is pet, 1 is background.
    None when the background is pale: then its colour also appears inside the pet."""
    c = int(np.argmax(bg))
    others = [i for i in range(3) if i != c]
    margin = bg[c] - bg[others].max()
    if margin < 80:
        return None
    own = rgb[..., c].astype(float) - rgb[..., others].max(-1)
    return np.clip(own / margin, 0, 1)


def largest(mask, keep=0.0):
    """The biggest shape, plus any other at least `keep` times its size (props set down apart
    from the character, like a ladybug on the ground)."""
    labels, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    if keep:
        return np.isin(labels, 1 + np.nonzero(sizes >= keep * sizes.max())[0])
    return labels == 1 + int(np.argmax(sizes))  # captions and markers are small and apart


def cut_chroma(rgb, bg, key):
    """On chroma green nothing of the pet is green: every green pixel goes, holes between the legs
    included, and the outline's antialiasing is unblended from the green."""
    # Clips on green carry no captions, so loose props are kept.
    pet = largest(ndimage.binary_fill_holes(ndimage.binary_closing(key < 0.5, iterations=2)), keep=0.0015)
    pet = ndimage.binary_dilation(pet, iterations=2)
    # No colour of the pet has more green than red or blue, so any green lead is background: the
    # small gaps between the legs come out a darker green than the rest and still go. Twice the
    # sensitivity puts a shaded gap near alpha 0 while the outline's antialiasing keeps its ramp.
    alpha = np.where(pet, 1 - np.clip(key * 2, 0, 1), 0)
    alpha[alpha < 0.08] = 0
    # Unblending only holds on the rim, where outline meets green; inside, video noise would turn
    # it into specks of cyan. There the pet keeps its colour with the green spill taken out.
    solid = pet & (key < 0.1)
    rim = (alpha > 0) & ~solid
    a = np.maximum(alpha, 1e-3)[..., None]
    unblended = np.clip((rgb.astype(float) - (1 - a) * bg) / a, 0, 255)
    colour = rgb.astype(float)
    colour[..., 1] = np.minimum(colour[..., 1], colour[..., [0, 2]].max(-1))
    colour = np.where(rim[..., None], unblended, colour)
    alpha = np.where(rim | ~solid, alpha, 1.0)
    return np.dstack([colour, alpha * 255]).astype(np.uint8), solid


def cut_paper(rgb, bg, ground):
    area = rgb[:ground - GROUND_MARGIN].astype(int)
    solid = np.abs(area - bg).sum(-1) > 36
    pet = largest(ndimage.binary_fill_holes(ndimage.binary_closing(solid, iterations=2)))
    ys = np.nonzero(pet.any(1))[0]
    feet = ys.max() - 16
    # The soft contact shadow joins the paws along the ground and closes in the paper between the
    # legs: grey, unsaturated pixels near the feet are not the pet.
    rgbf = area.astype(float)
    grey = (rgbf.max(-1) - rgbf.min(-1) < 26) & (rgbf.mean(-1) > 140)
    grey[:feet] = False
    pet &= ~grey
    # Paper is the exact cream of the background. The white of the eyes is drawn in that same
    # cream, so only patches below the eyes go: gaps between the legs, or between the head and a
    # paw raised to scratch. The eyes measured 0.36-0.45 of the pet's height (0.45 running), the
    # gaps 0.5 and lower down.
    paper = pet & (np.abs(area - bg).max(-1) < 7)
    patches, count = ndimage.label(paper)
    middle = ys.min() + (ys.max() - ys.min()) * 0.48
    for i in range(1, count + 1):
        patch = patches == i
        if patch.sum() > 60 and ndimage.center_of_mass(patch)[0] > middle:
            pet &= ~ndimage.binary_dilation(patch, iterations=1)
    edge = pet & ~ndimage.binary_erosion(pet, iterations=2)
    darkness = np.clip(np.abs(area - bg).sum(-1) / 220, 0, 1)
    alpha = np.where(edge, darkness, pet.astype(float))
    full = np.zeros((rgb.shape[0], rgb.shape[1], 4), np.uint8)
    full[:area.shape[0]] = np.dstack([area, alpha * 255]).astype(np.uint8)
    mask = np.zeros(rgb.shape[:2], bool)
    mask[:area.shape[0]] = pet
    return full, mask


def cut_pet(rgb, ground):
    bg = rgb[5, rgb.shape[1] // 2].astype(int)
    key = keyed(rgb, bg)
    return cut_chroma(rgb, bg, key) if key is not None else cut_paper(rgb, bg, ground)


def body_centre(pet):
    """Horizontal centre of the middle third of the body's height (legs and tail swing, the
    trunk does not)."""
    ys = np.nonzero(pet.any(1))[0]
    third = (ys.max() - ys.min()) // 3
    return float(np.nonzero(pet[ys.min() + third: ys.max() - third].any(0))[0].mean())


def main():
    out = Path(sys.argv[1])
    groups = []
    for spec in sys.argv[2:]:
        action, rest = spec.split('=', 1)
        video, frames = rest.rsplit('@', 1)
        groups.append((action, Path(video), parse_frames(frames)))
    out.mkdir(parents=True, exist_ok=True)
    poses = []  # (action, rgba, mask, cx, ground) with cx and ground shared by the group
    with tempfile.TemporaryDirectory() as tmp:
        extracted = {}
        for _, video, _ in groups:
            if video not in extracted:
                folder = Path(tmp) / str(len(extracted))
                folder.mkdir()
                subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), f'{folder}/f%04d.png'], check=True)
                extracted[video] = folder
        for action, video, frames in groups:
            first = np.asarray(Image.open(extracted[video] / 'f0001.png').convert('RGB'))
            ground = ground_line(first)
            if ground == first.shape[0]:
                # No ground strip: the clip's first frame is the base pose standing on the ground.
                _, mask = cut_pet(first, ground)
                ground = int(np.nonzero(mask.any(1))[0].max()) + 1
            cuts = [cut_pet(np.asarray(Image.open(extracted[video] / f'f{f:04d}.png').convert('RGB')), ground)
                    for f in frames]
            cx = float(np.median([body_centre(mask) for _, mask in cuts]))
            poses += [(action, rgba, mask, cx, ground) for rgba, mask in cuts]

    left = right = up = down = 0
    for _, _, mask, cx, ground in poses:
        ys, xs = np.nonzero(mask)
        left, right = max(left, cx - xs.min()), max(right, xs.max() - cx)
        up, down = max(up, ground - ys.min()), max(down, ys.max() + 1 - ground)
    half, up, down = int(max(left, right)) + 4, int(up) + 4, int(down) + 2
    sheet = {'actions': {}, 'size': [2 * half, up + down], 'ground': up}
    for action, rgba, _, cx, ground in poses:
        canvas = np.zeros((up + down, 2 * half, 4), np.uint8)
        x0, y0 = int(round(cx)) - half, ground - up
        sx0, sy0 = max(0, x0), max(0, y0)
        src = rgba[sy0: y0 + up + down, sx0: x0 + 2 * half]
        canvas[sy0 - y0: sy0 - y0 + src.shape[0], sx0 - x0: sx0 - x0 + src.shape[1]] = src
        names = sheet['actions'].setdefault(action, [])
        names.append(f'{action}-{len(names)}.png')
        Image.fromarray(canvas).save(out / names[-1])
    (out / 'sprites.json').write_text(json.dumps(sheet, indent=1))
    print(json.dumps(sheet))


if __name__ == '__main__':
    main()
