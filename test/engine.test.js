import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simplex } from '../src/noise.js';
import { World, CHUNK, HEIGHT, SEA } from '../src/world.js';
import { B, BLOCKS, TILES, PLACEABLE, dropOf } from '../src/blocks.js';
import { meshChunk, meshItem } from '../src/mesher.js';
import { moveEntity, collides } from '../src/physics.js';

test('noise is deterministic and bounded', () => {
  const a = new Simplex(7), b = new Simplex(7);
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, z = i * -0.21;
    assert.equal(a.noise2(x, z), b.noise2(x, z));
    assert.ok(Math.abs(a.noise2(x, z)) <= 1.0001);
    assert.ok(Math.abs(a.noise3(x, z, x)) <= 1.0001);
  }
});

test('every block has valid tiles', () => {
  for (const def of BLOCKS) {
    if (!def || !def.tiles) continue;
    for (const t of Object.values(def.tiles)) assert.ok(TILES.includes(t), `${def.name}: ${t}`);
  }
  for (const id of PLACEABLE) assert.ok(BLOCKS[id]);
  assert.equal(dropOf(B.GRASS), B.DIRT);
  assert.equal(dropOf(B.GLASS), null);
});

test('terrain generation is deterministic with bedrock floor and water at sea level', () => {
  const w1 = new World(42), w2 = new World(42);
  const c1 = w1.ensureChunk(0, 0), c2 = w2.ensureChunk(0, 0);
  assert.deepEqual(c1.data, c2.data);
  assert.equal(w1.getBlock(3, 0, 3), B.BEDROCK);
  // every column has a surface and nothing floats above HEIGHT
  for (let x = 0; x < CHUNK; x++) {
    const y = w1.surfaceY(x, 5);
    assert.ok(y > 0 && y < HEIGHT);
  }
  // below-sea columns are filled with water up to SEA
  let spot = null;
  for (let i = 0; i < 4000 && !spot; i++) {
    const x = (i % 64) * 23 - 700, z = Math.floor(i / 64) * 23 - 700;
    if (w1.gen.heightAt(x, z) < SEA - 2) spot = [x, z];
  }
  assert.ok(spot, 'found an ocean/lake column');
  w1.ensureChunk(Math.floor(spot[0] / CHUNK), Math.floor(spot[1] / CHUNK));
  assert.equal(w1.getBlock(spot[0], SEA, spot[1]), B.WATER);
});

test('village house is generated at the spawn site', () => {
  const w = new World(1337);
  const { cx, cz, y } = w.gen.site;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(Math.floor(cx / CHUNK) + dx, Math.floor(cz / CHUNK) + dz);
  let planks = 0, glass = 0, door = 0;
  for (let x = cx - 8; x <= cx + 8; x++) for (let z = cz - 8; z <= cz + 8; z++) for (let yy = y; yy < y + 12; yy++) {
    const id = w.getBlock(x, yy, z);
    if (id === B.PLANKS) planks++;
    if (id === B.GLASS) glass++;
    if (id === B.DOOR_LOWER) door++;
  }
  assert.ok(planks > 100, `planks ${planks}`);
  assert.ok(glass >= 8);
  assert.equal(door, 1);
});

test('edits persist through serialisation', () => {
  const w = new World(5);
  w.ensureChunk(0, 0);
  w.setBlock(2, 100, 3, B.BRICK);
  assert.equal(w.getBlock(2, 100, 3), B.BRICK);
  const w2 = new World(5, w.serializeEdits());
  w2.ensureChunk(0, 0);
  assert.equal(w2.getBlock(2, 100, 3), B.BRICK);
});

test('raycast hits the block in front with correct face normal', () => {
  const w = new World(5);
  w.ensureChunk(0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 90; y < 110; y++) w.setBlock(x, y, z, B.AIR);
  w.setBlock(8, 100, 8, B.STONE);
  const hit = w.raycast(8.5, 100.5, 5.5, 0, 0, 1, 6);
  assert.ok(hit);
  assert.deepEqual([hit.x, hit.y, hit.z, hit.nz], [8, 100, 8, -1]);
  assert.equal(w.raycast(8.5, 100.5, 5.5, 0, 0, -1, 5), null);
});

test('mesher culls hidden faces', () => {
  const w = new World(5);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.ensureChunk(dx, dz);
  const c = w.getChunk(0, 0);
  c.data.fill(0);
  c.maxY = 0;
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) { const n = w.getChunk(cx, cz); n.data.fill(0); n.maxY = 0; }
  w.setBlock(4, 50, 4, B.STONE);
  let m = meshChunk(w, c);
  assert.equal(m.solid.vertexCount, 24); // single cube, 6 faces
  w.setBlock(5, 50, 4, B.STONE);
  m = meshChunk(w, c);
  assert.equal(m.solid.vertexCount, 40); // two cubes share a hidden face pair
  assert.equal(meshItem(B.GRASS).vertexCount, 24);
});

test('entity lands on the ground and is blocked by walls', () => {
  const w = new World(5);
  w.ensureChunk(0, 0);
  const c = w.getChunk(0, 0);
  c.data.fill(0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setBlock(x, 10, z, B.STONE);
  w.setBlock(8, 11, 6, B.STONE); w.setBlock(8, 12, 6, B.STONE);
  const e = { pos: { x: 8.5, y: 20, z: 8.5 }, vel: { x: 0, y: 0, z: 0 }, hw: 0.3, h: 1.8, onGround: false };
  for (let i = 0; i < 120; i++) { e.vel.y -= 30 / 60; moveEntity(w, e, 1 / 60); }
  assert.ok(e.onGround);
  assert.ok(Math.abs(e.pos.y - 11) < 1e-6, `y=${e.pos.y}`);
  for (let i = 0; i < 120; i++) { e.vel.z = -4; moveEntity(w, e, 1 / 60); }
  assert.ok(e.pos.z > 7 && e.pos.z < 7.31, `z=${e.pos.z}`);
  assert.equal(collides(w, e.pos.x, e.pos.y, e.pos.z, e.hw, e.h), false);
});
