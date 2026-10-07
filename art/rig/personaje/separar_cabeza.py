#!/usr/bin/env python3
"""Split cartoon heads, fit two references, and render offline verification sheets."""

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.signal import fftconvolve


def largest(mask):
    labels, count = ndi.label(mask)
    if not count:
        raise ValueError("No hair component found")
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == sizes.argmax()


def bounds(mask):
    yy, xx = np.nonzero(mask)
    return int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)


def split_head(rgba):
    rgb = rgba[..., :3].astype(np.float32)
    r, g, b = rgb.transpose(2, 0, 1)
    solid = rgba[..., 3] > 100
    brown = solid & (r > 1.22 * g) & (g > 1.02 * b) & (r < 165) & (g < 105)
    hair = largest(ndi.binary_closing(brown, iterations=2)) & brown
    hx0, hy0, hx1, hy1 = bounds(hair)
    skin = solid & (r > 170) & (g > 75) & (g < 220) & (b < 175)
    skin &= (r > 1.20 * g) & (g > 1.15 * b)
    shirt = solid & (r > 1.5 * g) & (b > 1.4 * g) & (r > 120) & (b > 100)
    shirt_labels, _ = ndi.label(shirt)
    shirt_sizes = np.bincount(shirt_labels.ravel())
    shirt = shirt & (shirt_sizes[shirt_labels] > 100)
    shirt_distance = ndi.distance_transform_edt(~shirt)
    labels, count = ndi.label(skin)
    sizes = np.bincount(labels.ravel())
    near_hair = ndi.binary_dilation(hair, iterations=9)
    candidates = []
    for label in range(1, count + 1):
        if sizes[label] < 50:
            continue
        mask = labels == label
        x0, y0, x1, y1 = bounds(mask)
        if (y0 < hy1 - 0.12 * (hy1 - hy0) and np.any(mask & near_hair)
                and np.min(shirt_distance[mask]) > 3):
            candidates.append(label)
    if not candidates:
        raise ValueError("No face skin component beside the hair")
    face_label = max(candidates, key=lambda label: sizes[label])
    face = labels == face_label
    fx0, fy0, fx1, fy1 = bounds(face)
    facial_labels = [label for label in candidates
                     if bounds(labels == label)[1] < fy1 - 0.20 * (fy1 - fy0)]
    face = np.isin(labels, facial_labels)
    seeds = hair | face
    body_skin = skin & ~face & (sizes[labels] >= 50)
    body_seeds = body_skin | shirt
    head_distance = ndi.distance_transform_edt(~seeds)
    body_distance = ndi.distance_transform_edt(~body_seeds)
    # The dark jaw separates face and neck skin; divide its outline between them.
    region = head_distance <= body_distance + 0.7
    region = ndi.binary_fill_holes(region)
    region &= rgba[..., 3] > 0

    necks = []
    for label in range(1, count + 1):
        if label in facial_labels or sizes[label] < 30:
            continue
        mask = labels == label
        x0, y0, x1, y1 = bounds(mask)
        if (fy1 - 0.15 * (fy1 - fy0) < y0 < fy1 + 0.18 * (fy1 - fy0)
                and x1 - x0 < 0.55 * (fx1 - fx0)
                and y1 - y0 < 0.4 * (fy1 - fy0)
                and np.min(head_distance[mask]) < 10
                and np.min(shirt_distance[mask]) < 10):
            necks.append(label)
    if not necks:
        raise ValueError("No narrow neck band between jaw and collar")
    neck = labels == max(necks, key=lambda label: sizes[label])
    nx0, ny0, nx1, ny1 = bounds(neck)
    neck_columns = np.arange(nx0, nx1)
    neck_top = np.array([np.nonzero(neck[:, x])[0].min() for x in neck_columns])
    middle = (neck_columns >= nx0 + 0.12 * (nx1 - nx0))
    middle &= neck_columns < nx1 - 0.12 * (nx1 - nx0)
    slope, intercept = np.polyfit(neck_columns[middle], neck_top[middle], 1)
    # Continue the jaw across the neck outlines, rather than including their tails.
    yy, xx = np.indices(region.shape)
    neck_strip = (xx >= nx0 - 6) & (xx < nx1 + 6)
    region &= ~(neck_strip & (yy > slope * xx + intercept - 0.5))
    leftovers, leftover_count = ndi.label((rgba[..., 3] > 0) & ~region)
    for label in range(1, leftover_count + 1):
        fragment = leftovers == label
        if (not np.any(fragment & body_seeds)
                and np.min(head_distance[fragment]) < 20
                and bounds(fragment)[3] <= fy1 + 5):
            region |= fragment
    region[max(hy1, fy1) + 4:] = False
    upper_neck = neck.copy()
    upper_neck[int(ny0 + 0.6 * (ny1 - ny0)):] = False
    neck_x = float(np.nonzero(upper_neck)[1].mean())
    columns = range(max(0, round(neck_x) - 2), min(rgba.shape[1], round(neck_x) + 3))
    neck_y = float(np.median([np.nonzero(region[:, x])[0].max() + 0.5
                              for x in columns if np.any(region[:, x])]))
    head = rgba.copy()
    head[~region] = 0
    body = rgba.copy()
    body[region] = 0
    return {"rgba": rgba, "head": head, "body": body, "mask": region,
            "neck": (neck_x, neck_y), "bbox": bounds(region),
            "jaw_slope": float(slope),
            "jaw_span": (nx0 - 6 - neck_x, nx1 + 6 - neck_x)}


