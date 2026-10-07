"""Pack the lobby art and the original rig's half-size WebP sprite format.
Usage: <venv>/bin/python build.py <out.html>
"""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parent
ART = Path('/root/apps/academia/art')
FRAMES = ART / 'incoming/cuadros'
SOURCES = {}
META = {}
DATA = json.loads((ROOT / 'academia.json').read_text())
DEBUG = ROOT / 'shots3'


def add(name, img, quality=90):
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=quality, method=4)
    SOURCES[name] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def recolour(img, hue):
    """Replace violet hues, preserving HSL lightness, chroma, alpha and dark outlines."""
    a = np.asarray(img).copy()
    rgb = a[..., :3].astype(float) / 255
    hi, lo = rgb.max(2), rgb.min(2)
    chroma = hi - lo
    h = np.asarray(img.convert('HSV'))[..., 0].astype(float) * 360 / 255
    use = (h > 245) & (h < 335) & (chroma > .08) & (hi > .13) & (a[..., 3] > 0)
    hp = hue / 60
    x = chroma * (1 - abs(hp % 2 - 1))
    zero = np.zeros_like(chroma)
    channels = [(chroma,x,zero),(x,chroma,zero),(zero,chroma,x),(zero,x,chroma),(x,zero,chroma),(chroma,zero,x)][int(hp)%6]
    mapped = np.stack(channels, axis=2) + lo[..., None]
    a[..., :3][use] = np.clip(mapped[use] * 255, 0, 255).astype('uint8')
    return Image.fromarray(a)


def piece(name, img):
    bounds = img.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox()
    META[name] = {'size':list(img.size), 'bounds':list(bounds), 'ground':bounds[3]-1}
    if name in DATA.get('palette', {}):
        img = recolour(img, DATA['palette'][name])
    if name in ('muro', 'atrio'):
        # Soften only the colour: Brightness on RGBA would also scale the alpha, and the atrium's
        # cut-out edges would let the wall behind show through it.
        alpha = img.getchannel('A') if img.mode == 'RGBA' else None
        img = ImageEnhance.Color(ImageEnhance.Brightness(img.convert('RGB')).enhance(.85)).enhance(.86)
        if alpha:
            img.putalpha(alpha)
    animation = DATA.get('animations', {}).get(name, {})
    if 'sway' in animation:
        cut = Image.new('L', img.size)
        ImageDraw.Draw(cut).polygon([tuple(p) for p in animation['sway']['polygon']], fill=255)
        moving = img.copy()
        moving.putalpha(Image.fromarray(np.minimum(np.asarray(img)[...,3], np.asarray(cut))))
        add(name+'_sway', moving)
        backing = img.copy()
        if name == 'tablon':
            ImageDraw.Draw(backing).polygon([tuple(p) for p in animation['sway']['polygon']],fill='#aa7950')
        else:
            backing.putalpha(Image.fromarray(np.minimum(np.asarray(img)[...,3],255-np.asarray(cut))))
        packed = backing
    else:
        packed = img
    # Architecture is drawn far below its raw source size; retain source-coordinate metadata.
    cap = {'muro':1280,'atrio':1400,'escalera':900,'cofre':384,'cofre_abierto':384,'suelo':1600,
           'ui_marco':640,'ui_cinta':600,'ui_pergamino':640,'ui_casilla':160,
           'ui_etiqueta':120,'ui_cerrar':64,'ui_boton_oro':283,'ui_boton_teal':260,
           'ui_repisa':446}.get(name)
    if name.startswith(('ico_', 'objeto_')):
        cap = 128
    if cap:
        packed = packed.copy()
        packed.thumbnail((cap,cap),Image.Resampling.LANCZOS)
    add(name, packed, quality=85 if name in ('muro','atrio','suelo') else 90)
    if name.startswith(('ui_', 'ico_', 'objeto_')):
        META[name]['packedSize'] = list(packed.size)
    debug = Image.new('RGBA', img.size, '#263743')
    debug.alpha_composite(img)
    draw = ImageDraw.Draw(debug)
    draw.line((0,bounds[3]-1,img.width,bounds[3]-1), fill='#44ff99', width=2)
    for x,y,r,*_ in animation.get('circles', []):
        draw.ellipse((x-r,y-r,x+r,y+r), outline='#ff6262', width=2)
    for x,y,r in animation.get('lights', []):
        draw.ellipse((x-r,y-r,x+r,y+r), outline='#ffff77', width=2)
    for key in ('sway','screen'):
        region = animation.get(key)
        if region:
            polygon = region['polygon'] if isinstance(region, dict) else region
            draw.line([tuple(v) for v in polygon]+[tuple(polygon[0])], fill='#66f0ff', width=2)
    if 'twinkle' in animation:
        x,y = animation['twinkle']; draw.ellipse((x-7,y-7,x+7,y+7), outline='white', width=2)
    if name == 'escalera':
        for i,(x,y) in enumerate(DATA['stairArt']['treads']):
            draw.line((x,y+8,min(x+95,img.width),y+8),fill='#66ff88',width=3)
            draw.text((x,y+10),str(i),fill='white')
    for row in {'galeria':[15,30,80], 'suelo':[0,167], 'baranda':[174], 'colgante':[50]}.get(name, []):
        draw.line((0,row,img.width,row),fill='#66ff88',width=2)
    debug.convert('RGB').save(DEBUG / (name+'-regions.jpg'), quality=90)
    return img


