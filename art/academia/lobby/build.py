"""Pack the lobby art and the original rig's half-size WebP sprite format.
Usage: <venv>/bin/python build.py <out.html>
"""
import base64
import io
import json
import shutil
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
ART = Path('/root/apps/academia/art')
CHAPTER = Path('/root/apps/academia/content/historia/5b/cap1.json')
# Prices, chest rewards and sparks, read by the backend: the server validates with the same numbers.
ECONOMY = Path('/root/apps/academia/shared/academy/economia.json')
# The copy games.laravas.com serves at /academia/. claude.ai wraps an artifact in a document with a
# charset and a viewport; served on its own the page needs them, or accents and phones break.
GAME_PAGE = Path('/root/apps/academia/frontend/public/academia/index.html')
GAME_HEAD = ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
             '<style>body{margin:0}</style></head><body>')
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
    cap = {'muro':1280,'atrio':1400,'escalera':900,'cofre':384,'cofre_abierto':384,'suelo':1600,'banco':1100,
           'ui_marco':640,'ui_cinta':600,'ui_pergamino':640,'ui_casilla':160,
           'ui_etiqueta':120,'ui_cerrar':64,'ui_boton_oro':283,'ui_boton_teal':260,
           'ui_repisa':446}.get(name)
    if name.startswith(('ico_', 'objeto_')):
        cap = 128
    if cap:
        packed = packed.copy()
        packed.thumbnail((cap,cap),Image.Resampling.LANCZOS)
    add(name, packed, quality=85 if name in ('muro','atrio','suelo','banco') else 90)
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
    if name == 'cofre':
        lock = DATA['animations']['cofre']['padlock']
        x, y = lock['anchor']
        left, top, right, bottom = lock['claspBounds']
        offset = 36
        draw.rectangle((left,top+offset,right,bottom+offset),outline='#66f0ff',width=5)
        icon = Image.open(ART/'academia/v2/piezas/ico_candado.png').convert('RGBA')
        width = round(img.width*lock['width'])
        icon = icon.resize((width,round(width*icon.height/icon.width)),Image.Resampling.LANCZOS)
        debug.alpha_composite(icon,(round(x-width/2),round(y)))
        draw.line((x-30,y,x+30,y),fill='#ff6262',width=5)
        draw.line((x,y-30,x,y+30),fill='#ff6262',width=5)
        draw.text((x+36,y-20),'Shackle anchor (includes +36 alignment)',fill='white')
        debug.save(DEBUG/'padlock-anchor.png')
    if name == 'portal':
        for i,(x,y,r,*_) in enumerate(animation.get('circles',[])):
            draw.line((x-5,y,x+5,y),fill='#ff6262',width=2)
            draw.line((x,y-5,x,y+5),fill='#ff6262',width=2)
            draw.text((x+r,y),str(i+1),fill='white')
        debug.save(DEBUG/'portal-gears.png')
    if name == 'arcade':
        for label,(x,y) in zip(('TL','TR','BR','BL'),animation['screen']):
            draw.text((x-9,y-12),label,fill='white')
        debug.save(DEBUG/'arcade-quad.png')
    if name == 'banco':
        x,y,r,_ = animation['circles'][0]
        draw.line((x-25,y,x+25,y),fill='#66ffff',width=3)
        draw.line((x,y-25,x,y+25),fill='#66ffff',width=3)
        draw.text((x+r+8,y),'Vault wheel pivot',fill='white')
        debug.save(DEBUG/'bank-wheel.png')
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
    # The video replaces the painted swirl; retain the original ornaments as a foreground.
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
    DATA['animations']['portal']['vortex']['edge']=polygon[::8]
    return mask.getchannel('A')