def palette(rgba):
    r, g, b = rgba[..., :3].astype(np.float32).transpose(2, 0, 1)
    solid = rgba[..., 3] > 100
    brown = solid & (r > 1.22 * g) & (g > 1.02 * b) & (r < 165) & (g < 105)
    skin = solid & (r > 170) & (g > 75) & (g < 220) & (b < 175)
    skin &= (r > 1.20 * g) & (g > 1.15 * b)
    shirt = solid & (r > 1.5 * g) & (b > 1.4 * g) & (r > 120) & (b > 100)
    labels, _ = ndi.label(shirt)
    sizes = np.bincount(labels.ravel())
    shirt &= sizes[labels] > 100
    return brown, skin, shirt


def pose_seeds(rgba):
    brown, skin, shirt = palette(rgba)
    # Closing can join hair to the brown shadows on a touching hand.
    hair = largest(brown)
    labels, _ = ndi.label(skin)
    sizes = np.bincount(labels.ravel())
    near_hair = ndi.binary_dilation(hair, iterations=9)
    candidates = np.unique(labels[near_hair & skin])
    candidates = [label for label in candidates if label and sizes[label] >= 50]
    if not candidates:
        raise ValueError("No face skin component beside the hair")
    face_label = max(candidates, key=lambda label: sizes[label])
    face = labels == face_label
    fx0, fy0, fx1, fy1 = bounds(face)
    ears = [label for label in candidates if label != face_label
            and sizes[label] < 0.12 * sizes[face_label]
            and bounds(labels == label)[1] < fy1 - 0.2 * (fy1 - fy0)]
    face |= np.isin(labels, ears)
    head_seeds = hair | face
    body_seeds = (skin & ~face & (sizes[labels] >= 50)) | shirt
    # Grow limbs through tan edge colours without crossing a facial component.
    r, g, b = rgba[..., :3].astype(np.float32).transpose(2, 0, 1)
    tan = ((rgba[..., 3] > 100) & (r > 170) & (r > g + 25) & (g > b + 8)
           & (g > 75) & (g < 230) & (b < 180))
    tan_labels, _ = ndi.label(tan)
    body_labels = np.setdiff1d(np.unique(tan_labels[body_seeds & tan]),
                              np.unique(tan_labels[head_seeds & tan]))
    body_seeds |= tan & np.isin(tan_labels, body_labels)
    head_distance = ndi.distance_transform_edt(~head_seeds)
    body_distance = ndi.distance_transform_edt(~body_seeds)
    region = (head_distance <= body_distance + 0.7) & (rgba[..., 3] > 0)
    outline = rgba[..., :3].max(axis=2) < 100
    region &= ~(outline & (body_distance <= 4.5)
                & (body_distance < head_distance + 2) & ~head_seeds)
    return region, hair, face, body_seeds


