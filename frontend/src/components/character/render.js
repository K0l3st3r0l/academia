// Builds a character in the browser from the layer images in /character (made by
// art/pipeline/build_assets.py). Each layer comes in two files: <id>.webp holds what never
// changes color (outline, white details, accessories) and <id>.map.webp, one strip per color
// family (skin, hair, eyes, clothes), holds each pixel's shade (R = 128 + 2 x L* difference
// from the family's reference) and coverage (G). The browser paints each family's color at
// that shade in CIELAB and blends: pixel = sum(coverage x color) / sum(coverage).

const INK = [26, 26, 46];
// hatBack: the underside of a wide brim beside the head, which hair hanging there covers.
const PAINT_ORDER = ['body', 'shoes', 'bottom', 'top', 'backwear', 'neckwear', 'nose', 'mouth', 'eyes', 'brows',
  'hatBack', 'eyewear', 'hair', 'earwear', 'headwear'];
// Which look field gives each color family its color.
const COLOR_FIELD = { skin: 'skinColor', hair: 'hairColor', eye: 'eyeColor', top: 'topColor', bottom: 'bottomColor', shoes: 'shoeColor' };
// Colors the parts were drawn in, for a family the look leaves without a color.
const DRAWN_COLOR = { skin: '#F49C62', hair: '#552B1A', eye: '#5C3A21', top: '#3B82F6', bottom: '#3B82F6', shoes: '#3B82F6' };
const DL_SCALE = 2;
// A hat that sits on the head flattens the hair under it. Each hairstyle has a version drawn
// that way (underHat: close to the head below the hat, then falling as usual); the hat still
// hides the part of it above its lower edge. A hairstyle without that version is cut along the
// hat's edge, and beside the hat along a line that drops outward.
const HAT_TUCK = 3;      // the cut runs this far up under the hat's edge, so no seam shows
const SIDE_SLOPE = 0.7;  // beyond the hat's sides the cut drops this much per pixel outward

let partsPromise;
let assetVersion = '';
const images = new Map();
const built = new Map();
const luts = new Map();

export function loadParts() {
  // Revalidated on every load: it names the version of the images it goes with.
  partsPromise ??= fetch('/character/parts.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(parts => {
      assetVersion = parts.version ?? '';
      return parts;
    });
  return partsPromise;
}

function loadImage(file) {
  if (!images.has(file)) {
    images.set(file, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `/character/${file}?v=${assetVersion}`;
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
// layers are placed on the canvas through their x/y offsets; the cut is in hair coordinates and
// follows the lowest opaque pixel of each hat column.
function clipUnderHat(hairCanvas, hairLayer, hatCanvas, hatLayer, { pressed = false } = {}) {
  const hw = hatCanvas.width;
  const hh = hatCanvas.height;
  const hat = hatCanvas.getContext('2d').getImageData(0, 0, hw, hh).data;
  const bottom = new Int32Array(hw).fill(-1);
  for (let x = 0; x < hw; x++) {
    for (let y = hh - 1; y >= 0; y--) {
      if (hat[(y * hw + x) * 4 + 3] > 128) { bottom[x] = y; break; }
    }
  }
  let left = 0;
  while (left < hw && bottom[left] < 0) left++;
  let right = hw - 1;
  while (right >= 0 && bottom[right] < 0) right--;
  if (left > right) return hairCanvas;
  // Columns are drawn at the canvas scale of the layers, which share one coordinate system.
  const sx = hatLayer.w / hw;
  const sy = hatLayer.h / hh;

  const c = document.createElement('canvas');
  c.width = hairCanvas.width;
  c.height = hairCanvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(hairCanvas, 0, 0);

  const cutAt = x => {
    const col = (x + hairLayer.x - hatLayer.x) / sx;
    const i = Math.round(Math.min(right, Math.max(left, col)));
    const y = bottom[i] >= 0 ? bottom[i] : bottom[col < left ? left : right];
    const beyond = col < left ? left - col : col > right ? col - right : 0;
    return hatLayer.y + (y - HAT_TUCK) * sy + beyond * sx * SIDE_SLOPE - hairLayer.y;
  };
  const hatLeft = hatLayer.x + left * sx - hairLayer.x;
  const hatRight = hatLayer.x + right * sx - hairLayer.x;
  // Hair drawn pressed under a hat is already shaped beside it: only what the hat hides goes.
  const from = pressed ? Math.max(0, Math.floor(hatLeft)) : 0;
  const to = pressed ? Math.min(c.width, Math.ceil(hatRight)) : c.width;
  const above = new Path2D();
  for (let x = from; x <= to; x += 1) {
    const y = cutAt(x);
    if (x === from) above.moveTo(x, y); else above.lineTo(x, y);
  }
  above.lineTo(to, 0);
  above.lineTo(from, 0);
  above.closePath();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(above);
  if (pressed) return c;

  // Under the hat the cut is hidden; beside it, hair that remains gets the drawing's outline.
  const side = new Path2D();
  if (hatLeft > 0) {
    side.moveTo(0, cutAt(0));
    for (let x = 1; x <= hatLeft; x++) side.lineTo(x, cutAt(x));
  }
  if (hatRight < c.width) {
    side.moveTo(hatRight, cutAt(hatRight));
    for (let x = Math.ceil(hatRight); x <= c.width; x++) side.lineTo(x, cutAt(x));
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = `rgb(${INK.join(',')})`;
  ctx.lineWidth = 3.4;
  ctx.stroke(side);
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
  const underHat = parts.layers[look.hair]?.underHat;
  const pressed = hat?.clipsHair && parts.layers[underHat] ? underHat : null;
  const stack = PAINT_ORDER.map(kind => {
    if (kind === 'bottom' && dress) return null;
    let id = look[kind];
    if (kind === 'body') id = 'body';
    if (kind === 'hatBack') id = hat?.back;
    if (kind === 'hair' && pressed) id = pressed;
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
    if (i >= 0 && h >= 0) drawn[i] = clipUnderHat(drawn[i], stack[i].layer, drawn[h], hat, { pressed: !!pressed });
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
