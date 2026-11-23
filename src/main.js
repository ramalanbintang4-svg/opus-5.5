import '@fontsource/vt323';
import './style.css';
import * as THREE from 'three';
import { World, CHUNK } from './world.js';
import { B, BLOCKS, dropOf } from './blocks.js';
import { I, isItem, ITEMS, nameOf, validId, maxStack, breakTime, attackDamage } from './items.js';
import { generateAtlas, generateCracks, generateMobTextures } from './textures.js';
import { Renderer, geometryFrom } from './render.js';
import { meshItem } from './mesher.js';
import { Player } from './player.js';
import { HUD, buildInventory } from './hud.js';
import { Entities, Particles } from './entities.js';
import { collides } from './physics.js';
import { initAudio, sfx, materialOf } from './sound.js';
import { storage } from './storage.js';
import { setupTouch } from './touch.js';

const SAVE_KEY = 'blockcraft-save-v1';
const DAY_LENGTH = 900; // seconds
const REACH = 5;
const params = new URLSearchParams(location.search);

/* ---------------- assets ---------------- */
const atlas = generateAtlas();
const R = new Renderer(document.getElementById('app'), atlas.canvas);
R.setCracks(generateCracks());
const mobTex = generateMobTextures();
R.setArmTexture(mobTex.skin);

/* ---------------- game state ---------------- */
const save = storage.getJSON(SAVE_KEY);
const game = {
  state: 'menu',
  world: null,
  player: new Player(),
  scene: R.scene,
  particles: new Particles(R.scene, atlas.data),
  time: save?.time ?? 0.16,
  renderDist: Math.max(3, Math.min(10, Number(params.get('rd')) || Number(save?.renderDist) || (matchMedia('(pointer: coarse)').matches ? 4 : 6))),
  shake: 0,
  slots: [],
  selected: 0,
  tntGeometry: geometryFrom(meshItem(B.TNT)),
  tntMaterial: R.itemMat.clone(),
  onMobKilled(m, xp) {
    game.player.xp += xp;
    sfx.pop();
    if (m.type === 'pig' && !game.player.creative) {
      game.player.hunger = Math.min(20, game.player.hunger + 8);
      toast('Ate a porkchop');
    }
  },
  onPlayerHurt() { sfx.hurt(); },
};
game.tntMaterial.fog = true;
const { player } = game;
const entities = new Entities(game, mobTex);
game.entities = entities;
const hud = new HUD(atlas.canvas);

const DEFAULT_SLOTS = [
  { id: I.IRON_SWORD, count: 1 }, { id: I.IRON_PICKAXE, count: 1 }, { id: I.IRON_SHOVEL, count: 1 }, { id: I.IRON_AXE, count: 1 },
  { id: B.PLANKS, count: 64 }, { id: B.COBBLE, count: 40 }, { id: B.GLASS, count: 24 }, { id: B.TNT, count: 12 }, { id: I.BREAD, count: 15 },
];
const heldId = () => (game.slots[game.selected] ? game.slots[game.selected].id : 0);

function newWorld(seed, edits) {
  if (game.world) {
    for (const c of game.world.chunks.values()) R.disposeChunk(c);
    entities.clear();
  }
  game.world = new World(seed, edits);
  game.spawn = computeSpawn();
}

function computeSpawn() {
  const { site } = game.world.gen;
  const x = site.cx + 9.5, z = site.cz - 12.5;
  const tx = site.cx + 4, tz = site.cz + 8;
  return { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), pitch: -0.08, house: site };
}

function ensureAround(cx, cz, r) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) game.world.ensureChunk(cx + dx, cz + dz);
}

function placePlayerAtSpawn() {
  const s = game.spawn;
  ensureAround(Math.floor(s.x / CHUNK), Math.floor(s.z / CHUNK), 2);
  let y = game.world.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1;
  while (collides(game.world, s.x, y, s.z, player.hw, player.h)) y++;
  Object.assign(player.pos, { x: s.x, y, z: s.z });
  Object.assign(player.vel, { x: 0, y: 0, z: 0 });
  player.yaw = s.yaw; player.pitch = s.pitch;
  player.fallStart = null;
}