def split_head_pose(rgba, references):
    region, hair, face, _ = pose_seeds(rgba)
    yy, xx = np.nonzero(hair)
    fx0, fy0, fx1, fy1 = bounds(face)
    head = rgba.copy()
    head[~region] = 0
    frame = {"rgba": rgba, "head": head, "mask": region, "bbox": bounds(region),
             "neck": ((fx0 + fx1) / 2, float(fy1)),
             "hair_center": (float(xx.mean()), float(yy.mean())),
             "fit_ignore": (rgba[..., 3] > 0) & ~region}
    fits = {view: find_fit(frame, ref, angle_limit=35, center_hair=True)
            for view, ref in references.items()}
    view = min(fits, key=lambda key: fits[key]["loss"])
    anchor = fits[view]
    reference = references[view]
    # Transform the reference jaw into the sprite, keeping its neck strip local.
    yy, xx = np.indices(region.shape)
    local = rotation(anchor["angle"]).T @ np.stack(
        (xx - anchor["x"], yy - anchor["y"])).reshape(2, -1)
    lx, ly = local.reshape(2, *region.shape)
    left, right = reference["jaw_span"]
    neck_strip = (lx >= left) & (lx <= right)
    region &= ~(neck_strip & (ly > reference["jaw_slope"] * lx))
    frame["mask"] = region
    frame["head"] = rgba.copy()
    frame["head"][~region] = 0
    frame["body"] = rgba.copy()
    frame["body"][region] = 0
    frame["bbox"] = bounds(region)
    frame["neck"] = (anchor["x"], anchor["y"])
    # Retained body pixels must also occlude a replacement head at this pose.
    frame["occlusion"] = ~region & (rgba[..., 3] > 0)
    frame["cut_method"] = "fitted_jaw"
    frame["fits"] = fits
    return frame


def needs_pose_split(frame):
    _, _, face, body_seeds = pose_seeds(frame["rgba"])
    # A second skin component inside the extracted head may be a raised hand.
    _, skin, _ = palette(frame["rgba"])
    return bool(np.count_nonzero(frame["mask"] & skin & body_seeds & ~face) > 30)


def premultiplied(rgba):
    pixels = rgba.astype(np.float32) / 255.0
    pixels[..., :3] *= pixels[..., 3:4]
    return pixels


def straight_rgba(pixels):
    result = pixels.copy()
    np.divide(result[..., :3], result[..., 3:4], out=result[..., :3],
              where=result[..., 3:4] > 1e-6)
    result[result[..., 3] < 1e-6] = 0
    return np.uint8(np.clip(np.rint(result * 255), 0, 255))


def rotation(angle):
    theta = math.radians(angle)
    return np.array([[math.cos(theta), -math.sin(theta)],
                     [math.sin(theta), math.cos(theta)]])


def render_head(reference, pivot, angle, shape):
    # Work in premultiplied RGBA to avoid dark fringes around transparent pixels.
    matrix_xy = rotation(angle).T
    offset_xy = np.asarray(reference["pivot"]) - matrix_xy @ np.asarray(pivot)
    matrix_yx = matrix_xy[::-1, ::-1]
    offset_yx = offset_xy[::-1]
    return np.stack([ndi.affine_transform(reference["pixels"][..., channel],
                     matrix_yx, offset_yx, output_shape=shape, order=1,
                     mode="constant", cval=0, prefilter=False)
                     for channel in range(4)], axis=-1)


