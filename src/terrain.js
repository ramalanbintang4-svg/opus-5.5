// Procedural terrain: hills, stone mountains, beaches, lakes, trees, grass, a village house.
import { Simplex, hash2, hash3 } from './noise.js';
import { B } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 42;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class TerrainGen {
  constructor(seed = 1337) {
    this.seed = seed;
    this.n1 = new Simplex(seed);
    this.n2 = new Simplex(seed + 101);
    this.n3 = new Simplex(seed + 202);
    this.n4 = new Simplex(seed + 303);
    this.heightCache = new Map();
    this.site = this.findHouseSite();
    this.structure = buildHouse(this, this.site);
  }

  heightAt(x, z) {
    const k = x * 100003 + z;
    const c = this.heightCache.get(k);
    if (c !== undefined) return c;
    const cont = this.n1.fbm2(x * 0.0022, z * 0.0022, 3);
    const hills = this.n2.fbm2(x * 0.011, z * 0.011, 4);
    const ridge = Math.pow(1 - Math.abs(this.n3.fbm2(x * 0.0055, z * 0.0055, 3)), 2.2);
    const mask = smooth(0.0, 0.42, this.n4.fbm2(x * 0.0028 + 50, z * 0.0028 - 30, 2));
    let h = 47 + cont * 12 + hills * 6 + mask * (ridge * 52 + hills * 10);
    h = Math.floor(Math.min(HEIGHT - 8, Math.max(4, h)));
    if (this.heightCache.size > 400000) this.heightCache.clear();
    this.heightCache.set(k, h);
    return h;
  }

  /** Surface description for a column. */
  column(x, z) {
    const h = this.heightAt(x, z);
    const slope = Math.max(
      Math.abs(this.heightAt(x + 1, z) - h), Math.abs(this.heightAt(x - 1, z) - h),
      Math.abs(this.heightAt(x, z + 1) - h), Math.abs(this.heightAt(x, z - 1) - h),
    );
    let top = B.GRASS, filler = B.DIRT;
    if (h <= SEA + 1) {
      top = h < SEA - 3 && hash2(x >> 2, z >> 2, this.seed) < 0.3 ? B.GRAVEL : B.SAND;
      filler = B.SAND;
    } else if (h > 96) {
      top = B.SNOW; filler = B.STONE;
    } else if (h > 86) {
      top = slope >= 2 ? B.STONE : B.SNOWY_GRASS; filler = slope >= 2 ? B.STONE : B.DIRT;
    } else if (slope >= 3 || h > 78) {
      top = B.STONE; filler = B.STONE;
    }
    return { h, top, filler, slope };
  }

  treeAt(x, z) {
    const col = this.column(x, z);
    if (col.top !== B.GRASS || col.slope > 1) return null;
    const forest = this.n2.noise2(x * 0.008 + 300, z * 0.008 - 200);
    const density = 0.004 + Math.max(0, forest) * 0.05;
    if (hash2(x, z, this.seed + 7) >= density) return null;
    if (this.site && Math.abs(x - this.site.cx) < 12 && Math.abs(z - this.site.cz) < 16) return null;
    return { h: col.h, trunk: 4 + Math.floor(hash2(x, z, this.seed + 9) * 3) };
  }

  findHouseSite() {
    for (let r = 0; r < 400; r += 8) {
      const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 16));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        let mn = Infinity, mx = -Infinity;
        for (let dx = -7; dx <= 7; dx += 2) {
          for (let dz = -12; dz <= 6; dz += 2) {
            const h = this.heightAt(x + dx, z + dz);
            mn = Math.min(mn, h); mx = Math.max(mx, h);
          }
        }
        if (mn > SEA + 2 && mx - mn <= 2 && mx < 70) return { cx: x, cz: z, y: Math.round((mn + mx) / 2) + 1 };
      }
    }
    return { cx: 0, cz: 0, y: this.heightAt(0, 0) + 1 };
  }

  generateChunk(chunk) {
    const { cx, cz, data } = chunk;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let maxY = 0;
    const set = (lx, y, lz, id) => {
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
      if (id && y > maxY) maxY = y;
    };
    const get = (lx, y, lz) => data[lx + lz * CHUNK + y * CHUNK * CHUNK];

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const { h, top, filler } = this.column(x, z);
        const bed = 1 + Math.floor(hash2(x, z, this.seed + 3) * 3);
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let id;
          if (y < bed) id = B.BEDROCK;
          else if (y < h - 3) {
            id = B.STONE;
            const r = hash3(x, y, z, this.seed);
            if (r < 0.011 && y < 90) id = B.COAL_ORE;
            else if (r < 0.016 && y < 55) id = B.IRON_ORE;
          } else if (y < h) id = filler;
          else if (y === h) id = top;
          else id = y <= SEA ? B.WATER : B.AIR;
          if (id) set(lx, y, lz, id);
        }
        // plants
        if (top === B.GRASS && h > SEA) {
          const r = hash2(x, z, this.seed + 21);
          const g = 0.12 + Math.max(0, this.n1.noise2(x * 0.05, z * 0.05)) * 0.35;
          if (r < 0.006) set(lx, h + 1, lz, B.POPPY);
          else if (r < 0.012) set(lx, h + 1, lz, B.DANDELION);
          else if (r < g) set(lx, h + 1, lz, B.TALL_GRASS);
        }
      }
    }

    // Trees (may cross chunk borders, so scan a margin)
    for (let z = z0 - 3; z < z0 + CHUNK + 3; z++) {
      for (let x = x0 - 3; x < x0 + CHUNK + 3; x++) {
        const t = this.treeAt(x, z);
        if (!t) continue;
        const lx = x - x0, lz = z - z0, base = t.h + 1, topY = base + t.trunk;
        for (let y = topY - 3; y <= topY; y++) {
          const r = y >= topY - 1 ? 1 : 2;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              const corner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (corner && (y === topY || hash3(x + dx, y, z + dz, this.seed + 5) < 0.5)) continue;
              const px = lx + dx, pz = lz + dz;
              if (px < 0 || px >= CHUNK || pz < 0 || pz >= CHUNK) continue;
              const cur = get(px, y, pz);
              if (cur === B.AIR || cur === B.TALL_GRASS) set(px, y, pz, B.LEAVES);
            }
          }
        }
        for (let y = base; y < topY; y++) set(lx, y, lz, B.LOG);
        set(lx, t.h, lz, B.DIRT);
      }
    }

    // Structure (house) overrides
    const list = this.structure.get(`${cx},${cz}`);
    if (list) for (const [lx, y, lz, id] of list) set(lx, y, lz, id);

    chunk.maxY = Math.min(HEIGHT - 1, maxY + 1);
  }
}

