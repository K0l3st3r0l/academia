"""Cut the opening film from guion.json into frontend/public/academia/apertura/.

Usage: python3 montar.py

Writes parte1.mp4 (the story), the live scene's art and audio, parte2.mp4 (the mission, the
portal and the title), parte3.mp4 (what you do in the Academy, over real lobby footage) and
apertura.json, the manifest AcademyIntro.jsx plays. Missing pieces degrade instead of failing:
without a voice clip the line is only subtitled, with an estimated duration; without a Grok shot
its still frame is used with a slow zoom. Rerun after gen-voz.py or grabar.cjs add material.
"""
import hashlib
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path('/root/apps/academia/frontend/public/academia/apertura')
WORK = HERE / 'trabajo'
ART = Path('/root/apps/academia/art/academia')
URL = '/academia/apertura/'
GUION = json.loads((HERE / 'guion.json').read_text())
LINES = GUION['lineas']
W, H, FPS = 1280, 720, 24
FADE = 0.6          # crossfade between shots
LEAD = 1.0          # a shot breathes before its line starts
TAIL = 1.4          # and after it ends
WORDS_PER_S = 2.4   # estimate when there is no voice yet
# The still each Grok shot started from: the stand-in while the shot does not exist.
STILLS = {'v01-reloj-oscuro': 'c01-reloj-oscuro.png', 'v02-academia-exterior': 'c02-academia-exterior.png',
          'v03-reloj-atrio': 'c03-reloj-atrio.png', 'v04-tormenta': 'c04-reloj-quebrado.png',
          'v05-carabela': 'c05-carabela.png', 'v06-ciudad-colonial': 'c06-ciudad-colonial.png',
          'v07-portal': 'c07-portal-atrio.png', 'c4-estela': 'c4-estela-atrio.png', 'g-mision': 'c08-estela-brujula.png'}
WHISPER = '''
import io, json, sys
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = m.transcribe(io.BytesIO(sys.stdin.buffer.read()), language="es", beam_size=5, word_timestamps=True)
print(json.dumps([{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in s.words]))
'''


def sh(*args, **kw):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, **kw)


def duration(path):
    return float(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path).stdout)


def count(text):
    return len(re.findall(r"[\wáéíóúñü¿¡]+", text, re.I))


# --- Voice: Whisper word timings, split into the guion's lines --------------------------------