function spawnInitialMobs() {
  const s = game.spawn;
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const lx = -Math.cos(s.yaw), lz = Math.sin(s.yaw);
  const c = entities.trySpawnAround('creeper', s.x + fx * 13 + lx * 5, s.z + fz * 13 + lz * 5, 0, 2.5);
  if (c) c.yaw = s.yaw;
  for (let i = 0; i < 3; i++) entities.trySpawnAround('pig', s.x, s.z, 10, 22);
}

function loadGame() {
  const seedParam = Number(params.get('seed'));
  if (seedParam) {
    newWorld(seedParam);
    game.slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
    placePlayerAtSpawn();
  } else if (save && save.seed) {
    newWorld(save.seed, save.edits);
    game.slots = (save.slots || DEFAULT_SLOTS).map((s) => (s && validId(s.id) ? { ...s } : null));
    const p = save.player;
    if (p) {
      Object.assign(player.pos, { x: p.x, y: p.y, z: p.z });
      player.yaw = p.yaw; player.pitch = p.pitch;
      player.health = p.health ?? 20; player.hunger = p.hunger ?? 20; player.xp = p.xp ?? 0; player.armor = p.armor ?? 12;
      player.creative = !!p.creative; player.flying = !!p.flying && player.creative;
      ensureAround(Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK), 2);
    } else placePlayerAtSpawn();
  } else {
    newWorld(Math.floor(Math.random() * 1e9) + 1);
    game.slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
    placePlayerAtSpawn();
  }
  spawnInitialMobs();
}

function saveGame() {
  if (!game.world) return;
  storage.setJSON(SAVE_KEY, {
    seed: game.world.seed,
    edits: game.world.serializeEdits(),
    time: game.time,
    renderDist: game.renderDist,
    slots: game.slots,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch,
      health: player.health, hunger: player.hunger, armor: player.armor, xp: player.xp, creative: player.creative, flying: player.flying,
    },
  });
  game.world.editsDirty = false;
}

/* ---------------- chunk streaming ---------------- */
let offsets = [];
let offsetsR = -1;
function chunkOffsets(r) {
  if (offsetsR === r) return offsets;
  offsets = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= (r + 0.5) * (r + 0.5)) offsets.push([dx, dz, dx * dx + dz * dz]);
  offsets.sort((a, b) => a[2] - b[2]);
  offsetsR = r;
  return offsets;
}

function hasNeighbours(cx, cz) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!game.world.getChunk(cx + dx, cz + dz)) return false;
  return true;
}

function streamChunks(budgetMs) {
  const w = game.world;
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  const t0 = performance.now();
  const rd = game.renderDist;
  // 1) re-mesh edited chunks right away
  for (const [dx, dz] of chunkOffsets(rd)) {
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (c && c.meshes && c.dirty) R.buildChunk(w, c);
  }
  // 2) generate + mesh new ones, nearest first
  for (const [dx, dz] of chunkOffsets(rd + 1)) {
    if (performance.now() - t0 > budgetMs) break;
    const cx = pcx + dx, cz = pcz + dz;
    if (!w.getChunk(cx, cz)) { w.ensureChunk(cx, cz); continue; }
    if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) continue;
    const c = w.getChunk(cx, cz);
    if (!c.meshes && hasNeighbours(cx, cz)) R.buildChunk(w, c);
  }
  // 3) unload far chunks
  const lim = (rd + 3) * (rd + 3);
  for (const [k, c] of w.chunks) {
    const dx = c.cx - pcx, dz = c.cz - pcz;
    if (dx * dx + dz * dz > lim) { R.disposeChunk(c); w.chunks.delete(k); }
  }
}

/* ---------------- input ---------------- */
const keys = new Set();
const mouse = { left: false, right: false };
let locked = false;
let lastW = 0, lastSpace = 0, sprintTap = false;
const canvas = R.renderer.domElement;