def make_reference(frame, name, view, out):
    x0, y0, x1, y1 = frame["bbox"]
    # Padding preserves interpolation support when the cutout is rotated.
    pad = 3
    piece = np.pad(frame["head"][y0:y1, x0:x1], ((pad, pad), (pad, pad), (0, 0)))
    distance, nearest = ndi.distance_transform_edt(piece[..., 3] < 245, return_indices=True)
    soft_edge = (piece[..., 3] > 0) & (piece[..., 3] < 245) & (distance <= 3)
    # Remove colour-key fringes while retaining the source's soft alpha edge.
    piece[soft_edge, :3] = piece[nearest[0][soft_edge], nearest[1][soft_edge], :3]
    pivot = (frame["neck"][0] - x0 + pad, frame["neck"][1] - y0 + pad)
    Image.fromarray(piece).save(out / "heads" / f"{view}.png")
    return {"pixels": premultiplied(piece), "pivot": pivot, "source": name,
            "crop": [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
            "size": [piece.shape[1], piece.shape[0]],
            "jaw_slope": frame["jaw_slope"], "jaw_span": frame["jaw_span"]}


def matching_features(pixels):
    features = pixels.copy()
    features[..., :3] *= 0.65
    return features


def find_fit(frame, reference, angle_limit=20, center_hair=False):
    x0, y0, x1, y1 = frame["bbox"]
    margin = 45
    ox, oy = x0 - margin, y0 - margin
    shape = (y1 - y0 + 2 * margin, x1 - x0 + 2 * margin)
    target = np.zeros((*shape, 4), np.float32)
    target[margin:margin + y1-y0, margin:margin + x1-x0] = premultiplied(
        frame["head"][y0:y1, x0:x1])
    features = matching_features(target)
    scale = 0.35
    small_target = ndi.zoom(features, (scale, scale, 1), order=1)
    target_norm = float(np.sum(small_target ** 2))
    local_pivot = np.asarray(frame["neck"]) - (ox, oy)
    if center_hair:
        reference_rgba = straight_rgba(reference["pixels"])
        hair = largest(palette(reference_rgba)[0])
        hy, hx = np.nonzero(hair)
        hair_offset = np.array([hx.mean(), hy.mean()]) - reference["pivot"]
        hair_center = np.asarray(frame["hair_center"]) - (ox, oy)
    ignore = np.zeros(shape, bool)
    if "fit_ignore" in frame:
        sx0, sy0 = max(0, ox), max(0, oy)
        sx1, sy1 = min(frame["rgba"].shape[1], ox + shape[1]), min(frame["rgba"].shape[0], oy + shape[0])
        ignore[sy0-oy:sy1-oy, sx0-ox:sx1-ox] = frame["fit_ignore"][sy0:sy1, sx0:sx1]
    best = None
    angles = list(range(-(angle_limit // 2) * 2, angle_limit + 1, 2))
    if angle_limit % 2:
        angles += [-angle_limit, angle_limit]
    for angle in angles:
        if center_hair:
            local_pivot = hair_center - rotation(angle) @ hair_offset
        template = render_head(reference, local_pivot, angle, shape)
        small_template = ndi.zoom(matching_features(template), (scale, scale, 1), order=1)
        correlation = sum(fftconvolve(small_target[..., ch],
                          small_template[::-1, ::-1, ch], mode="full") for ch in range(4))
        cy, cx = np.array(small_target.shape[:2]) - 1
        radius = round(24 * scale)
        window = correlation[cy-radius:cy+radius+1, cx-radius:cx+radius+1]
        sy, sx = np.unravel_index(window.argmax(), window.shape)
        loss = target_norm + float(np.sum(small_template ** 2)) - 2 * float(window[sy, sx])
        candidate = (loss, angle, (sx-radius)/scale, (sy-radius)/scale, local_pivot.copy())
        if best is None or candidate[0] < best[0]:
            best = candidate
    _, angle, dx, dy, local_pivot = best
    start = [local_pivot[0] + dx, local_pivot[1] + dy, float(angle)]

    def loss(params):
        fitted = matching_features(render_head(reference, params[:2], params[2], shape))
        fitted[ignore] = 0
        return float(np.mean((features - fitted) ** 2))

    # Coordinate descent keeps the search local and the angle convention explicit.
    current = start
    current_loss = loss(current)
    for step in (1.0, 0.5, 0.25):
        for _ in range(12):
            improved = False
            for axis in range(3):
                for sign in (-1, 1):
                    candidate = current.copy()
                    candidate[axis] += sign * step
                    if axis == 2 and abs(candidate[axis]) > angle_limit:
                        continue
                    value = loss(candidate)
                    if value < current_loss - 1e-10:
                        current, current_loss = candidate, value
                        improved = True
            if not improved:
                break
    return {"x": current[0] + ox, "y": current[1] + oy,
            "angle": current[2], "loss": current_loss}


def reconstruct(frame, reference, anchor):
    head = render_head(reference, (anchor["x"], anchor["y"]), anchor["angle"],
                       frame["rgba"].shape[:2])
    body = premultiplied(frame["body"])
    if "occlusion" in frame:
        foreground = body * frame["occlusion"][..., None]
        background = body - foreground
        visible_head = head * (1 - foreground[..., 3:4])
        return background * (1 - head[..., 3:4]) + visible_head + foreground, visible_head
    return body * (1 - head[..., 3:4]) + head, head


def verify(frame, reconstructed, head):
    original = premultiplied(frame["rgba"])
    original_head = premultiplied(frame["head"])
    a, b = original_head[..., 3], head[..., 3]
    union = (a > 0.01) | (b > 0.01)
    soft_iou = float(np.minimum(a, b).sum() / max(np.maximum(a, b).sum(), 1e-6))
    binary_iou = float(((a > 0.5) & (b > 0.5)).sum() /
                       max(((a > 0.5) | (b > 0.5)).sum(), 1))
    mad = float(np.abs(original - reconstructed)[union].mean() * 255)
    fit = soft_iou * (1 - mad / 255)
    return {"iou": soft_iou, "binary_iou": binary_iou, "mad": mad,
            "fit": fit, "flagged": bool(fit < 0.85 or mad > 20)}


def checker(size):
    yy, xx = np.indices((size[1], size[0]))
    values = np.where((xx // 12 + yy // 12) % 2, 225, 242).astype(np.uint8)
    return Image.fromarray(np.repeat(values[..., None], 3, axis=2))


def display(pixels, size):
    im = Image.fromarray(straight_rgba(pixels))
    im.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = checker(size)
    canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2), im)
    return canvas


def contact_sheet(names, frames, reconstructions, anchors, out, action, close=False):
    tile = (160, 205) if close else (130, 181)
    panel_w, panel_h = 3 * tile[0] + 12, tile[1] + 48
    columns = 3
    rows = math.ceil(len(names) / columns)
    sheet = Image.new("RGB", (panel_w * columns, panel_h * rows), (248, 248, 248))
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names):
        frame = frames[name]
        original = premultiplied(frame["rgba"])
        reconstructed = reconstructions[name]
        difference = np.abs(original - reconstructed)
        heat = np.zeros_like(original)
        heat[..., 0] = np.clip(difference.max(axis=2) * 3, 0, 1)
        heat[..., 1] = heat[..., 0] * 0.22
        heat[..., 3] = 1
        if close:
            x0, y0, x1, y1 = frame["bbox"]
            y1 = min(frame["rgba"].shape[0], y1 + 35)
            x0, x1 = max(0, x0-8), min(frame["rgba"].shape[1], x1+8)
            original, reconstructed, heat = [p[max(0,y0-8):y1, x0:x1]
                                               for p in (original, reconstructed, heat)]
        px, py = (index % columns) * panel_w, (index // columns) * panel_h
        anchor = anchors[name]
        color = (185, 20, 25) if anchor["flagged"] else (20, 20, 20)
        draw.text((px + 3, py + 2), f'{name}  {anchor["view"]}' +
                  ("  FLAG" if anchor["flagged"] else ""), fill=color)
        draw.text((px + 3, py + 16),
                  f'IoU {anchor["iou"]:.3f}  MAD {anchor["mad"]:.1f}  fit {anchor["fit"]:.3f}',
                  fill=color)
        for column, (pixels, label) in enumerate(zip((original, reconstructed, heat),
                                                   ("original", "reconstruction", "diff x3"))):
            tx = px + column * tile[0]
            draw.text((tx + 3, py + 30), label, fill=(40, 40, 40))
            sheet.paste(display(pixels, tile), (tx, py + 45))
    suffix = "-heads" if close else ""
    sheet.save(out / "check" / f"{action}{suffix}.png")


def natural_key(name):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", name)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sprites_dir", type=Path)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--profile", default=None, help="Profile reference filename")
    parser.add_argument("--front", default=None, help="Front reference filename")
    args = parser.parse_args()
    root, out = args.sprites_dir, args.out_dir
    paths = sorted(root.glob("*.png"), key=lambda path: natural_key(path.stem))
    if not paths:
        parser.error("No PNG sprites found")
    for folder in ("heads", "body", "check", "check/reconstructed", "check/occlusion"):
        (out / folder).mkdir(parents=True, exist_ok=True)
    metadata_path = root / "sprites.json"
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    actions = defaultdict(list)
    for path in paths:
        actions[re.sub(r"-\d+$", "", path.stem)].append(path.stem)
    names = {path.stem: path for path in paths}
    profile = Path(args.profile).stem if args.profile else next(
        (name for name in ("turn-0", "walk-0", "run-0") if name in names), None)
    front = Path(args.front).stem if args.front else next(
        (name for name in ("idle-0", "turn-11", "turn-10") if name in names), None)
    if profile not in names or front not in names:
        parser.error("Supply --profile and --front when default reference frames are absent")
    reference_frames = {name: split_head(np.asarray(Image.open(names[name]).convert("RGBA")))
                        for name in (profile, front)}
    references = {view: make_reference(reference_frames[name], name, view, out)
                  for view, name in (("profile", profile), ("front", front))}
    frames = {}
    for path in paths:
        rgba = np.asarray(Image.open(path).convert("RGBA"))
        try:
            try:
                frame = split_head(rgba)
            except ValueError as error:
                frame = split_head_pose(rgba, references)
                frame["fallback_reason"] = str(error)
            else:
                if needs_pose_split(frame):
                    frame = split_head_pose(rgba, references)
                    frame["fallback_reason"] = "Skin beside the hair overlaps the extracted head"
        except ValueError as error:
            raise ValueError(f"{path.name}: {error}") from error
        frames[path.stem] = frame
        Image.fromarray(frame["body"]).save(out / "body" / path.name)
    head_metadata = {view: {key: value for key, value in ref.items() if key != "pixels"}
                     for view, ref in references.items()}
    (out / "heads" / "pivots.json").write_text(json.dumps(head_metadata, indent=2) + "\n")
    anchors, reconstructions = {}, {}
    table = ["frame          view      angle       x       y     IoU    MAD    fit  flag"]
    print(table[-1], flush=True)
    for name, frame in frames.items():
        fits = frame.get("fits")
        if fits is None:
            fits = {view: find_fit(frame, reference) for view, reference in references.items()}
        view = min(fits, key=lambda key: fits[key]["loss"])
        anchor = {"view": view, **{key: round(fits[view][key], 3)
                                   for key in ("x", "y", "angle")}}
        reconstruction, head = reconstruct(frame, references[view], anchor)
        scores = verify(frame, reconstruction, head)
        anchor.update({key: round(value, 6) if isinstance(value, float) else value
                       for key, value in scores.items()})
        if "cut_method" in frame:
            anchor.update({"cut_method": frame["cut_method"], "flagged": True,
                           "fallback_reason": frame["fallback_reason"]})
            occlusion_name = f"check/occlusion/{name}.png"
            Image.fromarray(np.uint8(frame["occlusion"]) * frame["rgba"][..., 3]).save(out / occlusion_name)
            anchor["occlusion_mask"] = occlusion_name
        anchors[name] = anchor
        reconstructions[name] = reconstruction
        Image.fromarray(straight_rgba(reconstruction)).save(out / "check" / "reconstructed" / f"{name}.png")
        table.append(f'{name:14} {view:8} {anchor["angle"]:7.2f} {anchor["x"]:7.2f}'
                     f' {anchor["y"]:7.2f} {scores["iou"]:7.3f} {scores["mad"]:6.2f}'
                     f' {scores["fit"]:6.3f}  {"*" if anchor["flagged"] else ""}')
        print(table[-1], flush=True)
    (out / "anchors.json").write_text(json.dumps(anchors, indent=2) + "\n")
    summaries = {}
    table.append("\naction      frames  mean IoU   min IoU  mean MAD  mean fit  flagged")
    print(table[-1], flush=True)
    for action, names in actions.items():
        metrics = [anchors[name] for name in names]
        summary = {"frames": len(names), "mean_iou": float(np.mean([m["iou"] for m in metrics])),
                   "min_iou": float(min(m["iou"] for m in metrics)),
                   "mean_mad": float(np.mean([m["mad"] for m in metrics])),
                   "mean_fit": float(np.mean([m["fit"] for m in metrics])),
                   "flagged": [name for name in names if anchors[name]["flagged"]]}
        summaries[action] = summary
        table.append(f'{action:11} {len(names):6} {summary["mean_iou"]:9.3f}'
                     f' {summary["min_iou"]:9.3f} {summary["mean_mad"]:9.2f}'
                     f' {summary["mean_fit"]:9.3f}  {", ".join(summary["flagged"]) or "none"}')
        print(table[-1], flush=True)
        contact_sheet(names, frames, reconstructions, anchors, out, action)
        contact_sheet(names, frames, reconstructions, anchors, out, action, close=True)
    report = {"size": metadata.get("size", [frames[profile]["rgba"].shape[1],
                                           frames[profile]["rgba"].shape[0]]),
              "ground": metadata.get("ground"),
              "metrics": {"iou": "Soft alpha intersection / union of extracted and placed head",
                          "binary_iou": "Head silhouette IoU at alpha > 0.5",
                          "mad": "Premultiplied RGBA absolute error, 0..255, on the head union",
                          "fit": "iou * (1 - mad / 255)",
                          "flagged": "fit < 0.85 or mad > 20 or fitted-jaw fallback"},
              "actions": summaries, "frames": anchors}
    (out / "check" / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    (out / "check" / "metrics.txt").write_text("\n".join(table) + "\n")
    (out / "README.md").write_text(
        "# Head pieces and anchors\n\n"
        "`heads/pivots.json` gives each cropped piece's pivot, dimensions, source and crop. "
        "Coordinates use the top-left origin; x increases right, y down. Angle is degrees "
        "clockwise. For each piece pixel q, place it at anchor + R(angle) * (q - pivot). "
        "Use premultiplied alpha when interpolating, then composite over `body/<name>.png`.\n\n"
        "If an anchor has `occlusion_mask`, load that grayscale PNG. Body pixels where the "
        "mask is nonzero are the foreground: draw background body, placed head, then those "
        "foreground body pixels with their original alpha. This keeps hands, arms and tucked "
        "knees in front of a replacement head, including soft outline edges.\n\n"
        "The default profile source is turn-0 (then walk-0 or run-0); the front source is "
        "idle-0 (then turn-11 or turn-10). Soft alpha is preserved, with colour-key fringe "
        "RGB replaced by nearby opaque outline colours in the reference pieces.\n\n"
        "The body retains original pixels outside the hair/face region, including the neck. "
        "Detection uses connected brown hair and neighbouring skin components. The dark jaw "
        "outline divides face and neck; proximity to other skin and clothing stops growth. "
        "Arms are not selected just because they are above the collar. Touching limbs are "
        "kept as separate skin components, with their nearby dark outlines. Tiny magenta "
        "colour-key artifacts are excluded from clothing seeds.\n\n"
        "Ordinary frames retain the original -20..20 degree fitting and neck cut. If the neck "
        "is missing or another skin component overlaps the cut, hair-centred fitting searches "
        "both heads over -35..35 degrees, ignoring retained body pixels. The fitted reference "
        "jaw line estimates the cut in the local neck strip. These anchors have "
        "`cut_method: fitted_jaw`, `fallback_reason`, and `flagged: true`. All fits refine to "
        "quarter-pixel/quarter-degree steps. Metrics are defined in `check/metrics.json`; "
        "occlusion-aware IoU measures the visible placed head. "
        "All anchors include fit and flagged. Poor fits use the lower-error of the two views. "
        "Diff sheets show premultiplied RGBA error amplified three times.\n\n"
        "Two rigid references cannot reproduce changing expressions, head size, hair shape "
        "or three-quarter perspective. Hair/skin thresholds are specific to this art palette. "
        "Skin components joined without a separating outline, disconnected hair and poses "
        "outside the angle range may need additional masks or references. New frame sets "
        "can select references with --profile and --front.\n")


if __name__ == "__main__":
    main()