def portal_video(img, mask):
    bbox = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    scale = 792 / (bbox[3]-bbox[1])
    canvas_width = round((bbox[2]-bbox[0])*scale)
    origin = [(1600-canvas_width)/2, 855-792]
    video_scale = scale*.8
    offset = [origin[0]*.8-bbox[0]*video_scale, origin[1]*.8-bbox[1]*video_scale]
    opening = DATA['animations']['portal']['vortex']['bounds']
    margin = 8
    crop = [int(np.floor(offset[i%2]+(v-margin)*video_scale)) if i<2
            else int(np.ceil(offset[i%2]+(v+margin)*video_scale)) for i,v in enumerate(opening)]
    left,top,right,bottom = crop
    width,height = right-left,bottom-top
    source_rect = [(v-offset[i%2])/video_scale for i,v in enumerate(crop)]
    packed_size = [300,round(height*300/width)]
    # Transform from the packed crop back into the original piece's mask coordinates.
    alpha = mask.transform(tuple(packed_size),Image.Transform.AFFINE,
                           ((source_rect[2]-source_rect[0])/packed_size[0],0,source_rect[0],
                            0,(source_rect[3]-source_rect[1])/packed_size[1],source_rect[1]),
                           resample=Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(.65))
    video = ART/'incoming/animaciones/portal-vortice.mp4'
    command = ['ffmpeg','-v','error','-threads','1','-filter_threads','1','-i',str(video),
               '-vf',f"select='lt(n,144)*not(mod(n,3))',crop={width}:{height}:{left}:{top}",
               '-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1']
    raw = subprocess.run(command,check=True,stdout=subprocess.PIPE).stdout
    frame_bytes = width*height*3
    if len(raw) != 48*frame_bytes:
        raise ValueError(f'Expected 48 portal frames, received {len(raw)/frame_bytes}')
    keys = []
    for i in range(48):
        frame = Image.frombytes('RGB',(width,height),raw[i*frame_bytes:(i+1)*frame_bytes])
        frame = frame.resize(tuple(packed_size),Image.Resampling.LANCZOS)
        frame.putalpha(alpha)
        key = f'portal_video-{i}'
        add(key,frame,quality=72)
        keys.append(key)
        if i in (0,12,24,36):
            frame.save(DEBUG/f'portal-video-sample-{i}.png')
    META['portal_video'] = {'size':packed_size,'frames':48,'fps':8,'frameKeys':keys,
                            'sourceRect':source_rect,'videoCrop':crop,'sourceIndices':list(range(0,144,3)),
                            'mapping':{'bbox':list(bbox),'scale':scale,'origin':origin,
                                       'videoScale':video_scale,'videoOffset':offset}}
    first = subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(video),'-frames:v','1',
                            '-f','image2pipe','-vcodec','png','pipe:1'],check=True,stdout=subprocess.PIPE).stdout
    first = Image.open(io.BytesIO(first)).convert('RGBA')
    overlay = img.crop(bbox).resize((round(canvas_width*.8),round(792*.8)),Image.Resampling.LANCZOS)
    overlay.putalpha(overlay.getchannel('A').point(lambda a:round(a*.5)))
    first.alpha_composite(overlay,(round(origin[0]*.8),round(origin[1]*.8)))
    draw = ImageDraw.Draw(first)
    mapped = [offset[i%2]+v*video_scale for i,v in enumerate(opening)]
    draw.rectangle(mapped,outline='#66ffff',width=3)
    draw.rectangle(crop,outline='#ffcc66',width=2)
    first.save(DEBUG/'portal-video-alignment.png')


def idle_loop(name, width, stride=1, quality=72, center=None):
    folder = FRAMES/(name+'-cuadros')
    sheet = json.loads((folder/'sprites.json').read_text())
    filenames = sheet['actions']['idle'][:-1:stride]
    source_width,source_height = sheet['size']
    size = [width,round(source_height*width/source_width)]
    sx,sy = size[0]/source_width,size[1]/source_height
    ground = sheet['ground']*sy
    rest = Image.open(folder/filenames[0]).convert('RGBA')
    rest_bounds = rest.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
    keys,bounds = [],[]
    for filename in filenames:
        img = Image.open(folder/filename).convert('RGBA')
        bounds.append(img.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox())
        img = img.resize(tuple(size),Image.Resampling.LANCZOS)
        key = name+'_'+filename[:-4]
        add(key,img,quality=quality)
        keys.append(key)
    union = np.array(bounds)
    animation = name if name=='estela' else name+'_idle'
    META[animation] = {'size':size,'ground':ground,'stand':ground if name=='estela' else (sheet['ground']-rest_bounds[1])*sy,
                       'centerX':(source_width/2 if center is None else center)*sx,
                       'bounds':[float(union[:,0].min()*sx),float(union[:,1].min()*sy),
                                 float(union[:,2].max()*sx),float(union[:,3].max()*sy)],
                       'sourceSize':sheet['size'],'sourceGround':sheet['ground'],
                       'frames':len(keys),'fps':12/stride,'frameKeys':keys,
                       'sourceIndices':list(range(0,len(sheet['actions']['idle'])-1,stride))}


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
    # Inline the app's exact flower paths, translating JSX attributes into SVG attributes.
    jsx = (Path('/root/apps/academia/frontend/src/components')/'Copihue.jsx').read_text()
    paths = re.findall(r'<path\b.*?/>', jsx.split('export function Copihues(')[0], re.S)
    paths = [p.replace('strokeWidth','stroke-width').replace('strokeLinecap','stroke-linecap').replace('strokeLinejoin','stroke-linejoin').replace('stroke={INK}','stroke="#1A1A2E"') for p in paths]
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'+''.join(paths)+'</svg>'
    SOURCES['ico_copihue']='data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode()
    META['ico_copihue']={'size':[32,32],'bounds':[0,0,32,32],'ground':31,'packedSize':[32,32]}
    pieces = ART / 'academia/piezas'
    for file in sorted(pieces.glob('*.png')):
        if file.stem in ('estela_alt','estela','banco','fondo_salon','balcon','escalera','engranaje','piso_marmol'):
            continue
        img = Image.open(file).convert('RGBA')
        piece(file.stem, img)
        if file.stem == 'portal':
            portal_video(img,portal_mask(img))
    for file in sorted((ART / 'academia/v2/piezas').glob('*.png')):
        img=Image.open(file).convert('RGBA')
        if file.stem == 'cofre':
            # The supplied pair shares a canvas but the closed base is 36 px higher.
            aligned=Image.new('RGBA',img.size)
            aligned.alpha_composite(img,(0,36))
            img=aligned
        if file.stem == 'banco_ancho':
            continue  # superseded by banco_mueble (2026-10-07: the stone front looked pasted on the hall)
        piece('banco' if file.stem=='banco_mueble' else file.stem, img)
        if file.stem == 'cofre':
            META['cofre']['alignmentOffset']=[0,36]
    idle_loop('estela',280,quality=68)
    # Boot-span centres keep the body anchored when asymmetric packs and hands flip sides.
    idle_loop('mercader',190,quality=68,center=431.5)
    idle_loop('tempo',190,quality=68,center=330.5)
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


