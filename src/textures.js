// Procedurally painted 16x16 pixel-art textures (no image assets needed).
import { TILES, TILE } from './blocks.js';
import { mulberry32 } from './noise.js';

const S = 16;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

class Tile {
  constructor(seed) {
    this.d = new Uint8ClampedArray(S * S * 4);
    this.r = mulberry32(seed);
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    this.d[i] = clamp(c[0]); this.d[i + 1] = clamp(c[1]); this.d[i + 2] = clamp(c[2]); this.d[i + 3] = a;
  }
  get(x, y) { const i = (y * S + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  pick(pal) { return pal[Math.floor(this.r() * pal.length)]; }
  vary(c, amt) { const k = 1 + (this.r() * 2 - 1) * amt; return [c[0] * k, c[1] * k, c[2] * k]; }
  fill(fn) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fn(x, y); }
  noise(pal, amt = 0.04) { this.fill((x, y) => this.set(x, y, this.vary(this.pick(pal), amt))); }
}

const DIRT = [[134, 96, 67], [121, 85, 58], [150, 108, 74], [108, 76, 52], [134, 96, 67], [160, 118, 84]];
const GRASS = [[102, 170, 60], [92, 156, 52], [114, 182, 68], [84, 144, 46], [106, 172, 62]];
const STONE = [[127, 127, 127], [116, 116, 116], [136, 136, 136], [122, 122, 122], [108, 108, 108]];
const PLANK = [[162, 130, 78], [154, 123, 73], [170, 137, 83], [146, 116, 70]];

function stone(t) {
  t.noise(STONE, 0.03);
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(t.r() * S), y = Math.floor(t.r() * S), len = 2 + Math.floor(t.r() * 3);
    for (let i = 0; i < len; i++) t.set(x + i, y, [100, 100, 100]);
  }
}
function dirt(t) {
  t.noise(DIRT, 0.03);
  for (let k = 0; k < 6; k++) t.set(Math.floor(t.r() * S), Math.floor(t.r() * S), [94, 66, 45]);
}
function planks(t) {
  t.fill((x, y) => {
    let c = t.vary(t.pick(PLANK), 0.03);
    if (y % 4 === 3) c = [116, 92, 54];
    t.set(x, y, c);
  });
  const seams = [3, 11, 7, 14];
  for (let row = 0; row < 4; row++) for (let y = row * 4; y < row * 4 + 3; y++) t.set(seams[row], y, [126, 100, 60]);
  for (let k = 0; k < 10; k++) t.set(Math.floor(t.r() * S), Math.floor(t.r() * 4) * 4 + Math.floor(t.r() * 3), [140, 110, 64]);
}
function cobble(t, moss = false) {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push([t.r() * S, t.r() * S, 95 + t.r() * 60]);
  t.fill((x, y) => {
    let d1 = 1e9, d2 = 1e9, v = 0;
    for (const p of pts) {
      for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        const d = Math.hypot(x + 0.5 - p[0] - ox, y + 0.5 - p[1] - oy);
        if (d < d1) { d2 = d1; d1 = d; v = p[2]; } else if (d < d2) d2 = d;
      }
    }
    let c = d2 - d1 < 1.1 ? [66, 66, 66] : t.vary([v, v, v], 0.06);
    if (d2 - d1 >= 1.1 && d2 - d1 < 2 && t.r() < 0.5) c = [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15];
    if (moss && t.r() < 0.35 && Math.sin(x * 0.7) + Math.cos(y * 0.9) > 0) c = t.vary([78, 110, 52], 0.1);
    t.set(x, y, c);
  });
}
function ore(t, col) {
  stone(t);
  for (let k = 0; k < 5; k++) {
    const cx = 2 + Math.floor(t.r() * 12), cy = 2 + Math.floor(t.r() * 12);
    for (let i = 0; i < 4; i++) {
      const x = cx + Math.floor(t.r() * 3) - 1, y = cy + Math.floor(t.r() * 3) - 1;
      t.set(x, y, t.vary(col, 0.1));
    }
  }
}
function plantBase(t) { t.fill((x, y) => t.set(x, y, [0, 0, 0], 0)); }

