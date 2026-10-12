"""Grok clips where Estela says the film's lines, in guion.json's priority order.

Usage: python3 gen-voz.py [group-id ...]   (default: every group whose clip is missing)

Every line is said by Estela with the same preset voice, so the narration sounds like one person.
Narration groups are used for their audio (and, in the tutorial, as her talking portrait); the
'visual' group is a shot of the film. Stops at the first error: Grok's weekly balance runs out
mid-batch (HTTP 402), and the remaining groups wait for the next reset.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GROK = '/root/apps/tools/grok-media/grok-media.sh'
VOICE = 'ara'

GUION = json.loads((HERE / 'guion.json').read_text())

NARRATION = (
    'Estela, the young astronomer, stands in the observatory hall facing the viewer and speaks slowly, '
    'warmly and clearly in Latin American Spanish, like a storyteller reading to children, with <AUDIO_0>. '
    'She leaves a calm pause between sentences and says exactly: {lines} '
    'Her starry hair and cape drift gently and she gestures softly with one hand. Static camera, no zoom. '
    'No music: only her voice and a very soft magical ambience. Soft painted 2D cartoon animation.'
)
VISUAL = (
    'Estela holds the glowing golden compass toward the viewer and speaks slowly, warmly and clearly in '
    'Latin American Spanish, with <AUDIO_0>, leaving a calm pause between sentences. She says exactly: {lines} '
    'As she finishes she offers the compass forward, as if giving it to the person watching, and smiles. '
    'Gentle slow push-in. No music: only her voice and a very soft magical ambience. Soft painted 2D cartoon animation.'
)


def run(group):
    out = HERE / 'voz' / f"{group['id']}.mp4"
    if out.exists():
        return True
    lines = ' '.join(f'"{GUION["lineas"][k]}"' for k in group['lineas'])
    prompt = HERE / 'prompts' / f"{group['id']}.txt"
    prompt.write_text((VISUAL if group.get('visual') else NARRATION).format(lines=lines) + '\n')
    out.parent.mkdir(exist_ok=True)
    result = subprocess.run(
        ['bash', GROK, 'video', str(out), str(prompt), '--first', str(HERE / 'cuadros' / group['cuadro']),
         '--duration', str(group['duracion']), '--res', '720p', '--aspect', '16:9', '--voice', VOICE],
        capture_output=True, text=True)
    (out.with_suffix('.log')).write_text(result.stdout + result.stderr)
    ok = result.returncode == 0 and out.exists()
    print(f"{group['id']}: {'ok' if ok else 'falló'}", flush=True)
    return ok


def main():
    wanted = set(sys.argv[1:])
    for group in GUION['voces']:
        if wanted and group['id'] not in wanted:
            continue
        if not run(group):
            sys.exit(1)


if __name__ == '__main__':
    main()