def words_of(clip):
    cache = WORK / (clip.stem + '.words.json')
    if cache.exists() and cache.stat().st_mtime > clip.stat().st_mtime:
        return json.loads(cache.read_text())
    wav = sh('ffmpeg', '-v', 'error', '-i', clip, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', '-').stdout
    # The ProsodIA Whisper container already has the model; the audio goes in by stdin, nothing is written there.
    words = json.loads(subprocess.run(['docker', 'exec', '-i', 'prosodia-whisper', 'python3', '-c', WHISPER],
                                      input=wav, capture_output=True, check=True).stdout)
    cache.write_text(json.dumps(words, ensure_ascii=False))
    return words


def split_lines(ids, words):
    """Each line's words; the boundary is the longest pause near the expected word count."""
    out, start = {}, 0
    for i, line in enumerate(ids):
        if i == len(ids) - 1:
            out[line] = words[start:]
            break
        target = start + count(LINES[line])
        near = range(max(start + 1, target - 3), min(len(words) - 1, target + 3) + 1)
        cut = max(near, key=lambda k: words[k]['s'] - words[k - 1]['e'], default=target)
        out[line], start = words[start:cut], cut
    return out


def voices():
    """line id -> {clip, words}; e1 is said in the first test shot."""
    found = {}
    own = HERE / 'clips' / 'c4-estela.mp4'
    if own.exists():
        found['e1'] = {'clip': own, 'words': words_of(own)}
    for group in GUION['voces']:
        clip = HERE / 'voz' / f"{group['id']}.mp4"
        if clip.exists():
            for line, words in split_lines(group['lineas'], words_of(clip)).items():
                found[line] = {'clip': clip, 'words': words}
    return found


def line_audio(line, voice):
    """The line alone, loudness-normalized; returns (wav, length)."""
    out = WORK / f'{line}.wav'
    w = voice['words']
    start, end = max(0, w[0]['s'] - 0.12), w[-1]['e'] + 0.3
    sh('ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', voice['clip'], '-vn',
       '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', '48000', '-ac', '2', out)
    return out, end - start, start


def cues(line, at, voice=None, clip_offset=0.0):
    """Subtitles for a line, one sentence at a time, starting at `at` in the scene.
    With a voice, times come from its words (clip_offset = where the cut audio began)."""
    text = LINES[line]
    sentences = [s for s in re.split(r'(?<=[.!?…:])\s+', text) if s]
    result, used = [], 0
    if voice:
        w = voice['words']
        for i, sentence in enumerate(sentences):
            n = count(sentence)
            chunk = w[used:used + n] if i < len(sentences) - 1 else w[used:]
            used += n
            if not chunk:
                continue
            result.append({'start': round(at + chunk[0]['s'] - clip_offset, 2),
                           'end': round(at + chunk[-1]['e'] - clip_offset + 0.35, 2), 'text': sentence})
    else:
        t = at
        for sentence in sentences:
            length = max(1.6, count(sentence) / WORDS_PER_S)
            result.append({'start': round(t, 2), 'end': round(t + length, 2), 'text': sentence})
            t += length + 0.25
    # A sentence's tail never covers the next one.
    for current, following in zip(result, result[1:]):
        current['end'] = min(current['end'], round(following['start'] - 0.05, 2))
    return result


def spoken_length(line, voice):
    if voice:
        return voice['words'][-1]['e'] - voice['words'][0]['s']
    return sum(max(1.6, count(s) / WORDS_PER_S) + 0.25 for s in re.split(r'(?<=[.!?…:])\s+', LINES[line]))


# --- Shots -----------------------------------------------------------------------------------

def still_shot(frame, length, out, audio=None):
    """A still with a slow push-in, for shots Grok has not made yet."""
    frames = int(length * FPS)
    args = ['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', FPS, '-i', frame]
    args += ['-i', audio] if audio else ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
    sh(*args, '-filter_complex',
       f"[0:v]scale={W * 2}:{H * 2},zoompan=z='1+0.08*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
       f":d={frames}:s={W}x{H}:fps={FPS},format=yuv420p[v]",
       '-map', '[v]', '-map', '1:a', '-t', f'{length:.3f}', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium',
       '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', out)


def shot(video, out, length=None, voice_wav=None, voice_at=0.0, bed=0.5):
    """Normalize a clip to the film's format; freeze its last frame to fit `length`, and lay a
    line over its own sound (music and ambience, lowered to `bed`)."""
    own = duration(video)
    length = max(own, length or own)
    vf = f'scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},format=yuv420p'
    if length > own + 0.02:
        vf += f',tpad=stop_mode=clone:stop_duration={length - own:.3f}'
    args = ['ffmpeg', '-v', 'error', '-y', '-i', video]
    if voice_wav:
        args += ['-i', voice_wav]
        af = (f'[0:a]volume={bed},apad[bed];[1:a]adelay={int(voice_at * 1000)}:all=1,apad[vo];'
              f'[bed][vo]amix=inputs=2:duration=first:normalize=0,atrim=0:{length:.3f}[a]')
    else:
        af = f'[0:a]apad,atrim=0:{length:.3f}[a]'
    sh(*args, '-filter_complex', f'[0:v]{vf}[v];{af}', '-map', '[v]', '-map', '[a]', '-t', f'{length:.3f}',
       '-c:v', 'libx264', '-crf', '21', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', out)
    return length


def join(parts, out):
    """Crossfade the shots; returns each shot's start time in the result."""
    lengths = [duration(p) for p in parts]
    starts, t = [0.0], lengths[0]
    for length in lengths[1:]:
        starts.append(t - FADE)
        t += length - FADE
    if len(parts) == 1:
        sh('ffmpeg', '-v', 'error', '-y', '-i', parts[0], '-c:v', 'libx264', '-crf', '27', '-preset', 'slow',
           '-tune', 'animation', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out)
        return starts
    inputs = [a for p in parts for a in ('-i', p)]
    graph, v, a = [], '[0:v]', '[0:a]'
    for i in range(1, len(parts)):
        graph.append(f'{v}[{i}:v]xfade=transition=fade:duration={FADE}:offset={starts[i]:.3f}[v{i}]')
        graph.append(f'{a}[{i}:a]acrossfade=d={FADE}[a{i}]')
        v, a = f'[v{i}]', f'[a{i}]'
    sh('ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(graph), '-map', v, '-map', a,
       '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-tune', 'animation', '-movflags', '+faststart',
       '-c:a', 'aac', '-b:a', '128k', out)
    return starts


def narrated(plano, voice_map, index, name):
    """One shot of the story with its line; returns (file, cues relative to the shot)."""
    line, out = plano.get('linea'), WORK / f'{name}-{index}.mp4'
    if plano['clip'] == '__titulo__':
        return title_card(), []
    clip = HERE / 'clips' / f"{plano['clip']}.mp4"
    voice = voice_map.get(line) if line else None
    if plano.get('voz_propia'):
        if plano['clip'] == 'g-mision':
            clip = HERE / 'voz' / 'g-mision.mp4'
        if not clip.exists():
            length = LEAD + spoken_length(line, None) + TAIL
            still_shot(HERE / 'cuadros' / STILLS[plano['clip']], length, out)
            return out, cues(line, LEAD)
        shot(clip, out)
        return out, cues(line, 0.0, voice) if voice else cues(line, LEAD)
    if not clip.exists():
        still_shot(HERE / 'cuadros' / STILLS[plano['clip']], 8.0, WORK / f'{name}-{index}-still.mp4')
        clip = WORK / f'{name}-{index}-still.mp4'
    at = LEAD + (0.5 if index == 0 else 0)
    if line and voice:
        wav, length, cut_at = line_audio(line, voice)
        shot(clip, out, length=at + length + TAIL, voice_wav=wav, voice_at=at)
        return out, cues(line, at, voice, cut_at)
    shot(clip, out, length=(at + spoken_length(line, None) + TAIL) if line else None)
    return out, cues(line, at) if line else []


def part(name, planos, voice_map, title=None):
    files, local = [], []
    for i, plano in enumerate(planos):
        f, c = narrated(plano, voice_map, i, name)
        files.append(f)
        local.append(c)
    out = OUT / f'{name}.mp4'
    starts = join(files, out)
    all_cues = [{**c, 'start': round(c['start'] + s, 2), 'end': round(c['end'] + s, 2)} for s, cs in zip(starts, local) for c in cs]
    scene = {'type': 'video', 'src': versioned(out), 'cues': all_cues}
    if title is not None:
        scene['overlays'] = [{'kind': 'title', 'start': round(starts[title] + 3.0, 2), 'end': round(duration(out), 2),
                              'subtitle': 'Tu aventura comienza'}]
    return scene


def versioned(path):
    digest = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
    return f'{URL}{path.name}?v={digest}'


# --- Live scene and tutorial -----------------------------------------------------------------

def live(spec, voice_map):
    from PIL import Image
    for src, name, size in ((ART / 'v2/raw/atrio.png', 'atrio.webp', 1600), (ART / 'piezas/estela.png', 'estela.webp', 900),
                            (ART / 'v2/piezas/objeto_brujula.png', 'brujula.webp', 240)):
        im = Image.open(src)
        im.thumbnail((size, size))
        im.save(OUT / name, quality=82)
    line, voice = spec['linea'], voice_map.get(spec['linea'])
    at, length = 1.2, spec['duracion']
    bed = HERE / 'clips' / 'v03-reloj-atrio.mp4'
    audio = OUT / 'vivo.m4a'
    if voice:
        wav, spoken, cut_at = line_audio(line, voice)
        length = max(length, at + spoken + 2.5)
        sh('ffmpeg', '-v', 'error', '-y', '-i', bed, '-i', wav, '-filter_complex',
           f'[0:a]volume=0.35,afade=t=in:d=1,afade=t=out:st={length - 1.5:.2f}:d=1.5[b];[1:a]adelay={int(at * 1000)}:all=1[v];'
           f'[b][v]amix=inputs=2:duration=first:normalize=0,atrim=0:{length:.2f}[a]', '-map', '[a]', '-c:a', 'aac', '-b:a', '128k', audio)
        line_cues = cues(line, at, voice, cut_at)
    else:
        sh('ffmpeg', '-v', 'error', '-y', '-i', bed, '-vn', '-af', f'volume=0.35,afade=t=in:d=1,afade=t=out:st={length - 1.5}:d=1.5',
           '-t', str(length), '-c:a', 'aac', '-b:a', '128k', audio)
        line_cues = cues(line, at)
    return {'type': 'live', 'duration': length, 'background': versioned(OUT / 'atrio.webp'), 'estela': versioned(OUT / 'estela.webp'),
            'compass': versioned(OUT / 'brujula.webp'), 'audio': versioned(audio), 'cues': line_cues}


def portrait(clip, start, length, out):
    """Estela's talking face from a narration clip, as a round inset."""
    size = 300
    sh('ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-t', f'{length:.3f}', '-i', clip, '-an', '-vf',
       f"crop=380:380:450:190,scale={size}:{size},format=yuva420p,"
       f"geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(lte(hypot(X-{size / 2},Y-{size / 2}),{size / 2 - 3}),255,0)'",
       '-c:v', 'png', out)


def tutorial(spec, voice_map):
    files, local = [], []
    for i, plano in enumerate(spec['planos']):
        line, voice = plano['linea'], voice_map.get(plano['linea'])
        footage = HERE / 'juego' / f"{plano['juego']}.webm"
        out = WORK / f'parte3-{i}.mp4'
        spoken = spoken_length(line, voice)
        length = LEAD + spoken + TAIL
        if not footage.exists():
            still_shot(HERE / 'cuadros' / 'c07-portal-atrio.png', length, out)
            files.append(out)
            local.append(cues(line, LEAD))
            continue
        base = WORK / f'parte3-{i}-base.mp4'
        silent = WORK / 'silencio.wav'
        if not silent.exists():
            sh('ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '30', silent)
        sh('ffmpeg', '-v', 'error', '-y', '-i', footage, '-i', silent, '-map', '0:v', '-map', '1:a', '-shortest',
           '-c:v', 'libx264', '-crf', '20', '-c:a', 'aac', base)
        if voice:
            wav, spoken, cut_at = line_audio(line, voice)
            length = LEAD + spoken + TAIL
            face = WORK / f'parte3-{i}-cara.mov'
            portrait(voice['clip'], cut_at, spoken + 0.2, face)
            mixed = WORK / f'parte3-{i}-voz.mp4'
            shot(base, mixed, length=length, voice_wav=wav, voice_at=LEAD, bed=0.0)
            sh('ffmpeg', '-v', 'error', '-y', '-i', mixed, '-itsoffset', str(LEAD), '-i', face, '-filter_complex',
               '[0:v][1:v]overlay=28:H-h-28:eof_action=pass[v]', '-map', '[v]', '-map', '0:a',
               '-c:v', 'libx264', '-crf', '21', '-c:a', 'copy', out)
            local.append(cues(line, LEAD, voice, cut_at))
        else:
            shot(base, out, length=length, bed=0.0)
            local.append(cues(line, LEAD))
        files.append(out)
    out = OUT / 'parte3.mp4'
    starts = join(files, out)
    all_cues = [{**c, 'start': round(c['start'] + s, 2), 'end': round(c['end'] + s, 2)} for s, cs in zip(starts, local) for c in cs]
    return {'type': 'video', 'src': versioned(out), 'cues': all_cues}


def title_card():
    """After the portal's flash: the Academy from outside, under the title."""
    out = WORK / 'titulo.mp4'
    still_shot(HERE / 'cuadros' / 'c02-academia-exterior.png', 6.5, out, audio=HERE / 'clips' / 'v02-academia-exterior.mp4')
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(exist_ok=True)
    voice_map = voices()
    scenes = []
    for spec in GUION['partes']:
        if spec.get('vivo'):
            scenes.append(live(spec, voice_map))
        elif spec.get('tutorial'):
            scenes.append(tutorial(spec, voice_map))
        else:
            planos = list(spec['planos'])
            title = next((i for i, p in enumerate(planos) if p.get('titulo')), None)
            if title is not None:
                planos.append({'clip': '__titulo__'})
            scenes.append(part(spec['id'], planos, voice_map, title=title))
    (OUT / 'apertura.json').write_text(json.dumps({'scenes': scenes}, ensure_ascii=False, indent=1) + '\n')
    total = sum(s.get('duration') or duration(OUT / s['src'].split('/')[-1].split('?')[0]) for s in scenes)
    missing = [k for k in LINES if k not in voice_map]
    print(f'apertura.json: {len(scenes)} escenas, {total:.0f} s; sin voz todavía: {", ".join(missing) or "ninguna"}')


if __name__ == '__main__':
    main()
