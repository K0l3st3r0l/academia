// Builds a character in the browser from the layer images in /character (made by
// art/pipeline/build_assets.py). Each layer comes in two files: <id>.webp holds what never
// changes color (outline, white details, accessories) and <id>.map.webp, one strip per color
// family (skin, hair, eyes, clothes), holds each pixel's shade (R = 128 + 2 x L* difference
// from the family's reference) and coverage (G). The browser paints each family's color at
// that shade in CIELAB and blends: pixel = sum(coverage x color) / sum(coverage).

const INK = [26, 26, 46];
const PAINT_ORDER = ['body', 'shoes', 'bottom', 'top', 'backwear', 'neckwear', 'nose', 'mouth', 'eyes', 'brows',
  'eyewear', 'hair', 'earwear', 'headwear'];
// Which look field gives each color family its color.
const COLOR_FIELD = { skin: 'skinColor', hair: 'hairColor', eye: 'eyeColor', top: 'topColor', bottom: 'bottomColor', shoes: 'shoeColor' };
// Colors the parts were drawn in, for a family the look leaves without a color.
const DRAWN_COLOR = { skin: '#F49C62', hair: '#552B1A', eye: '#5C3A21', top: '#3B82F6', bottom: '#3B82F6', shoes: '#3B82F6' };
const DL_SCALE = 2;
// A hat that sits on the head flattens the hair under it: hair above a bowl-shaped curve that
// passes just under the brim and drops toward the sides is removed, and the cut gets the same
// navy outline as the drawing. Long hair and ponytails then come out from under the hat.
const HAT_BRIM = 0.85;   // share of the hat's height where the curve passes under it
const HAT_SPREAD = 0.8;  // horizontal radius of the bowl, in hat widths
const HAT_DROP = 0.55;   // how far the curve drops at that radius, in hat heights

let partsPromise;
const images = new Map();
const built = new Map();
const luts = new Map();

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

// sRGB <-> CIELAB (D65), same formulas as art/pipeline/decompose.py.
const WHITE = [0.95047, 1, 1.08883];
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function rgbToLab([r, g, b]) {
  const lin = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const xyz = [
    lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805,
    lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722,
    lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505,
  ].map((v, i) => v / WHITE[i]);
  const f = xyz.map(v => (v > EPS ? Math.cbrt(v) : (KAPPA * v + 16) / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116;
  const f = [fy + a / 500, fy, fy - b / 200];
  const [x, y, z] = f.map((v, i) => (v ** 3 > EPS ? v ** 3 : (116 * v - 16) / KAPPA) * WHITE[i]);
  return [
    x * 3.2406 + y * -1.5372 + z * -0.4986,
    x * -0.9689 + y * 1.8758 + z * 0.0415,
    x * 0.0557 + y * -0.2040 + z * 1.0570,
  ].map(c => {
    const v = Math.min(1, Math.max(0, c));
    return Math.min(255, Math.max(0, (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255));
  });
}

// The 256 colors a map byte can become for one target color. Lightness moves by the stored
// difference; chroma fades toward black and white so extreme shades don't clip into odd hues.
function shadeLut(hex) {
  if (!luts.has(hex)) {
    const [L0, a, b] = rgbToLab(hexToRgb(hex));
    const keep = Math.sqrt(Math.min(1, Math.max(1e-3, Math.min(L0, 100 - L0) / 25)));
    const lut = new Float32Array(256 * 3);
    for (let code = 0; code < 256; code++) {
      const L = Math.min(100, Math.max(0, L0 + (code - 128) / DL_SCALE));
      const fade = Math.sqrt(Math.min(1, Math.max(0, Math.min(L, 100 - L) / 25)));
      const k = Math.min(1, fade / keep);
      lut.set(labToRgb([L, a * k, b * k]), code * 3);
    }
    luts.set(hex, lut);
  }
  return luts.get(hex);
}

function pixelsOf(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

// colors: one hex per entry of layer.families.
async function layerCanvas(id, layer, colors) {
  const key = `${id}|${colors.join(',')}`;
  if (!built.has(key)) {
    built.set(key, Promise.all([loadImage(layer.file), loadImage(layer.map)]).then(([fixedImg, mapImg]) => {
      const { w, h } = layer;
      const fixed = pixelsOf(fixedImg, w, h);
      const map = pixelsOf(mapImg, w, h * layer.families.length);
      const strips = colors.map((hex, f) => shadeLut(hex || DRAWN_COLOR[layer.families[f]]));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const out = ctx.createImageData(w, h);
      const o = out.data;
      const n = w * h;
      for (let p = 0; p < n; p++) {
        const i = p * 4;
        const fa = fixed[i + 3] / 255;
        let r = fixed[i] * fa, g = fixed[i + 1] * fa, b = fixed[i + 2] * fa, total = fa;
        strips.forEach((lut, f) => {
          const m = (f * n + p) * 4;
          const cov = map[m + 1] / 255;
          if (!cov) return;
          const s = map[m] * 3;
          r += lut[s] * cov;
          g += lut[s + 1] * cov;
          b += lut[s + 2] * cov;
          total += cov;
        });
        if (total > 0) {
          o[i] = r / total;
          o[i + 1] = g / total;
          o[i + 2] = b / total;
          o[i + 3] = Math.min(1, total) * 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      return c;
    }));
  }
  return built.get(key);
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
  head: { x: 131, y: 24, w: 250, h: 250 },
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
    const colors = layer.families.map(family => (
      kind === 'brows' && family === 'hair' ? (look.browColor ?? look.hairColor) : look[COLOR_FIELD[family]]
    ));
    return { kind, id, layer, colors };
  }).filter(Boolean);
  const drawn = await Promise.all(stack.map(s => layerCanvas(s.id, s.layer, s.colors)));
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
