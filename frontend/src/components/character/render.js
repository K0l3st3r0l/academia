// Builds a character in the browser from the layer images in /character (made by
// art/pipeline/build_assets.py). Recolorable layers are remapped by luminance, the same
// way as art/pipeline/recolor.py, so shading and the navy outline survive any color.

const INK = [26, 26, 46];
const PAINT_ORDER = ['body', 'shoes', 'bottom', 'top', 'backwear', 'neckwear', 'nose', 'mouth', 'eyes', 'brows',
  'eyewear', 'hair', 'earwear', 'headwear'];
// Which look field gives each layer its part id (same name as the kind) and its color.
const COLOR_FIELD = { skin: 'skinColor', hair: 'hairColor', eye: 'eyeColor', top: 'topColor', bottom: 'bottomColor', shoes: 'shoeColor' };
// A hat that sits on the head flattens the hair under it: hair above a bowl-shaped curve that
// passes just under the brim and drops toward the sides is removed, and the cut gets the same
// navy outline as the drawing. Long hair and ponytails then come out from under the hat.
const HAT_BRIM = 0.85;   // share of the hat's height where the curve passes under it
const HAT_SPREAD = 0.8;  // horizontal radius of the bowl, in hat widths
const HAT_DROP = 0.55;   // how far the curve drops at that radius, in hat heights

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

// layer.skin: the layer carries some of the template's skin (arm beside a sleeve) to repaint
// with the student's tone. Skin goes first: a recolored garment could fall in the skin family.
async function layerCanvas(id, layer, colorHex, skinHex) {
  const key = `${id}|${colorHex || ''}|${layer.skin ? skinHex || '' : ''}`;
  if (!recolored.has(key)) {
    recolored.set(key, loadImage(layer.file).then(img => {
      const c = document.createElement('canvas');
      c.width = layer.w;
      c.height = layer.h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const skin = layer.skin && skinHex;
      if ((colorHex && layer.source) || skin) {
        const data = ctx.getImageData(0, 0, c.width, c.height);
        if (skin) recolorPixels(data.data, layer.skin, hexToRgb(skinHex));
        if (colorHex && layer.source) recolorPixels(data.data, layer.source, hexToRgb(colorHex));
        ctx.putImageData(data, 0, 0);
      }
      return c;
    }));
  }
  return recolored.get(key);
}

// Copy of the hair layer flattened under the hat (the cached original stays intact). Both
// layers are placed on the canvas through their x/y offsets; the curve is in hair coordinates.
function clipUnderHat(hairCanvas, hairLayer, hatCanvas, hatLayer) {
  const c = document.createElement('canvas');
  c.width = hairCanvas.width;
  c.height = hairCanvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(hairCanvas, 0, 0);

  const cx = hatLayer.x + hatLayer.w / 2 - hairLayer.x;
  const y0 = hatLayer.y + hatLayer.h * HAT_BRIM - hairLayer.y;
  const rx = hatLayer.w * HAT_SPREAD;
  const drop = hatLayer.h * HAT_DROP;
  const curve = new Path2D();
  for (let x = 0; x <= c.width; x += 2) {
    const t = Math.min(1, Math.abs(x - cx) / rx);
    const y = y0 + drop * t * t;
    if (x === 0) curve.moveTo(x, y); else curve.lineTo(x, y);
  }
  const above = new Path2D(curve);
  above.lineTo(c.width, 0);
  above.lineTo(0, 0);
  above.closePath();

  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(above);
  // Outline only where hair remains along the cut.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = `rgb(${INK.join(',')})`;
  ctx.lineWidth = 3.4;
  ctx.stroke(curve);
  return c;
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
  const dress = parts.layers[look.top]?.kind === 'dress';
  const hat = parts.layers[look.headwear];
  const stack = PAINT_ORDER.map(kind => {
    if (kind === 'bottom' && dress) return null;
    const id = kind === 'body' ? 'body' : look[kind];
    const layer = id && parts.layers[id];
    if (!layer) return null;
    const color = kind === 'brows' ? (look.browColor ?? look.hairColor) : look[COLOR_FIELD[layer.role]];
    return { kind, id, layer, color: layer.role ? color : null };
  }).filter(Boolean);
  const drawn = await Promise.all(stack.map(s => layerCanvas(s.id, s.layer, s.color, look.skinColor)));
  if (hat?.clipsHair) {
    const i = stack.findIndex(s => s.kind === 'hair');
    const h = stack.findIndex(s => s.kind === 'headwear');
    if (i >= 0 && h >= 0) drawn[i] = clipUnderHat(drawn[i], stack[i].layer, drawn[h], hat);
  }

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
