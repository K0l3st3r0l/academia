"""Builds the standalone rig prototype: plantilla.html with the child's cut pieces (cut_parts.py)
and the pet's and the child's drawings (mascotas/video_a_sprites.py) inlined as data URIs.

Usage: build.py <dir with rig/, fox-sprites/ and kid-sprites/> <plantilla.html> <out.html>
"""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

S, template, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
rig = json.loads((S / 'rig' / 'rig.json').read_text())
rig.pop('fox', None)
names = ['head', 'head_front', 'torso', 'upper_arm', 'forearm', 'thigh', 'shin']
src = {n: 'data:image/png;base64,' + base64.b64encode((S / 'rig' / f'{n}.png').read_bytes()).decode() for n in names}

def half(img):
    return img.resize((img.width // 2, img.height // 2), Image.LANCZOS)


def add(name, img):
    # WebP at q90 weighs about a quarter of the PNG; with ~350 drawings the page stays light.
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=90, method=4)
    src[name] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


# Frame-by-frame drawings (mascotas/video_a_sprites.py) at half size: about twice what they are
# shown at on a sharp screen. `stand` is the visible height of the resting pose, the one the
# game scales to: the pet sitting, the child standing. `images` is where the drawn frames come
# from when they differ from the cut ones (the child's bodies without the head).
def sprites(folder, prefix, rest, images=None):
    sheet = json.loads((S / folder / 'sprites.json').read_text())
    info = {'actions': sheet['actions'], 'size': None, 'stand': None, 'ground': round(sheet['ground'] / 2)}
    for files in sheet['actions'].values():
        for f in files:
            img = half(Image.open(S / folder / f))
            info['size'] = [img.width, img.height]
            if f == rest:
                ys = np.nonzero(np.asarray(img)[..., 3] > 128)[0]
                info['stand'] = int(ys.max() - ys.min())
            if images:
                img = half(Image.open(images / f))
            add(f'{prefix}_' + f[:-4], img)
    return info


pet = sprites('fox-sprites', 'pet', 'sit-0.png')
pet['sit'] = pet.pop('stand')

# The child: headless bodies (art/rig/personaje/separar_cabeza.py) plus the student's head drawn
# at each frame's anchor, and the body pixels that go in front of the head (hands, tucked knees).
kid = None
if (S / 'kid-sprites').exists():
    heads = S / 'kid-heads'
    kid = sprites('kid-sprites', 'kid', 'turn-0.png', heads / 'body')
    kid['anchors'] = {}
    for name, a in json.loads((heads / 'anchors.json').read_text()).items():
        kid['anchors'][name] = {'view': a['view'], 'x': round(a['x'] / 2, 2), 'y': round(a['y'] / 2, 2),
                                'angle': a['angle'], 'occ': 'occlusion_mask' in a}
        if 'occlusion_mask' in a:
            mask = half(Image.open(heads / a['occlusion_mask']).convert('L'))
            white = Image.new('RGBA', mask.size, (255, 255, 255, 255))
            white.putalpha(mask)
            add(f'kidocc_{name}', white)
    pivots = json.loads((heads / 'heads' / 'pivots.json').read_text())
    styles = json.loads((heads / 'estilos' / 'estilos.json').read_text())
    kid['styles'] = {}
    for style, meta in styles.items():
        kid['styles'][style] = {'label': meta['label']}
        # front_<expression>: the same head facing us asleep, whistling, bored or looking down.
        views = ['profile', 'front'] + [k for k in meta if k.startswith('front_')]
        for view in views:
            if style == 'desordenado' and view in ('profile', 'front'):
                path, pivot = heads / 'heads' / f'{view}.png', pivots[view]['pivot']
            else:
                path, pivot = heads / 'estilos' / f'{style}-{view.replace("_", "-")}.png', meta[view]
            img = half(Image.open(path).convert('RGBA'))
            add(f'kid_head_{style}_{view}', img)
            kid['styles'][style][view] = {'pivot': [round(pivot[0] / 2, 2), round(pivot[1] / 2, 2)], 'size': [img.width, img.height]}
    # The ladybug of the magnifying-glass scene is drawn apart, so it can turn round when the
    # loop plays backwards instead of walking in reverse.
    bug = heads / 'bug.json'
    if bug.exists():
        meta = json.loads(bug.read_text())
        img = half(Image.open(heads / 'bug.png').convert('RGBA'))
        add('kid_bug', img)
        kid['bug'] = {'size': [img.width, img.height], 'facing': meta['facing'],
                      'frames': {n: {'x': round(b['x'] / 2, 1), 'y': round(b['y'] / 2, 1), 'dir': b['dir']}
                                 for n, b in meta['frames'].items()}}
    faces = heads / 'estilos' / 'caras.json'
    kid['faces'] = json.loads(faces.read_text()) if faces.exists() else {}

t = template.read_text()
t = t.replace('__RIG_JSON__', json.dumps(rig)).replace('__SRC_JSON__', json.dumps(src)).replace('__PET_JSON__', json.dumps(pet)).replace('__KID_JSON__', json.dumps(kid))
out.write_text(t)
print(len(t) // 1024, 'KB')
