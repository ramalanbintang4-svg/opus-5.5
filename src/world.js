// Chunked voxel world storage + edits. No DOM dependencies.
import { TerrainGen, CHUNK, HEIGHT, SEA } from './terrain.js';
import { B, BLOCKS } from './blocks.js';

export { CHUNK, HEIGHT, SEA };

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    this.maxY = 0;
    this.dirty = true;
    this.meshes = null;
  }
}

export const chunkKey = (cx, cz) => `${cx},${cz}`;

export class World {
  constructor(seed = 1337, edits = {}) {
    this.seed = seed;
    this.gen = new TerrainGen(seed);
    this.chunks = new Map();
    /** @type {Map<string, Map<number, number>>} */
    this.edits = new Map();
    for (const [k, arr] of Object.entries(edits || {})) {
      const m = new Map();
      for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.edits.set(k, m);
    }
    this.editsDirty = false;
    this.onBlockChange = null;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  ensureChunk(cx, cz) {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    c = new Chunk(cx, cz);
    this.gen.generateChunk(c);
    const e = this.edits.get(k);
    if (e) {
      for (const [i, id] of e) {
        c.data[i] = id;
        const y = Math.floor(i / (CHUNK * CHUNK));
        if (id && y + 1 > c.maxY) c.maxY = Math.min(HEIGHT - 1, y + 1);
      }
    }
    this.chunks.set(k, c);
    return c;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return B.AIR;
    return c.data[(x - cx * CHUNK) + (z - cz * CHUNK) * CHUNK + y * CHUNK * CHUNK];
  }

  isSolid(x, y, z) {
    return BLOCKS[this.getBlock(x, y, z)].solid;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const i = lx + lz * CHUNK + y * CHUNK * CHUNK;
    if (c.data[i] === id) return false;
    c.data[i] = id;
    if (id && y + 1 > c.maxY) c.maxY = Math.min(HEIGHT - 1, y + 1);
    c.dirty = true;
    const k = chunkKey(cx, cz);
    let e = this.edits.get(k);
    if (!e) this.edits.set(k, (e = new Map()));
    e.set(i, id);
    this.editsDirty = true;
    // neighbours share faces / AO / light at borders
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        if ((dx === -1 && lx > 1) || (dx === 1 && lx < CHUNK - 2)) continue;
        if ((dz === -1 && lz > 1) || (dz === 1 && lz < CHUNK - 2)) continue;
        const n = this.getChunk(cx + dx, cz + dz);
        if (n) n.dirty = true;
      }
    }
    if (this.onBlockChange) this.onBlockChange(x, y, z, id);
    return true;
  }

  /** Highest y whose block blocks skylight in the column (or -1). */
  skyHeight(x, z, fromY = HEIGHT - 1) {
    for (let y = fromY; y >= 0; y--) {
      const d = BLOCKS[this.getBlock(x, y, z)];
      if (d.opaque || d.shadeSky) return y;
    }
    return -1;
  }

  /** Top solid block y at column, used for spawning. */
  surfaceY(x, z) {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (BLOCKS[id].solid || id === B.WATER) return y;
    }
    return 0;
  }

  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) {
      const arr = [];
      for (const [i, id] of m) arr.push(i, id);
      out[k] = arr;
    }
    return out;
  }

  /**
   * Voxel DDA ray cast. Returns {x,y,z, nx,ny,nz, id, dist} or null.
   * Skips air and liquids.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 5) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = sx ? Math.abs(1 / dx) : Infinity;
    const tdy = sy ? Math.abs(1 / dy) : Infinity;
    const tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tmx = sx > 0 ? (x + 1 - ox) * tdx : sx < 0 ? (ox - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - oy) * tdy : sy < 0 ? (oy - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - oz) * tdz : sz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 64 && t <= maxDist; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && !BLOCKS[id].liquid) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
