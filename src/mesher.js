// Chunk mesher: face culling, smooth ambient occlusion, sky-shadow, cross plants, water, doors.
// Pure JS (no three.js) so it can be unit tested in Node.
import { BLOCKS, B, faceTile } from './blocks.js';
import { CHUNK, HEIGHT } from './terrain.js';

export const FACES = [
  { name: 'px', n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },
  { name: 'nx', n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },
  { name: 'py', n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { name: 'ny', n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { name: 'pz', n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { name: 'nz', n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
];
const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.48, 0.66, 0.83, 1.0];
const EPS = 1 / 4096;

const N = BLOCKS.length;
const OPAQUE = new Uint8Array(256);
const SKYBLOCK = new Uint8Array(256);
for (let i = 0; i < N; i++) {
  if (!BLOCKS[i]) continue;
  OPAQUE[i] = BLOCKS[i].opaque ? 1 : 0;
  SKYBLOCK[i] = BLOCKS[i].opaque || BLOCKS[i].shadeSky || BLOCKS[i].liquid ? 1 : 0;
}

export function tileUV(tile, u, v) {
  const tx = tile % 16, ty = Math.floor(tile / 16);
  const uu = Math.min(1 - EPS, Math.max(EPS, u));
  const vv = Math.min(1 - EPS, Math.max(EPS, v));
  return [(tx + uu) / 16, 1 - (ty + 1 - vv) / 16];
}

class Buf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(p, uv, col, flip = false) {
    const b = this.n;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(col[i], col[i], col[i]);
    }
    if (flip) this.idx.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  out() {
    return {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.col),
      indices: this.n > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
      vertexCount: this.n,
    };
  }
}

const P = CHUNK + 2;
const PP = P * P;

/** Copy chunk + 1-block border from neighbours into a padded volume. */
function buildVolume(world, chunk, top) {
  const vol = new Uint8Array(PP * (top + 2));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!c) continue;
      const xa = dx === -1 ? CHUNK - 1 : 0, xb = dx === 1 ? 0 : CHUNK - 1;
      const za = dz === -1 ? CHUNK - 1 : 0, zb = dz === 1 ? 0 : CHUNK - 1;
      for (let y = 0; y <= top + 1 && y < HEIGHT; y++) {
        for (let z = za; z <= zb; z++) {
          const pz = z + dz * CHUNK + 1;
          const src = z * CHUNK + y * CHUNK * CHUNK;
          const dst = pz * P + y * PP + dx * CHUNK + 1;
          for (let x = xa; x <= xb; x++) vol[dst + x] = c.data[src + x];
        }
      }
    }
  }
  return vol;
}

// Minecraft-like light level -> brightness curve (with a little ambient so caves aren't pitch black)
const LIGHT_CURVE = new Float32Array(16);
for (let l = 0; l < 16; l++) {
  const f = l / 15;
  LIGHT_CURVE[l] = 0.1 + 0.9 * (f / (3 - 2 * f));
}
const ATTEN = new Uint8Array(256);
for (let i = 0; i < N; i++) if (BLOCKS[i]) ATTEN[i] = BLOCKS[i].liquid ? 3 : BLOCKS[i].shadeSky ? 2 : 1;

/** Flood-fill sky light (0..15) through the padded volume. */
export function computeSkyLight(vol, YMAX) {
  const H = YMAX + 1;
  const light = new Uint8Array(PP * H);
  const skyH = new Int16Array(PP);
  for (let c = 0; c < PP; c++) {
    let y = YMAX;
    while (y >= 0 && !SKYBLOCK[vol[c + y * PP]]) { light[c + y * PP] = 15; y--; }
    skyH[c] = y;
  }
  const queue = [];
  for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) {
    const c = x + z * P;
    let m = skyH[c];
    if (x > 0) m = Math.max(m, skyH[c - 1]);
    if (x < P - 1) m = Math.max(m, skyH[c + 1]);
    if (z > 0) m = Math.max(m, skyH[c - P]);
    if (z < P - 1) m = Math.max(m, skyH[c + P]);
    for (let y = skyH[c] + 1; y <= Math.min(YMAX, m + 1); y++) queue.push(c + y * PP);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const l = light[i];
    if (l <= 1) continue;
    const y = Math.floor(i / PP), c = i - y * PP, z = Math.floor(c / P), x = c - z * P;
    const visit = (j) => {
      const id = vol[j];
      if (OPAQUE[id]) return;
      const nl = l - ATTEN[id];
      if (nl > light[j]) { light[j] = nl; queue.push(j); }
    };
    if (x > 0) visit(i - 1);
    if (x < P - 1) visit(i + 1);
    if (z > 0) visit(i - P);
    if (z < P - 1) visit(i + P);
    if (y > 0) visit(i - PP);
    if (y < YMAX) visit(i + PP);
  }
  return light;
}

