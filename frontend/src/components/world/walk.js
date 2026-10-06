// Where feet may stand on an island and how to get from one spot to another. The grid comes from
// art/pipeline/build_world.py: one cell per few island pixels, run-length encoded row by row
// starting with a blocked run. All coordinates here are island pixels.

export function decodeWalk(walk, island) {
  if (!walk) {
    // A layout without a grid: the whole picture is walkable, so the map still works.
    const cell = 8;
    const cols = Math.ceil(island.width / cell);
    const rows = Math.ceil(island.height / cell);
    return { cell, cols, rows, cells: new Uint8Array(cols * rows).fill(1) };
  }
  const { cell, cols, rows } = walk;
  const cells = new Uint8Array(cols * rows);
  let i = 0;
  let on = 0;
  for (const run of walk.runs.split(',')) {
    const n = Number(run);
    if (on) cells.fill(1, i, i + n);
    i += n;
    on ^= 1;
  }
  return { cell, cols, rows, cells };
}

const open = (g, c, r) => c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.cells[r * g.cols + c] === 1;
const centre = (g, c, r) => [(c + 0.5) * g.cell, (r + 0.5) * g.cell];

export const canStand = (g, [x, y]) => open(g, Math.floor(x / g.cell), Math.floor(y / g.cell));

// The point itself if it is walkable, otherwise the centre of the closest walkable cell.
export function nearestStand(g, [x, y]) {
  if (canStand(g, [x, y])) return [x, y];
  const c0 = Math.floor(x / g.cell);
  const r0 = Math.floor(y / g.cell);
  for (let d = 1; d < Math.max(g.cols, g.rows); d++) {
    let best = null;
    let bestDist = Infinity;
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || !open(g, c0 + dc, r0 + dr)) continue;
        const [cx, cy] = centre(g, c0 + dc, r0 + dr);
        const dist = Math.hypot(cx - x, cy - y);
        if (dist < bestDist) {
          best = [cx, cy];
          bestDist = dist;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function clearLine(g, a, b) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (g.cell / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!canStand(g, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

// Binary heap keyed by f-score, enough for a few thousand cells.
function heap() {
  const items = [];
  return {
    size: () => items.length,
    push(item) {
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent][0] <= items[i][0]) break;
        [items[parent], items[i]] = [items[i], items[parent]];
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && items[l][0] < items[m][0]) m = l;
          if (r < items.length && items[r][0] < items[m][0]) m = r;
          if (m === i) break;
          [items[m], items[i]] = [items[i], items[m]];
          i = m;
        }
      }
      return top;
    },
  };
}

const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// Waypoints from `from` to `to` (both walkable) along the path, without the starting point.
// Corners are cut wherever a straight line stays on walkable ground, so the walk looks natural.
export function findPath(g, from, to) {
  if (clearLine(g, from, to)) return [to];
  const start = [Math.floor(from[0] / g.cell), Math.floor(from[1] / g.cell)];
  const goal = [Math.floor(to[0] / g.cell), Math.floor(to[1] / g.cell)];
  const index = (c, r) => r * g.cols + c;
  const cost = new Float32Array(g.cols * g.rows).fill(Infinity);
  const came = new Int32Array(g.cols * g.rows).fill(-1);
  const h = (c, r) => Math.hypot(c - goal[0], r - goal[1]);
  const queue = heap();
  cost[index(...start)] = 0;
  queue.push([h(...start), start[0], start[1]]);
  let found = false;
  while (queue.size()) {
    const [, c, r] = queue.pop();
    if (c === goal[0] && r === goal[1]) {
      found = true;
      break;
    }
    const here = cost[index(c, r)];
    for (const [dc, dr, step] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      // Diagonals only when both sides are open: no squeezing past a corner.
      if (!open(g, nc, nr) || (dc && dr && (!open(g, c + dc, r) || !open(g, c, r + dr)))) continue;
      const next = here + step;
      if (next < cost[index(nc, nr)]) {
        cost[index(nc, nr)] = next;
        came[index(nc, nr)] = index(c, r);
        queue.push([next + h(nc, nr), nc, nr]);
      }
    }
  }
  if (!found) return [to];

  const cells = [];
  for (let i = index(...goal); i !== -1 && i !== index(...start); i = came[i]) {
    cells.push(centre(g, i % g.cols, Math.floor(i / g.cols)));
  }
  const points = [from, ...cells.reverse(), to];
  const route = [];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!clearLine(g, points[anchor], points[i])) {
      route.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  route.push(to);
  return route;
}

// Where to stand next to a level's pad: as close as possible, on walkable ground, with the body
// clear of the pad's button (and its stars) so the level stays visible and easy to tap.
// body: [width, height] of the figure, button: radius of a level button, in island pixels.
export function spotBeside(g, pad, { body: [bw, bh], button: r, others = [] }) {
  const boxOf = ([x, y]) => [x - r, y - 1.6 * r, x + r, y + 0.8 * r];
  const hits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const padBox = boxOf(pad);
  const otherBoxes = others.map(boxOf);
  const reach = 2.4 * r + bw;
  let best = null;
  let bestCost = Infinity;
  for (let r0 = Math.floor((pad[1] - reach) / g.cell); r0 <= (pad[1] + reach) / g.cell; r0++) {
    for (let c0 = Math.floor((pad[0] - reach) / g.cell); c0 <= (pad[0] + reach) / g.cell; c0++) {
      if (!open(g, c0, r0)) continue;
      const [x, y] = centre(g, c0, r0);
      const bodyBox = [x - bw / 2, y - bh, x + bw / 2, y];
      if (hits(bodyBox, padBox)) continue;
      const crowd = otherBoxes.filter(b => hits(bodyBox, b)).length;
      const c = Math.hypot(x - pad[0], (y - pad[1]) * 1.5) + crowd * 400;
      if (c < bestCost) {
        best = [x, y];
        bestCost = c;
      }
    }
  }
  return best ?? nearestStand(g, pad);
}