function setState(s) {
  game.state = s;
  document.body.className = s;
  for (const id of ['menu', 'pause', 'dead', 'inventory']) document.getElementById(id).classList.toggle('active', s === (id === 'inventory' ? 'inv' : id === 'pause' ? 'paused' : id));
  if (s !== 'playing') { keys.clear(); mouse.left = mouse.right = false; }
  document.getElementById('btn-mode').textContent = player.creative ? 'Switch to Survival' : 'Switch to Creative';
}

function lock() {
  initAudio();
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* pointer lock unavailable */ }
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && game.state === 'playing') { setState('paused'); saveGame(); }
});

function startPlaying() {
  setState('playing');
  lock();
}

canvas.addEventListener('click', () => { if (game.state === 'playing' && !locked) lock(); });

document.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (!locked && (!(e.buttons & 1) || document.body.classList.contains('touch-device'))) return;
  const sens = locked ? 0.0022 : 0.005;
  player.yaw -= e.movementX * sens;
  player.pitch = Math.max(-1.5599, Math.min(1.5599, player.pitch - e.movementY * sens));
});

document.addEventListener('mousedown', (e) => {
  if (game.state !== 'playing' || !(locked || e.target === canvas)) return;
  if (e.button === 0) { mouse.left = true; attackOrStartBreak(); }
  if (e.button === 2) { mouse.right = true; placeTimer = 0; usePlace(); }
  if (e.button === 1) { e.preventDefault(); pickBlock(); }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (game.state !== 'playing') return;
  selectSlot((game.selected + (e.deltaY > 0 ? 1 : 8)) % 9);
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.code === 'F3' || e.code === 'Backquote') { e.preventDefault(); document.getElementById('debug').classList.toggle('on'); return; }
  if (e.code === 'KeyE') {
    if (game.state === 'playing') { openInventory(); return; }
    if (game.state === 'inv') { closeInventory(); return; }
  }
  if (e.code === 'Escape' && game.state === 'inv') { closeInventory(); return; }
  if (game.state !== 'playing') return;
  if (['Space', 'Tab', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
  const now = performance.now();
  if (e.code === 'KeyW' && !e.repeat) { if (now - lastW < 280) sprintTap = true; lastW = now; }
  if (e.code === 'Space' && !e.repeat) {
    if (player.creative && now - lastSpace < 300) { player.flying = !player.flying; player.vel.y = 0; }
    lastSpace = now;
  }
  if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) selectSlot(n - 1); }
  if (e.code === 'KeyF' && player.creative) { player.flying = !player.flying; player.vel.y = 0; toast(player.flying ? 'Flying enabled' : 'Flying disabled'); }
  if (e.code === 'KeyG') toggleMode();
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyW') sprintTap = false;
});
window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });

function toggleMode() {
  player.creative = !player.creative;
  if (!player.creative) player.flying = false;
  toast(player.creative ? 'Game mode: Creative' : 'Game mode: Survival');
  document.getElementById('btn-mode').textContent = player.creative ? 'Switch to Survival' : 'Switch to Creative';
}

let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  toastTimer = 2;
}

function selectSlot(i) {
  game.selected = i;
  const s = game.slots[i];
  hud.showName(s ? nameOf(s.id) : '');
}

function openInventory() {
  setState('inv');
  if (document.exitPointerLock) document.exitPointerLock();
}
function closeInventory() { startPlaying(); }

buildInventory(hud, (id) => {
  game.slots[game.selected] = { id, count: maxStack(id) };
  selectSlot(game.selected);
  sfx.pop();
});

/* ---------------- block interaction ---------------- */
let target = null; // current block ray hit
let mobTarget = null;
let breaking = null; // {x,y,z,progress}
let breakCooldown = 0;
let placeTimer = 0;
let swing = 1;
let placeAnim = 0;

function doSwing() { swing = 0; }