const LETTERS = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
};

const PAINTERS = {
  grass_top: (t) => t.noise(GRASS, 0.05),
  grass_side: (t) => {
    dirt(t);
    for (let x = 0; x < S; x++) {
      const depth = 3 + (t.r() < 0.6 ? 1 : 0) + (t.r() < 0.3 ? 1 : 0);
      for (let y = 0; y < depth; y++) t.set(x, y, t.vary(t.pick(GRASS), 0.05));
    }
  },
  dirt,
  stone,
  cobblestone: (t) => cobble(t),
  mossy_cobblestone: (t) => cobble(t, true),
  sand: (t) => t.noise([[219, 211, 160], [212, 203, 150], [226, 218, 170], [205, 196, 142]], 0.02),
  water: (t) => t.fill((x, y) => {
    const w = Math.sin((x + y * 0.5) * 0.9) * 0.08 + Math.sin(y * 1.7 + x * 0.3) * 0.05;
    t.set(x, y, t.vary([52 * (1 + w), 104 * (1 + w), 222 * (1 + w)], 0.03));
  }),
  log_side: (t) => {
    const cols = [];
    for (let x = 0; x < S; x++) cols.push(t.pick([[104, 83, 51], [86, 67, 41], [114, 90, 56], [96, 76, 46]]));
    t.fill((x, y) => t.set(x, y, t.r() < 0.12 ? [70, 54, 33] : t.vary(cols[x], 0.05)));
  },
  log_top: (t) => t.fill((x, y) => {
    if (x === 0 || y === 0 || x === S - 1 || y === S - 1) return t.set(x, y, t.vary([104, 83, 51], 0.08));
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    t.set(x, y, t.vary(Math.floor(d) % 2 ? [176, 142, 90] : [152, 120, 72], 0.04));
  }),
  leaves: (t) => t.fill((x, y) => {
    if (t.r() < 0.2) return t.set(x, y, [0, 0, 0], 0);
    t.set(x, y, t.vary(t.pick([[62, 128, 40], [52, 108, 32], [76, 146, 50], [44, 96, 28]]), 0.06));
  }),
  planks,
  glass: (t) => t.fill((x, y) => {
    const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
    if (edge) return t.set(x, y, (x + y) % 5 === 0 ? [170, 205, 215] : [218, 236, 242]);
    const streak = (x - y === 3 || x - y === 4 || x - y === -6) && x > 2 && x < 13;
    if (streak) return t.set(x, y, [235, 245, 250], 255);
    t.set(x, y, [0, 0, 0], 0);
  }),
  brick: (t) => t.fill((x, y) => {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    if (y % 4 === 3 || (x + off) % 8 === 7) return t.set(x, y, t.vary([178, 172, 162], 0.04));
    t.set(x, y, t.vary(t.pick([[150, 74, 56], [138, 66, 50], [162, 84, 64]]), 0.05));
  }),
  stone_bricks: (t) => t.fill((x, y) => {
    const row = Math.floor(y / 8);
    const off = row % 2 ? 8 : 0;
    if (y % 8 === 7 || (x + off) % 16 === 15) return t.set(x, y, [88, 88, 88]);
    if (y % 8 === 0 || (x + off) % 16 === 0) return t.set(x, y, [140, 140, 140]);
    t.set(x, y, t.vary(t.pick(STONE), 0.03));
  }),
  gravel: (t) => {
    const pal = [[136, 126, 126], [110, 100, 100], [160, 152, 150], [92, 84, 84], [128, 112, 98]];
    t.fill((x, y) => t.set(x, y, t.vary(pal[1], 0.05)));
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(t.r() * S), y = Math.floor(t.r() * S), c = t.pick(pal);
      t.set(x, y, c); t.set(x + 1, y, c); if (t.r() < 0.5) t.set(x, y + 1, c);
    }
  },
  bedrock: (t) => t.fill((x, y) => { const v = 30 + t.r() * 90; t.set(x, y, [v, v, v]); }),
  coarse_dirt: (t) => {
    t.noise([[128, 86, 58], [112, 74, 48], [146, 100, 68], [98, 64, 42]], 0.05);
    for (let k = 0; k < 14; k++) t.set(Math.floor(t.r() * S), Math.floor(t.r() * S), [80, 70, 64]);
  },
  tall_grass: (t) => {
    plantBase(t);
    for (let b = 0; b < 11; b++) {
      let x = 1 + t.r() * 14;
      const h = 5 + Math.floor(t.r() * 10), lean = (t.r() - 0.5) * 0.5;
      const c = t.pick([[96, 158, 56], [80, 140, 46], [110, 172, 64]]);
      for (let i = 0; i < h; i++) { t.set(Math.floor(x), S - 1 - i, t.vary(c, 0.08)); x += lean; }
    }
  },
  poppy: (t) => {
    plantBase(t);
    for (let y = 8; y < S; y++) t.set(7, y, [60, 130, 40]);
    t.set(6, 12, [70, 145, 45]); t.set(5, 11, [70, 145, 45]); t.set(8, 13, [70, 145, 45]); t.set(9, 12, [70, 145, 45]);
    for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) if (!((x === 5 || x === 9) && (y === 4 || y === 7))) t.set(x, y, t.vary([214, 28, 28], 0.08));
    t.set(7, 5, [40, 20, 10]); t.set(7, 6, [60, 30, 10]);
  },
  dandelion: (t) => {
    plantBase(t);
    for (let y = 9; y < S; y++) t.set(7, y, [60, 130, 40]);
    t.set(8, 12, [70, 145, 45]); t.set(6, 13, [70, 145, 45]);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.set(x, y, t.vary([250, 220, 30], 0.06));
    t.set(7, 5, [250, 230, 60]); t.set(8, 5, [240, 200, 20]);
  },
  snow: (t) => t.noise([[242, 250, 252], [232, 242, 246], [250, 254, 255]], 0.01),
  snow_side: (t) => {
    dirt(t);
    for (let x = 0; x < S; x++) {
      const depth = 3 + (t.r() < 0.5 ? 1 : 0) + (t.r() < 0.2 ? 2 : 0);
      for (let y = 0; y < depth; y++) t.set(x, y, t.vary([242, 250, 252], 0.02));
    }
  },
  coal_ore: (t) => ore(t, [36, 36, 36]),
  iron_ore: (t) => ore(t, [216, 175, 147]),
  tnt_side: (t) => {
    t.fill((x, y) => {
      if (y >= 4 && y < 12) return t.set(x, y, [232, 232, 226]);
      t.set(x, y, x % 4 === 0 ? [176, 44, 20] : t.vary([219, 68, 26], 0.05));
    });
    let cx = 2;
    for (const ch of 'TNT') {
      const g = LETTERS[ch];
      for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') t.set(cx + c, 5 + r + 1, [20, 20, 20]);
      cx += g[0].length + 1;
    }
  },
  tnt_top: (t) => t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d < 2) return t.set(x, y, [90, 90, 90]);
    t.set(x, y, Math.floor(d) % 3 === 0 ? [150, 36, 16] : t.vary([210, 64, 26], 0.05));
  }),
  tnt_bottom: (t) => t.noise([[180, 50, 22], [160, 40, 18]], 0.04),
  crafting_top: (t) => {
    planks(t);
    t.fill((x, y) => {
      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) t.set(x, y, [92, 64, 36]);
      else if ((x === 5 || x === 10 || y === 5 || y === 10) && x > 1 && x < 14 && y > 1 && y < 14) t.set(x, y, [110, 80, 46]);
    });
  },
  crafting_side: (t) => {
    planks(t);
    for (let x = 0; x < S; x++) for (let y = 0; y < 3; y++) t.set(x, y, t.vary([120, 90, 52], 0.05));
    for (let y = 5; y < 12; y++) { t.set(3, y, [90, 90, 90]); t.set(4, y, [150, 150, 150]); }
    for (let x = 9; x < 14; x++) { t.set(x, 6, [96, 70, 40]); t.set(x, 7, [96, 70, 40]); }
  },
  crafting_front: (t) => {
    planks(t);
    for (let x = 0; x < S; x++) for (let y = 0; y < 3; y++) t.set(x, y, t.vary([120, 90, 52], 0.05));
    for (let y = 5; y < 14; y++) t.set(7, y, [96, 70, 40]);
    for (let x = 4; x < 11; x++) { t.set(x, 5, [140, 140, 140]); t.set(x, 6, [110, 110, 110]); }
  },
  bookshelf: (t) => {
    planks(t);
    const books = [[150, 40, 40], [40, 70, 150], [50, 120, 50], [170, 140, 50], [110, 50, 120], [60, 60, 60]];
    for (const [y0, y1] of [[1, 7], [9, 15]]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(t.r() * 2), c = t.pick(books), top = y0 + Math.floor(t.r() * 2);
        for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = top; y < y1; y++) t.set(xx, y, t.vary(c, 0.06));
        x += w;
      }
    }
  },
  door_lower: (t) => {
    t.fill((x, y) => {
      const frame = x < 2 || x > 13 || y > 13 || y < 1;
      const c = frame ? [130, 100, 58] : t.vary(t.pick(PLANK), 0.04);
      t.set(x, y, x % 4 === 1 && !frame ? [140, 110, 66] : c);
    });
    t.set(12, 2, [60, 60, 60]); t.set(12, 3, [60, 60, 60]);
  },
  door_upper: (t) => {
    t.fill((x, y) => {
      const frame = x < 2 || x > 13 || y < 2 || y > 14;
      if (!frame && y > 2 && y < 8 && x > 2 && x < 13 && x !== 7 && x !== 8) return t.set(x, y, [0, 0, 0], 0);
      const c = frame ? [130, 100, 58] : t.vary(t.pick(PLANK), 0.04);
      t.set(x, y, x % 4 === 1 && !frame ? [140, 110, 66] : c);
    });
  },
  wool: (t) => t.fill((x, y) => {
    const v = 226 + Math.sin(x * 1.3 + y * 0.6) * 8 + Math.cos(y * 1.7 - x * 0.4) * 6 + t.r() * 6;
    t.set(x, y, [v, v, v]);
  }),
};