/** A plank village house with log corners, windows, door, stepped roof and a dirt path. */
export function buildHouse(gen, site) {
  const map = new Map();
  const put = (x, y, z, id) => {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = `${cx},${cz}`;
    let l = map.get(key);
    if (!l) map.set(key, (l = []));
    l.push([x - cx * CHUNK, y, z - cz * CHUNK, id]);
  };
  const W = 11, D = 9, WALL = 4;
  const X0 = site.cx - Math.floor(W / 2), Z0 = site.cz - Math.floor(D / 2), Y = site.y;
  // Clear + flatten an area around the house
  for (let x = X0 - 3; x < X0 + W + 3; x++) {
    for (let z = Z0 - 9; z < Z0 + D + 3; z++) {
      const h = gen.heightAt(x, z);
      for (let y = Math.min(h, Y - 1); y < Y - 1; y++) put(x, y, z, B.DIRT);
      put(x, Y - 1, z, B.GRASS);
      for (let y = Y; y < Y + 14; y++) put(x, y, z, B.AIR);
    }
  }
  // Path from the door
  const doorX = X0 + Math.floor(W / 2);
  for (let z = Z0 - 9; z < Z0; z++) {
    for (let dx = -1; dx <= 0; dx++) put(doorX + dx + (z % 3 === 0 ? 1 : 0), Y - 1, z, B.COARSE_DIRT);
  }
  // Floor
  for (let x = X0; x < X0 + W; x++) for (let z = Z0; z < Z0 + D; z++) put(x, Y - 1, z, B.COBBLE);
  // Walls
  for (let y = Y; y < Y + WALL; y++) {
    for (let x = X0; x < X0 + W; x++) {
      for (let z = Z0; z < Z0 + D; z++) {
        const edgeX = x === X0 || x === X0 + W - 1, edgeZ = z === Z0 || z === Z0 + D - 1;
        if (!edgeX && !edgeZ) continue;
        let id = edgeX && edgeZ ? B.LOG : B.PLANKS;
        const win = y === Y + 1 || y === Y + 2;
        if (win && edgeZ && !edgeX && (Math.abs(x - doorX) === 3 || Math.abs(x - doorX) === 2)) id = B.GLASS;
        if (win && edgeX && !edgeZ && (z === Z0 + 3 || z === Z0 + 5)) id = B.GLASS;
        put(x, y, z, id);
      }
    }
  }
  put(doorX, Y, Z0, B.DOOR_LOWER);
  put(doorX, Y + 1, Z0, B.DOOR_UPPER);
  // Log beam on top of walls
  for (let x = X0; x < X0 + W; x++) { put(x, Y + WALL, Z0, B.LOG); put(x, Y + WALL, Z0 + D - 1, B.LOG); }
  for (let z = Z0; z < Z0 + D; z++) { put(X0, Y + WALL, z, B.LOG); put(X0 + W - 1, Y + WALL, z, B.LOG); }
  // Stepped gable roof along X
  for (let k = 0; ; k++) {
    const za = Z0 - 1 + k, zb = Z0 + D - k;
    if (za > zb) break;
    const y = Y + WALL + 1 + k;
    for (let x = X0 - 1; x <= X0 + W; x++) {
      for (let z = za; z <= zb; z++) {
        const rim = z === za || z === zb;
        if (rim) put(x, y, z, B.PLANKS);
        else if (x === X0 || x === X0 + W - 1) put(x, y, z, B.PLANKS); // gable ends
      }
    }
  }
  // Interior
  put(X0 + 1, Y, Z0 + D - 2, B.CRAFTING);
  put(X0 + 2, Y, Z0 + D - 2, B.BOOKSHELF);
  put(X0 + 3, Y, Z0 + D - 2, B.BOOKSHELF);
  put(X0 + W - 2, Y, Z0 + D - 2, B.WOOL);
  return map;
}