function updateTarget() {
  const e = player.eye, d = player.lookDir();
  target = game.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, REACH);
  const mh = entities.raycast(e, d, 3.5);
  mobTarget = mh && (!target || mh.dist < target.dist) ? mh.mob : null;
}

function attackOrStartBreak() {
  doSwing();
  if (mobTarget) {
    const dmg = attackDamage(heldId());
    entities.hurtMob(mobTarget, player.creative ? Math.max(6, dmg) : dmg, player.pos.x, player.pos.z);
    if (player.sprinting) { mobTarget.vel.x *= 1.5; mobTarget.vel.z *= 1.5; }
    return;
  }
  breaking = null;
  if (player.creative && target) { breakBlock(target); breakCooldown = 0.25; }
}

function addItem(id) {
  if (player.creative) return;
  for (const s of game.slots) if (s && s.id === id && s.count < maxStack(id)) { s.count++; return; }
  for (let i = 0; i < 9; i++) if (!game.slots[i]) { game.slots[i] = { id, count: 1 }; return; }
}

function breakBlock(hit) {
  const w = game.world;
  const def = BLOCKS[hit.id];
  if (def.hardness === Infinity && !player.creative) return;
  if (def.explosive && !player.creative) {
    w.setBlock(hit.x, hit.y, hit.z, B.AIR);
    entities.primeTNT(hit.x, hit.y, hit.z, 3);
    return;
  }
  w.setBlock(hit.x, hit.y, hit.z, B.AIR);
  game.particles.blockBurst(hit.x, hit.y, hit.z, hit.id);
  sfx.dig(materialOf(hit.id));
  const drop = dropOf(hit.id);
  if (drop) addItem(drop);
  if (def.xp && !player.creative) player.xp += def.xp;
  // unsupported plants / door halves
  const above = w.getBlock(hit.x, hit.y + 1, hit.z);
  if (BLOCKS[above].plant || above === B.DOOR_UPPER) {
    w.setBlock(hit.x, hit.y + 1, hit.z, B.AIR);
    game.particles.blockBurst(hit.x, hit.y + 1, hit.z, above, 10);
  }
  if (hit.id === B.DOOR_UPPER && w.getBlock(hit.x, hit.y - 1, hit.z) === B.DOOR_LOWER) w.setBlock(hit.x, hit.y - 1, hit.z, B.AIR);
}

function updateBreaking(dt) {
  breakCooldown -= dt;
  if (!mouse.left || !target || mobTarget) { breaking = null; R.showCrack(null, -1); return; }
  if (player.creative) {
    if (breakCooldown <= 0) { breakBlock(target); breakCooldown = 0.25; doSwing(); }
    R.showCrack(null, -1);
    return;
  }
  if (!breaking || breaking.x !== target.x || breaking.y !== target.y || breaking.z !== target.z) {
    breaking = { x: target.x, y: target.y, z: target.z, progress: 0, sound: 0 };
  }
  if (breakCooldown > 0) return;
  const time = breakTime(target.id, heldId());
  if (time === Infinity) { R.showCrack(null, -1); return; }
  breaking.progress += time <= 0 ? 1 : dt / (time * (player.onGround || player.inWater ? 1 : 3));
  breaking.sound -= dt;
  if (breaking.sound <= 0) { breaking.sound = 0.22; sfx.step(materialOf(target.id)); }
  if (swing >= 1) doSwing();
  if (breaking.progress >= 1) {
    breakBlock(target);
    breaking = null;
    breakCooldown = 0.18;
    R.showCrack(null, -1);
  } else R.showCrack(target, Math.floor(breaking.progress * 10));
}