export function meshChunk(world, chunk) {
  let top = chunk.maxY;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
    if (c) top = Math.max(top, c.maxY);
  }
  top = Math.min(HEIGHT - 2, top);
  const vol = buildVolume(world, chunk, top);
  const YMAX = top + 1;
  const at = (x, y, z) => (y < 0 ? B.BEDROCK : y > YMAX ? 0 : vol[(x + 1) + (z + 1) * P + y * PP]);

  const light = computeSkyLight(vol, YMAX);
  const skyAt = (x, y, z) => (y > YMAX ? 1 : y < 0 ? 0 : LIGHT_CURVE[light[(x + 1) + (z + 1) * P + y * PP]]);
  const lightCell = (x, y, z) => skyAt(x, y, z);

  const solid = new Buf();
  const water = new Buf();

  for (let y = 0; y <= top; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = at(x, y, z);
        if (!id) continue;
        const def = BLOCKS[id];
        if (def.render === 'cube') {
          for (const f of FACES) {
            const ox = x + f.n[0], oy = y + f.n[1], oz = z + f.n[2];
            if (oy < 0) continue;
            const nb = at(ox, oy, oz);
            if (OPAQUE[nb]) continue;
            if (nb === id && def.cullSelf) continue;
            const tile = faceTile(id, f.name);
            const ax = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
            const a = ax === 0 ? 1 : 0, b = ax === 2 ? 1 : 2;
            const p = [], uv = [], col = [], aos = [];
            for (let i = 0; i < 4; i++) {
              const c = f.c[i];
              const s = [0, 0, 0];
              const ea = [0, 0, 0]; ea[a] = c[a] ? 1 : -1;
              const eb = [0, 0, 0]; eb[b] = c[b] ? 1 : -1;
              const s1 = [ox + ea[0], oy + ea[1], oz + ea[2]];
              const s2 = [ox + eb[0], oy + eb[1], oz + eb[2]];
              const cr = [ox + ea[0] + eb[0], oy + ea[1] + eb[1], oz + ea[2] + eb[2]];
              const o1 = OPAQUE[at(s1[0], s1[1], s1[2])], o2 = OPAQUE[at(s2[0], s2[1], s2[2])];
              const o3 = OPAQUE[at(cr[0], cr[1], cr[2])];
              const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
              let ls = skyAt(ox, oy, oz), cnt = 1;
              if (!o1) { ls += skyAt(s1[0], s1[1], s1[2]); cnt++; }
              if (!o2) { ls += skyAt(s2[0], s2[1], s2[2]); cnt++; }
              if (!o3 && !(o1 && o2)) { ls += skyAt(cr[0], cr[1], cr[2]); cnt++; }
              const light = ls / cnt;
              aos.push(ao);
              s[0] = x + c[0]; s[1] = y + c[1]; s[2] = z + c[2];
              p.push(s);
              uv.push(tileUV(tile, UVC[i][0], UVC[i][1]));
              col.push(f.shade * AO_CURVE[ao] * light);
            }
            solid.quad(p, uv, col, aos[0] + aos[2] < aos[1] + aos[3]);
          }
        } else if (def.render === 'water') {
          const above = at(x, y + 1, z);
          const h = above === B.WATER ? 1 : 0.875;
          for (const f of FACES) {
            const ox = x + f.n[0], oy = y + f.n[1], oz = z + f.n[2];
            if (oy < 0) continue;
            const nb = at(ox, oy, oz);
            if (nb === B.WATER || OPAQUE[nb]) continue;
            const tile = faceTile(id, f.name);
            const l = Math.max(0.6, f.shade) * lightCell(ox, Math.min(oy, YMAX), oz);
            const p = f.c.map((c) => [x + c[0], y + (c[1] ? h : 0), z + c[2]]);
            water.quad(p, UVC.map(([u, v]) => tileUV(tile, u, v)), [l, l, l, l]);
          }
        } else if (def.render === 'cross') {
          const tile = faceTile(id, 'px');
          const l = 0.92 * lightCell(x, y, z);
          const cl = [l, l, l, l];
          const uv = UVC.map(([u, v]) => tileUV(tile, u, v));
          const i0 = 0.15, i1 = 0.85;
          const q1 = [[x + i0, y, z + i0], [x + i1, y, z + i1], [x + i1, y + 1, z + i1], [x + i0, y + 1, z + i0]];
          const q2 = [[x + i0, y, z + i1], [x + i1, y, z + i0], [x + i1, y + 1, z + i0], [x + i0, y + 1, z + i1]];
          for (const q of [q1, q2]) {
            solid.quad(q, uv, cl);
            solid.quad([q[1], q[0], q[3], q[2]], [uv[0], uv[1], uv[2], uv[3]], cl);
          }
        } else if (def.render === 'door') {
          const tile = faceTile(id, 'px');
          const t = 3 / 16;
          const l = lightCell(x, y, z - 1 >= -1 ? z - 1 : z);
          for (const f of FACES) {
            const p = f.c.map((c) => [x + c[0], y + c[1], z + c[2] * t]);
            const k = f.shade * l;
            solid.quad(p, UVC.map(([u, v]) => tileUV(tile, u, v)), [k, k, k, k]);
          }
        }
      }
    }
  }
  return { solid: solid.out(), water: water.out() };
}

/** Geometry data for a single block as an item (held in hand). */
export function meshItem(id) {
  const buf = new Buf();
  const def = BLOCKS[id];
  if (def.render === 'cross') {
    const tile = faceTile(id, 'px');
    const uv = UVC.map(([u, v]) => tileUV(tile, u, v));
    const q = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]];
    buf.quad(q, uv, [1, 1, 1, 1]);
    buf.quad([q[1], q[0], q[3], q[2]], uv, [1, 1, 1, 1]);
    return buf.out();
  }
  for (const f of FACES) {
    const tile = faceTile(id, f.name);
    const p = f.c.map((c) => [c[0] - 0.5, c[1] - 0.5, c[2] - 0.5]);
    const s = Math.max(0.7, f.shade);
    buf.quad(p, UVC.map(([u, v]) => tileUV(tile, u, v)), [s, s, s, s]);
  }
  return buf.out();
}
