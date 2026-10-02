// Builds a character in the browser from the layer images in /character (made by
// art/pipeline/build_assets.py). Recolorable layers are remapped by luminance, the same
// way as art/pipeline/recolor.py, so shading and the navy outline survive any color.

const INK = [26, 26, 46];
const PAINT_ORDER = ['body', 'shoes', 'bottom', 'top', 'nose', 'mouth', 'eyes', 'brows', 'hair'];
// Which look field gives each layer its part id and its color.
const PART_FIELD = { shoes: 'shoes', bottom: 'bottom', top: 'top', nose: 'nose', mouth: 'mouth', eyes: 'eyes', brows: 'brows', hair: 'hair' };
const COLOR_FIELD = { skin: 'skinColor', hair: 'hairColor', eye: 'eyeColor', top: 'topColor', bottom: 'bottomColor', shoes: 'shoeColor' };

let partsPromise;
const images = new Map();
const recolored = new Map();

export function loadParts() {
  partsPromise ??= fetch('/character/parts.json').then(r => r.json());
  return partsPromise;
}

function loadImage(file) {
  if (!images.has(file)) {
    images.set(file, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `/character/${file}`;
    }));
  }
  return images.get(file);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const lum = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;

function recolorPixels(data, source, target) {
  const ls = lum(...source);
  const sc = source.map(c => c - ls);
  const limit = 150 * 0.45;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.abs(r - INK[0]) + Math.abs(g - INK[1]) + Math.abs(b - INK[2]) <= 70) continue;
    const l = lum(r, g, b);
    if (Math.abs(r - l - sc[0]) + Math.abs(g - l - sc[1]) + Math.abs(b - l - sc[2]) >= limit) continue;
    const ratio = l / Math.max(1, ls);
    for (let c = 0; c < 3; c++) {
      const t = target[c];
      const v = ratio <= 1 ? t * ratio : t + (255 - t) * Math.min(1, ratio - 1) * 1.4;
      data[i + c] = Math.max(0, Math.min(255, v));
    }
  }
}

async function layerCanvas(id, layer, colorHex) {
  const key = `${id}|${colorHex || ''}`;
  if (!recolored.has(key)) {
    recolored.set(key, loadImage(layer.file).then(img => {
      const c = document.createElement('canvas');
      c.width = layer.w;
      c.height = layer.h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      if (colorHex && layer.source) {
        const data = ctx.getImageData(0, 0, c.width, c.height);
        recolorPixels(data.data, layer.source, hexToRgb(colorHex));
        ctx.putImageData(data, 0, 0);
      }
      return c;
    }));
  }
  return recolored.get(key);
}

// Regions of the 512x768 canvas. Portrait (head and shoulders) is for small sizes: map,
// rankings, projector. Face is for the editor's eye, brow, nose and mouth options.
export const VIEWS = {
  full: { x: 0, y: 0, w: 512, h: 768 },
  portrait: { x: 96, y: 0, w: 320, h: 330 },
  face: { x: 160, y: 124, w: 192, h: 136 },
};

export async function drawCharacter(canvas, look, { view: viewName = 'full' } = {}) {
  const parts = await loadParts();
  const view = VIEWS[viewName] ?? VIEWS.full;
  const stack = PAINT_ORDER.map(kind => {
    const id = kind === 'body' ? 'body' : look[PART_FIELD[kind]];
    const layer = id && parts.layers[id];
    if (!layer) return null;
    const color = kind === 'brows' ? (look.browColor ?? look.hairColor) : look[COLOR_FIELD[layer.role]];
    return { id, layer, color: layer.role ? color : null };
  }).filter(Boolean);
  const drawn = await Promise.all(stack.map(s => layerCanvas(s.id, s.layer, s.color)));

  const ctx = canvas.getContext('2d');
  const scale = canvas.height / view.h;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  stack.forEach((s, i) => {
    const { x, y, w, h } = s.layer;
    ctx.drawImage(drawn[i], (x - view.x) * scale, (y - view.y) * scale, w * scale, h * scale);
  });
}

export function viewAspect(viewName = 'full') {
  const v = VIEWS[viewName] ?? VIEWS.full;
  return v.w / v.h;
}