function usePlace() {
  const slot = game.slots[game.selected];
  if (slot && isItem(slot.id)) { useItem(slot); return; }
  if (!target || !slot) return;
  const w = game.world;
  const id = slot.id;
  const def = BLOCKS[id];
  let x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  if (BLOCKS[target.id].plant && target.id === B.TALL_GRASS) { x = target.x; y = target.y; z = target.z; }
  const cur = w.getBlock(x, y, z);
  if (cur !== B.AIR && cur !== B.WATER && cur !== B.TALL_GRASS) return;
  if (def.plant) {
    const below = w.getBlock(x, y - 1, z);
    if (![B.GRASS, B.DIRT, B.COARSE_DIRT, B.SNOWY_GRASS].includes(below)) return;
  }
  if (def.solid) {
    const inter = (e) => x < e.pos.x + e.hw && x + 1 > e.pos.x - e.hw && y < e.pos.y + e.h && y + 1 > e.pos.y && z < e.pos.z + e.hw && z + 1 > e.pos.z - e.hw;
    if (inter(player)) return;
    if (entities.mobs.some(inter)) return;
  }
  if (!w.setBlock(x, y, z, id)) return;
  sfx.place(materialOf(id));
  doSwing();
  placeAnim = 1;
  if (!player.creative) {
    slot.count--;
    if (slot.count <= 0) game.slots[game.selected] = null;
  }
}

function useItem(slot) {
  const def = ITEMS[slot.id];
  if (!def.food || player.creative || player.hunger >= 20) return;
  player.hunger = Math.min(20, player.hunger + def.food);
  sfx.pop();
  toast(`Ate ${def.name.toLowerCase()}`);
  placeAnim = 1;
  slot.count--;
  if (slot.count <= 0) game.slots[game.selected] = null;
}

function pickBlock() {
  if (!target) return;
  let id = target.id;
  if (id === B.DOOR_LOWER || id === B.DOOR_UPPER) id = B.PLANKS;
  if (id === B.SNOWY_GRASS) id = B.GRASS;
  const idx = game.slots.findIndex((s) => s && s.id === id);
  if (idx >= 0) { selectSlot(idx); return; }
  if (player.creative) { game.slots[game.selected] = { id, count: 64 }; selectSlot(game.selected); }
}

setupTouch({
  keys, mouse, canvas,
  onMine: () => { if (game.state === 'playing') attackOrStartBreak(); },
  onPlace: () => { if (game.state === 'playing') { placeTimer = 0; usePlace(); } },
  onInventory: () => { if (game.state === 'playing') openInventory(); },
  onPause: () => { if (game.state === 'playing') { setState('paused'); saveGame(); } },
  look: (dx, dy) => {
    if (game.state !== 'playing') return;
    player.yaw -= dx * 0.006;
    player.pitch = Math.max(-1.5599, Math.min(1.5599, player.pitch - dy * 0.006));
  },
});
hud.slotEls.forEach((e, i) => e.s.addEventListener('pointerdown', () => { if (game.state === 'playing') selectSlot(i); }));

/* ---------------- UI buttons ---------------- */
const $ = (id) => document.getElementById(id);
$('btn-play').addEventListener('click', () => { if (player.creative) toggleMode(); startPlaying(); });
$('btn-creative').addEventListener('click', () => { if (!player.creative) toggleMode(); player.flying = false; startPlaying(); });
$('btn-controls').addEventListener('click', () => {
  const p = $('controls-panel');
  p.hidden = !p.hidden;
  $('btn-controls').setAttribute('aria-expanded', String(!p.hidden));
});
$('btn-resume').addEventListener('click', startPlaying);
$('btn-mode').addEventListener('click', toggleMode);
$('btn-inv-close').addEventListener('click', closeInventory);
$('btn-reset').addEventListener('click', () => {
  storage.remove(SAVE_KEY);
  newWorld(Math.floor(Math.random() * 1e9) + 1);
  game.slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  Object.assign(player, { health: 20, hunger: 20, armor: 12, xp: 0, dead: false, flying: false });
  game.time = 0.16;
  placePlayerAtSpawn();
  spawnInitialMobs();
  startPlaying();
});
$('btn-quit').addEventListener('click', () => { saveGame(); setState('menu'); });
$('btn-respawn').addEventListener('click', () => {
  Object.assign(player, { health: 20, hunger: 20, dead: false, flying: false });
  placePlayerAtSpawn();
  startPlaying();
});
$('btn-dead-quit').addEventListener('click', () => {
  Object.assign(player, { health: 20, hunger: 20, dead: false });
  placePlayerAtSpawn();
  saveGame();
  setState('menu');
});
const rd = $('rd');
rd.value = String(game.renderDist);
$('rd-val').textContent = rd.value;
rd.addEventListener('input', () => { game.renderDist = Number(rd.value); $('rd-val').textContent = rd.value; });
window.addEventListener('beforeunload', saveGame);