def portal_mask(img):
    """Opening silhouette follows the coloured interior, measured row by row."""
    hsv = np.asarray(img.convert('HSV'))
    h, s, v = hsv[...,0].astype(float)*360/255, hsv[...,1], hsv[...,2]
    # Work on original art: the opening's purple is distinct from the brass surround.
    # The colour of the outer arch is also violet. Restrict extraction to the measured
    # inner arch, then preserve the brass ornaments crossing its silhouette.
    edge=[(198,147),(168,161),(147,181),(130,203),(116,230),(107,256),(105,285),
          (113,318),(122,353),(135,386),(146,416)]
    ys=np.arange(148,417)
    left=np.interp(ys,[p[1] for p in edge],[p[0] for p in edge]).astype(int)
    right=452-left
    mask=Image.new('RGBA',img.size);draw=ImageDraw.Draw(mask)
    polygon=[(int(left[i]),148+i) for i in range(len(ys))]+[(int(right[i]),148+i) for i in reversed(range(len(ys)))]
    draw.polygon(polygon,fill='white')
    interior=((h>235)&(h<325)&(s>45)) | ((s<65)&(v>180))
    mask.putalpha(Image.fromarray((np.asarray(mask)[...,3]*(interior.astype(float))).astype('uint8')))
    add('portal_mask',mask)
    # Remove the painted swirl so the procedural vortex is the only interior.
    frame=img.copy();frame.putalpha(Image.fromarray(np.minimum(np.asarray(img)[...,3],255-np.asarray(mask)[...,3]).astype('uint8')))
    add('portal',recolour(frame,DATA['palette']['portal']))
    debug=img.copy();overlay=Image.new('RGBA',img.size,'#40ffff')
    overlay.putalpha(mask.getchannel('A').point(lambda a:a//3))
    debug.alpha_composite(overlay)
    ImageDraw.Draw(debug).line(polygon+[polygon[0]],fill='white',width=1)
    debug.save(DEBUG/'portal-mask.png')
    mask.save(DEBUG/'portal-mask-alpha.png')
    frame.save(DEBUG/'portal-frame.png')
    META['portal']['opening']={'polygon':polygon[::8], 'bounds':[100,148,351,417]}


def half(img):
    return img.resize((img.width // 2, img.height // 2), Image.Resampling.LANCZOS)


def sprites(folder, prefix, rest, bodies=None):
    sheet = json.loads((folder / 'sprites.json').read_text())
    info = {'actions': sheet['actions'], 'size': None, 'stand': None, 'ground': round(sheet['ground'] / 2)}
    for filename in dict.fromkeys(f for files in sheet['actions'].values() for f in files):
        original = half(Image.open(folder / filename).convert('RGBA'))
        info['size'] = list(original.size)
        if filename == rest:
            ys = np.nonzero(np.asarray(original)[..., 3] > 128)[0]
            info['stand'] = int(ys.max() - ys.min())
        add(prefix + '_' + filename[:-4], half(Image.open(bodies / filename).convert('RGBA')) if bodies else original)
    return info


def pack():
    DEBUG.mkdir(exist_ok=True)
    pieces = ART / 'academia/piezas'
    for file in sorted(pieces.glob('*.png')):
        if file.stem in ('estela_alt','estela','fondo_salon','balcon','escalera','engranaje','piso_marmol'):
            continue
        img = Image.open(file).convert('RGBA')
        piece(file.stem, img)
        if file.stem == 'portal':
            portal_mask(img)
    for file in sorted((ART / 'academia/v2/piezas').glob('*.png')):
        img=Image.open(file).convert('RGBA')
        if file.stem == 'cofre':
            # The supplied pair shares a canvas but the closed base is 36 px higher.
            aligned=Image.new('RGBA',img.size)
            aligned.alpha_composite(img,(0,36))
            img=aligned
        piece(file.stem, img)
        if file.stem == 'cofre':
            META['cofre']['alignmentOffset']=[0,36]
    estela = FRAMES / 'estela-cuadros'
    sheet = json.loads((estela / 'sprites.json').read_text())
    frames = sheet['actions']['idle'][:-1]  # duplicate loop endpoint
    frame_size = (320, round(996*320/702))
    META['estela'] = {'size':list(frame_size), 'ground':sheet['ground']*frame_size[1]/996, 'frames':len(frames), 'fps':12}
    for filename in frames:
        img = Image.open(estela / filename).convert('RGBA').resize(frame_size,Image.Resampling.LANCZOS)
        add('estela_' + filename[:-4], img, quality=74)
    postcard = Image.open(ART / 'historia/cap1/img/bg_palos.png').convert('RGB')
    postcard.thumbnail((640, 400), Image.Resampling.LANCZOS)
    add('postal_palos', postcard, quality=75)
    heads = FRAMES / 'nino-cabezas'
    kid = sprites(FRAMES / 'nino-cuadros', 'kid', 'turn-0.png', heads / 'body')
    kid['anchors'] = {}
    for name, anchor in json.loads((heads / 'anchors.json').read_text()).items():
        kid['anchors'][name] = {'view': anchor['view'], 'x': round(anchor['x'] / 2, 2),
                                'y': round(anchor['y'] / 2, 2), 'angle': anchor['angle'], 'occ': 'occlusion_mask' in anchor}
        if 'occlusion_mask' in anchor:
            mask = half(Image.open(heads / anchor['occlusion_mask']).convert('L'))
            white = Image.new('RGBA', mask.size, (255, 255, 255, 255))
            white.putalpha(mask)
            add('kidocc_' + name, white)
    pivots = json.loads((heads / 'heads/pivots.json').read_text())
    styles = json.loads((heads / 'estilos/estilos.json').read_text())
    kid['styles'] = {}
    for style, meta in styles.items():
        kid['styles'][style] = {'label': meta['label']}
        for view in ['profile', 'front'] + [key for key in meta if key.startswith('front_')]:
            if style == 'desordenado' and view in ('profile', 'front'):
                file, pivot = heads / 'heads' / (view + '.png'), pivots[view]['pivot']
            else:
                file, pivot = heads / 'estilos' / (style + '-' + view.replace('_', '-') + '.png'), meta[view]
            img = half(Image.open(file).convert('RGBA'))
            add('kid_head_' + style + '_' + view, img)
            kid['styles'][style][view] = {'pivot': [round(v / 2, 2) for v in pivot], 'size': list(img.size)}
    kid['faces'] = json.loads((heads / 'estilos/caras.json').read_text())
    bug = json.loads((heads / 'bug.json').read_text())
    img = half(Image.open(heads / 'bug.png').convert('RGBA'))
    add('kid_bug', img)
    kid['bug'] = {'size': list(img.size), 'facing': bug['facing'], 'frames': {
        name: {'x': round(a['x'] / 2, 1), 'y': round(a['y'] / 2, 1), 'dir': a['dir']} for name, a in bug['frames'].items()}}
    pet = sprites(FRAMES / 'zorro-cuadros', 'pet', 'sit-0.png')
    pet['sit'] = pet.pop('stand')
    return kid, pet


def challenges(chapter):
    found = []
    def walk(beats):
        for beat in beats:
            if beat['type'] == 'challenge':
                found.append(beat)
            walk(beat.get('then', []))
            walk(beat.get('else', []))
            for option in beat.get('options', []):
                if isinstance(option, dict):
                    walk(option.get('then', []))
    for scene in chapter['scenes']:
        walk(scene['beats'])
    return found


def script_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: build.py <out.html>')
    kid, pet = pack()
    page = (ROOT / 'plantilla.html').read_text()
    values = {'__SRC_JSON__': SOURCES, '__ART_JSON__': META, '__KID_JSON__': kid, '__PET_JSON__': pet,
              '__MAP_JSON__': DATA,
              '__CHALLENGES_JSON__': challenges(json.loads((ROOT / 'ref/cap1.json').read_text()))}
    for marker, value in values.items():
        if marker not in page:
            raise ValueError('Missing placeholder: ' + marker)
        page = page.replace(marker, script_json(value))
    size = len(page.encode('utf-8'))
    if size >= 12_500_000:
        raise ValueError(f'Page exceeds 12.5 MB: {size:,} bytes')
    out = Path(sys.argv[1])
    out.write_text(page)
    (DEBUG / 'measurements.json').write_text(json.dumps({'pieces':META,'stairs':DATA['stairArt'],'animations':DATA['animations']},ensure_ascii=False,indent=2)+'\n')
    groups = {group:sum(len(value) for name,value in SOURCES.items() if name.startswith(group))
              for group in ('kid','pet','estela')}
    groups['architecture_and_stations'] = sum(map(len,SOURCES.values())) - sum(groups.values())
    (DEBUG / 'asset-budget.json').write_text(json.dumps({'htmlBytes':size,'images':len(SOURCES),'dataUriBytes':groups},indent=2)+'\n')
    print(f'{out}: {size:,} bytes; {len(SOURCES)} packed images; {len(kid["actions"])} child actions')


if __name__ == '__main__':
    main()
