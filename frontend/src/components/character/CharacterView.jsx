import { useEffect, useRef } from 'react';
import { drawCharacter, viewAspect } from './render';

// size is the height in CSS pixels; the canvas is drawn at device resolution.
// view: 'full' (whole body), 'portrait' (head and shoulders) or 'face'.
export default function CharacterView({ look, size = 300, view = 'full', className = '', label = 'Personaje' }) {
  const ref = useRef(null);
  const width = Math.round(size * viewAspect(view));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !look) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(size * dpr);
    let cancelled = false;
    drawCharacter(canvas, look, { view }).catch(() => {
      if (!cancelled) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    });
    return () => { cancelled = true; };
  }, [look, size, width, view]);

  return <canvas ref={ref} role="img" aria-label={label} className={className} style={{ width, height: size }} />;
}