/* ---------------- main loop ---------------- */
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fps = 0, saveTimer = 0, debugTimer = 0;
const events = {};

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

  const playing = game.state === 'playing';
  const live = playing || game.state === 'inv';
  streamChunks(playing ? 7 : 14);

  if (live || game.state === 'paused') game.time = (game.time + (live ? dt / DAY_LENGTH : 0)) % 1;

  for (const k in events) delete events[k];
  if (live) {
    const input = {
      forward: playing && keys.has('KeyW'), back: playing && keys.has('KeyS'),
      left: playing && keys.has('KeyA'), right: playing && keys.has('KeyD'),
      jump: playing && keys.has('Space'), sneak: playing && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
      sprint: playing && (keys.has('ControlLeft') || keys.has('ControlRight') || sprintTap),
    };
    // don't fall into ungenerated chunks
    const pc = game.world.getChunk(Math.floor(player.pos.x / CHUNK), Math.floor(player.pos.z / CHUNK));
    if (pc && pc.meshes) player.update(game.world, dt, input, events);
    if (events.step) sfx.step(materialOf(events.step));
    if (events.hurt) game.onPlayerHurt();
    if (events.land) game.particles.blockBurst(Math.floor(player.pos.x), Math.floor(player.pos.y - 1), Math.floor(player.pos.z), Math.max(1, game.world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.5), Math.floor(player.pos.z))), 6);

    updateTarget();
    if (playing) {
      updateBreaking(dt);
      if (mouse.right) { placeTimer += dt; if (placeTimer > 0.24) { placeTimer = 0; usePlace(); } }
    }
    if (player.dead && game.state !== 'dead') {
      $('score').textContent = String(player.xp);
      if (document.exitPointerLock) document.exitPointerLock();
      setState('dead');
    }
  }

  const light = R.updateSky(game.time, player.headInWater && live, game.renderDist);
  if (live || game.state === 'dead') entities.update(dt, light);
  game.particles.update(dt, game.world, light);

  // camera
  const cam = R.camera;
  if (game.state === 'menu') {
    // title-screen panorama
    const t = now / 1000;
    const s = game.spawn;
    cam.position.set(s.x, player.pos.y + 1.62 + 6, s.z);
    cam.rotation.set(-0.12, s.yaw + t * 0.05, 0);
    R.highlight.visible = false;
  } else {
    const e = player.eye;
    const bobY = -Math.abs(Math.cos(player.walkDist * Math.PI)) * 0.07 * player.bob;
    const bobX = Math.sin(player.walkDist * Math.PI) * 0.035 * player.bob;
    game.shake = Math.max(0, game.shake - dt);
    const sh = game.shake * 0.25;
    cam.position.set(
      e.x + bobX * Math.cos(player.yaw) + (Math.random() - 0.5) * sh,
      e.y + bobY + (Math.random() - 0.5) * sh,
      e.z - bobX * Math.sin(player.yaw) + (Math.random() - 0.5) * sh,
    );
    const hurtRoll = player.hurtFlash > 0 ? Math.sin(player.hurtFlash * 9) * 0.06 : 0;
    cam.rotation.set(player.pitch, player.yaw, Math.sin(player.walkDist * Math.PI) * 0.008 * player.bob + hurtRoll);
    const targetFov = player.sprinting ? 80 : 70;
    if (Math.abs(cam.fov - targetFov) > 0.05) { cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-10 * dt)); cam.updateProjectionMatrix(); }
    R.showHighlight(live && !mobTarget ? target : null, target ? BLOCKS[target.id].render : null);
  }
  R.updateClouds(now / 1000);

  // hand
  swing = Math.min(1, swing + dt / 0.3);
  placeAnim = Math.max(0, placeAnim - dt * 5);
  const slot = game.slots[game.selected];
  R.setHeld(slot ? slot.id : 0);
  R.handRoot.visible = game.state !== 'menu' && !player.dead;
  R.updateHand(swing >= 1 ? 0 : swing, player.walkDist, player.bob, light, placeAnim);

  R.render();

  // HUD
  hud.update(dt, {
    slots: game.slots, selected: game.selected, health: player.health, hunger: player.hunger, armor: player.armor,
    xpProgress: player.xpProgress, level: player.level, creative: player.creative, hurtFlash: player.hurtFlash,
  });
  $('hurt').style.opacity = String(Math.min(1, player.hurtFlash * 3));
  $('underwater').classList.toggle('on', live && player.headInWater);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }

  debugTimer -= dt;
  if (debugTimer <= 0 && $('debug').classList.contains('on')) {
    debugTimer = 0.25;
    const p = player.pos;
    const dirs = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'];
    const facing = dirs[((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const tb = target ? `${BLOCKS[target.id].name} @ ${target.x} ${target.y} ${target.z}` : 'none';
    const lines = [
      `BlockCraft (${fps} fps)`, `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Chunk: ${Math.floor(p.x / CHUNK)} ${Math.floor(p.z / CHUNK)}  loaded: ${game.world.chunks.size}`, `Facing: ${facing}`,
      `Target: ${tb}`, `Time: ${(game.time * 24000) | 0}  Mobs: ${entities.mobs.length}`,
      `Mode: ${player.creative ? 'Creative' : 'Survival'}${player.flying ? ' (flying)' : ''}  Seed: ${game.world.seed}`,
    ];
    $('debug').innerHTML = lines.map((l) => `<span>${l}</span>`).join('\n');
  }

  saveTimer += dt;
  if (saveTimer > 10 && live) { saveTimer = 0; saveGame(); }
}

loadGame();
setState('menu');
selectSlot(0);
if (params.has('play')) { setState('playing'); }
if (params.has('creative') && !player.creative) toggleMode();
if (params.has('inv')) openInventory();
// warm up spawn area before the first frame
for (let i = 0; i < 4; i++) streamChunks(40);
requestAnimationFrame(frame);

// expose for debugging in the console
window.blockcraft = { game, THREE, breakBlock, usePlace, updateTarget, getTarget: () => target };

// ?selftest runs a scripted gameplay smoke test and prints the results in the debug overlay
if (params.has('selftest')) {
  const out = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (ok, msg) => {
    out.push(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
    const d = document.getElementById('debug');
    d.classList.add('on');
    d.innerHTML = out.map((l) => `<span>${l}</span>`).join('\n');
    debugTimer = 1e9;
  };
  (async () => {
    await wait(500);
    setState('playing');
    await wait(300);
    const w = game.world;
    const part = params.get('selftest') || 'all';
    log(player.onGround, `player on ground at y=${player.pos.y.toFixed(2)}`);
    if (part !== 'mobs') {
    player.pitch = -0.9; updateTarget();
    const t0 = target;
    log(!!t0, `target below: ${t0 ? BLOCKS[t0.id].name : 'none'}`);
    const before = game.slots.reduce((a, s) => a + (s ? s.count : 0), 0);
    if (t0) { breakBlock(t0); log(w.getBlock(t0.x, t0.y, t0.z) === B.AIR, 'block broken'); }
    const after = game.slots.reduce((a, s) => a + (s ? s.count : 0), 0);
    log(after >= before, `inventory ${before} -> ${after}`);
    await wait(300);
    updateTarget();
    const pk = game.slots.findIndex((s) => s && s.id === B.PLANKS);
    selectSlot(pk);
    const t1 = target;
    usePlace();
    log(t1 && w.getBlock(t1.x + t1.nx, t1.y + t1.ny, t1.z + t1.nz) === B.PLANKS, 'placed planks');
    log(game.slots[pk].count === 63, `planks left ${game.slots[pk].count}`);
    log(breakTime(B.STONE, I.IRON_PICKAXE) < breakTime(B.STONE, 0) / 5, 'pickaxe speeds up stone');
    log(attackDamage(I.IRON_SWORD) > attackDamage(0), 'sword hits harder than hand');
    // real DOM input events: number key, mouse look, W to walk, held left button to mine
    const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    key('keydown', 'Digit3'); key('keyup', 'Digit3');
    log(game.selected === 2 && heldId() === I.IRON_SHOVEL, `key 3 selects ${nameOf(heldId())}`);
    const yaw0 = player.yaw;
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: -60, movementY: 0, buttons: 1, bubbles: true }));
    log(Math.abs(player.yaw - yaw0) > 0.05, `mouse look turns yaw ${yaw0.toFixed(2)} -> ${player.yaw.toFixed(2)}`);
    // face a direction with 3 clear blocks ahead at feet and head height
    const free = (yw) => {
      for (let k = 1; k <= 3; k++) {
        const bx = Math.floor(player.pos.x - Math.sin(yw) * k), bz = Math.floor(player.pos.z - Math.cos(yw) * k);
        const by = Math.floor(player.pos.y + 0.01);
        if (BLOCKS[w.getBlock(bx, by, bz)].solid || BLOCKS[w.getBlock(bx, by + 1, bz)].solid) return false;
      }
      return true;
    };
    player.yaw = [yaw0, 0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4].find(free) ?? yaw0;
    const p0 = { x: player.pos.x, z: player.pos.z };
    key('keydown', 'KeyW'); await wait(500); key('keyup', 'KeyW');
    const walked = Math.hypot(player.pos.x - p0.x, player.pos.z - p0.z);
    log(walked > 0.5, `W walks forward ${walked.toFixed(2)} blocks`);
    await wait(200);
    player.pitch = -1.2; updateTarget();
    const tm = target;
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const need = tm ? breakTime(tm.id, heldId()) : 0;
    await wait(need * 1000 + 500);
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    log(!!tm && w.getBlock(tm.x, tm.y, tm.z) !== tm.id, `holding left click mines ${tm ? BLOCKS[tm.id].name : 'nothing'} with ${nameOf(heldId())} (${need.toFixed(2)}s)`);
    }
    if (part !== 'input') {
    // TNT
    const hp0 = player.health;
    const tx = Math.floor(player.pos.x) + 2, tz = Math.floor(player.pos.z);
    const ty = w.getBlock(tx, Math.floor(player.pos.y), tz) === B.AIR ? Math.floor(player.pos.y) : w.surfaceY(tx, tz) + 1;
    entities.primeTNT(tx, ty, tz, 1);
    await wait(1800);
    log(player.health < hp0, `TNT hurt player ${hp0} -> ${player.health}`);
    log(w.getBlock(tx, ty - 1, tz) === B.AIR, 'TNT made a crater');
    // creeper
    player.health = 20; player.hurtCooldown = 0;
    const c = entities.spawn('creeper', player.pos.x - 2.5, player.pos.y + 0.5, player.pos.z);
    await wait(2600);
    log(c.dead, 'creeper exploded next to player');
    log(entities.mobs.every((m) => m.model.group.parent), 'mob models in scene');
    }
    log(fps > 0, `fps ${fps}, chunks ${w.chunks.size}`);
    log(out.every((l) => l.startsWith('PASS')), 'SELFTEST DONE');
    const d = document.getElementById('debug');
    d.classList.add('on');
    d.innerHTML = out.map((l) => `<span>${l}</span>`).join('\n');
    debugTimer = 1e9;
  })();
}