export function generateAtlas() {
  const atlas = makeCanvas(256, 256);
  const ctx = atlas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  TILES.forEach((name, idx) => {
    const t = new Tile(1000 + idx * 7919);
    (PAINTERS[name] || ((tt) => tt.noise([[255, 0, 255], [0, 0, 0]])))(t);
    const tx = (idx % 16) * S, ty = Math.floor(idx / 16) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const si = (y * S + x) * 4, di = ((ty + y) * 256 + tx + x) * 4;
      for (let k = 0; k < 4; k++) img.data[di + k] = t.d[si + k];
    }
  });
  ctx.putImageData(img, 0, 0);
  return { canvas: atlas, data: img.data };
}

/** Random opaque pixel colour from a tile (for particles). */
export function tilePixel(atlasData, tile, rand = Math.random) {
  const tx = (tile % 16) * S, ty = Math.floor(tile / 16) * S;
  for (let k = 0; k < 8; k++) {
    const x = tx + Math.floor(rand() * S), y = ty + Math.floor(rand() * S);
    const i = (y * 256 + x) * 4;
    if (atlasData[i + 3] > 0) return [atlasData[i] / 255, atlasData[i + 1] / 255, atlasData[i + 2] / 255];
  }
  return [0.5, 0.5, 0.5];
}