def export_economy():
    entities = DATA['entities']
    keep = lambda d, *keys: {k: d[k] for k in keys if k in d}
    economy = {
        'catalog': [{**keep(i, 'id', 'name', 'text', 'price'), 'currency': i.get('currency', 'tokens')} for i in DATA['catalog']],
        'chests': [{**keep(e, 'id', 'requiresSparks'), 'reward': e.get('reward', {})} for e in entities if e['type'] == 'chest'],
        'sparks': [e['id'] for e in entities if e['type'] == 'collectible'],
        'practice': keep(DATA['practice'], 'tokensEach', 'dailyRewards'),
    }
    ECONOMY.parent.mkdir(exist_ok=True)
    ECONOMY.write_text(json.dumps(economy, ensure_ascii=False, indent=1) + '\n')


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: build.py <out.html>')
    kid, pet = pack()
    page = (ROOT / 'plantilla.html').read_text()
    values = {'__SRC_JSON__': SOURCES, '__ART_JSON__': META, '__KID_JSON__': kid, '__PET_JSON__': pet,
              '__MAP_JSON__': DATA,
              '__CHALLENGES_JSON__': challenges(json.loads(CHAPTER.read_text()))}
    for marker, value in values.items():
        if marker not in page:
            raise ValueError('Missing placeholder: ' + marker)
        page = page.replace(marker, script_json(value))
    size = len(page.encode('utf-8'))
    if size >= 15_500_000:
        raise ValueError(f'Page exceeds 15.5 MB: {size:,} bytes')
    out = Path(sys.argv[1])
    out.write_text(page)
    GAME_PAGE.parent.mkdir(parents=True, exist_ok=True)
    GAME_PAGE.write_text(GAME_HEAD + page + '</body></html>\n')
    # Presence (sockets/academySocket.js) needs the Socket.io client; the game loads it from here,
    # the same version the app uses. The artifact never does.
    shutil.copy(Path('/root/apps/academia/frontend/node_modules/socket.io-client/dist/socket.io.min.js'), GAME_PAGE.parent / 'socket.io.min.js')
    export_economy()
    (DEBUG / 'measurements.json').write_text(json.dumps({'pieces':META,'stairs':DATA['stairArt'],'animations':DATA['animations']},ensure_ascii=False,indent=2)+'\n')
    groups = {group:sum(len(value) for name,value in SOURCES.items() if name.startswith(group))
              for group in ('kid','pet','estela','mercader_idle-','tempo_idle-','portal_video-')}
    groups['architecture_and_stations'] = sum(map(len,SOURCES.values())) - sum(groups.values())
    (DEBUG / 'asset-budget.json').write_text(json.dumps({'htmlBytes':size,'images':len(SOURCES),'dataUriBytes':groups},indent=2)+'\n')
    print(f'{out}: {size:,} bytes; {len(SOURCES)} packed images; {len(kid["actions"])} child actions')


if __name__ == '__main__':
    main()