/** 10 progressively cracked overlays for block breaking. */
export function generateCracks() {
  const r = mulberry32(99);
  const out = [];
  const cracks = [];
  for (let stage = 0; stage < 10; stage++) {
    for (let k = 0; k < 2; k++) {
      let x = 4 + r() * 8, y = 4 + r() * 8;
      const len = 4 + stage;
      for (let i = 0; i < len; i++) {
        cracks.push([Math.floor(x), Math.floor(y)]);
        x += Math.round(r() * 2 - 1); y += Math.round(r() * 2 - 1);
        x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
      }
    }
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    for (const [x, y] of cracks) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const [x, y] of cracks) ctx.fillRect(Math.min(15, x + 1), y, 1, 1);
    out.push(c);
  }
  return out;
}

function paintCanvas(seed, fn) {
  const t = new Tile(seed);
  fn(t);
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  img.data.set(t.d);
  ctx.putImageData(img, 0, 0);
  return c;
}

const CREEPER = [[93, 186, 72], [68, 150, 52], [126, 210, 98], [48, 118, 38], [104, 196, 84]];
const CREEPER_FACE = ['........', '........', '.##..##.', '.##..##.', '...##...', '..####..', '..####..', '..#..#..'];

export function generateMobTextures() {
  const creeper = paintCanvas(5, (t) => t.noise(CREEPER, 0.06));
  const creeperFace = paintCanvas(6, (t) => {
    t.noise(CREEPER, 0.06);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (CREEPER_FACE[r][c] === '#') {
      for (let k = 0; k < 4; k++) t.set(c * 2 + (k & 1), r * 2 + (k >> 1), t.vary([24, 24, 24], 0.2));
    }
  });
  const PINK = [[240, 164, 160], [232, 154, 150], [246, 176, 170]];
  const pig = paintCanvas(7, (t) => t.noise(PINK, 0.03));
  const pigFace = paintCanvas(8, (t) => {
    t.noise(PINK, 0.03);
    for (const [x, y, c] of [[2, 6, [255, 255, 255]], [3, 6, [20, 20, 20]], [12, 6, [20, 20, 20]], [13, 6, [255, 255, 255]]]) {
      t.set(x, y, c); t.set(x, y + 1, c);
    }
  });
  const snout = paintCanvas(9, (t) => {
    t.noise([[226, 140, 140], [218, 132, 132]], 0.02);
    for (let y = 6; y < 10; y++) { t.set(4, y, [150, 80, 80]); t.set(5, y, [150, 80, 80]); t.set(10, y, [150, 80, 80]); t.set(11, y, [150, 80, 80]); }
  });
  const skin = paintCanvas(10, (t) => t.noise([[196, 146, 108], [186, 136, 98], [204, 156, 116]], 0.03));
  return { creeper, creeperFace, pig, pigFace, snout, skin };
}

/** Isometric block icon for the hotbar/inventory. */
export function drawItemIcon(atlasCanvas, blockTiles, isCross, size = 32) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const k = size / 32;
  const src = (tile) => [(tile % 16) * S, Math.floor(tile / 16) * S];
  if (isCross) {
    const [sx, sy] = src(blockTiles.side);
    ctx.drawImage(atlasCanvas, sx, sy, S, S, 2 * k, 2 * k, 28 * k, 28 * k);
    return c;
  }
  const face = (tile, m, dark) => {
    const [sx, sy] = src(tile);
    ctx.save();
    ctx.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
    ctx.drawImage(atlasCanvas, sx, sy, S, S, 0, 0, S + 0.15, S + 0.15);
    if (dark) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, S + 0.2, S + 0.2);
    }
    ctx.restore();
  };
  face(blockTiles.top, [15 / 16, -7.5 / 16, 15 / 16, 7.5 / 16, 1, 8.5], 0);
  face(blockTiles.left, [15 / 16, 7.5 / 16, 0, 15 / 16, 1, 8.5], 0.22);
  face(blockTiles.right, [15 / 16, -7.5 / 16, 0, 15 / 16, 16, 16], 0.4);
  return c;
}

export { TILE };
