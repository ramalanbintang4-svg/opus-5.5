// Mobs (creepers, pigs), primed TNT, explosions and block particles.
import * as THREE from 'three';
import { moveEntity, collides, inWater, GRAVITY } from './physics.js';
import { B, BLOCKS, faceTile } from './blocks.js';
import { tilePixel } from './textures.js';
import { sfx } from './sound.js';

const PX = 1 / 16;

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

function box(w, h, d, mats) {
  const g = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
  return new THREE.Mesh(g, mats);
}

/* ---------------- particles ---------------- */
export class Particles {
  constructor(scene, atlasData) {
    this.max = 700;
    this.atlasData = atlasData;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.list = [];
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, c);
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.color = new THREE.Color();
  }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  blockBurst(x, y, z, id, n = 24) {
    const tile = faceTile(id, 'px');
    for (let i = 0; i < n; i++) {
      const c = tilePixel(this.atlasData, tile);
      this.add({
        x: x + 0.15 + Math.random() * 0.7, y: y + 0.15 + Math.random() * 0.7, z: z + 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, vz: (Math.random() - 0.5) * 3,
        life: 0.5 + Math.random() * 0.6, size: 0.07 + Math.random() * 0.06, c, g: 1,
      });
    }
  }
  smoke(x, y, z, n, spread, big = false) {
    for (let i = 0; i < n; i++) {
      const v = 0.55 + Math.random() * 0.35;
      this.add({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        life: 0.6 + Math.random() * 0.9, size: big ? 0.3 + Math.random() * 0.5 : 0.12, c: [v, v, v], g: -0.15,
      });
    }
  }
  update(dt, world, light) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; }
      p.vy -= GRAVITY * 0.6 * p.g * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.g > 0 && BLOCKS[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))].solid) {
        p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      if (p.g < 0) { p.vx *= 0.96; p.vz *= 0.96; }
    }
    for (const p of this.list) {
      const s = p.size * (p.g < 0 ? Math.min(1, p.life * 2) : 1);
      this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(n, this.m);
      this.color.setRGB(p.c[0] * light, p.c[1] * light, p.c[2] * light);
      this.mesh.setColorAt(n, this.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ---------------- mobs ---------------- */
class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.walk = 0;
    this.wanderT = 0;
    this.moving = false;
    this.hurtT = 0;
    this.dead = false;
    this.fuse = 0;
    this.fleeT = 0;
    this.sound = 2 + Math.random() * 6;
  }
}

function buildCreeper(t) {
  const skin = new THREE.MeshBasicMaterial({ map: t.creeper });
  const face = new THREE.MeshBasicMaterial({ map: t.creeperFace });
  const mats = [skin];
  const g = new THREE.Group();
  const head = box(8, 8, 8, [skin, skin, skin, skin, face, skin]);
  head.position.set(0, 22 * PX, 0);
  const body = box(8, 12, 4, skin);
  body.position.set(0, 12 * PX, 0);
  g.add(head, body);
  const legs = [];
  for (const [x, z] of [[-2, 4], [2, 4], [-2, -4], [2, -4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * PX, 6 * PX, z * PX);
    const leg = box(4, 6, 4, skin);
    leg.position.y = -3 * PX;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  return { group: g, head, legs, mats: [skin, face, ...mats.slice(1)] };
}

function buildPig(t) {
  const skin = new THREE.MeshBasicMaterial({ map: t.pig });
  const face = new THREE.MeshBasicMaterial({ map: t.pigFace });
  const snoutM = new THREE.MeshBasicMaterial({ map: t.snout });
  const g = new THREE.Group();
  const body = box(10, 8, 16, skin);
  body.position.set(0, 9 * PX, 0);
  const head = box(8, 8, 8, [skin, skin, skin, skin, face, skin]);
  head.position.set(0, 12 * PX, 10 * PX);
  const snout = box(4, 3, 1, snoutM);
  snout.position.set(0, -1.5 * PX, 4.5 * PX);
  head.add(snout);
  g.add(body, head);
  const legs = [];
  for (const [x, z] of [[-3, 6], [3, 6], [-3, -6], [3, -6]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * PX, 5 * PX, z * PX);
    const leg = box(4, 5, 4, skin);
    leg.position.y = -2.5 * PX;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  return { group: g, head, legs, mats: [skin, face, snoutM] };
}

const TYPES = {
  creeper: { hw: 0.3, h: 1.65, hp: 20, speed: 1.6, chase: 2.6, build: buildCreeper, xp: 5 },
  pig: { hw: 0.45, h: 0.9, hp: 10, speed: 1.1, chase: 0, build: buildPig, xp: 2 },
};

export class Entities {
  constructor(game, mobCanvases) {
    this.game = game;
    this.tex = Object.fromEntries(Object.entries(mobCanvases).map(([k, c]) => [k, tex(c)]));
    this.mobs = [];
    this.tnts = [];
    this.spawnTimer = 0;
  }

  spawn(type, x, y, z) {
    const T = TYPES[type];
    const m = new Mob(type, x, y, z);
    m.hw = T.hw; m.h = T.h; m.hp = T.hp;
    const model = T.build(this.tex);
    m.model = model;
    this.game.scene.add(model.group);
    this.mobs.push(m);
    return m;
  }

  remove(m) {
    m.dead = true;
    this.game.scene.remove(m.model.group);
    m.model.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    m.model.mats.forEach((mt) => mt.dispose());
  }

  clear() {
    for (const m of this.mobs) this.remove(m);
    this.mobs = [];
    for (const t of this.tnts) this.game.scene.remove(t.mesh);
    this.tnts = [];
  }

  /** Try to place a mob on the surface around (cx,cz). */
  trySpawnAround(type, cx, cz, rMin, rMax) {
    const { world } = this.game;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
      if (!world.getChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const y = world.surfaceY(x, z);
      const ground = world.getBlock(x, y, z);
      if (ground !== B.GRASS && ground !== B.DIRT) continue;
      if (collides(world, x + 0.5, y + 1, z + 0.5, TYPES[type].hw, TYPES[type].h)) continue;
      return this.spawn(type, x + 0.5, y + 1, z + 0.5);
    }
    return null;
  }

  /** Ray vs mob AABBs. Returns {mob, dist} */
  raycast(o, d, maxDist) {
    let best = null;
    for (const m of this.mobs) {
      const min = [m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw], max = [m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw];
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      let t0 = 0, t1 = maxDist, ok = true;
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < min[i] || oo[i] > max[i]) ok = false; continue; }
        let a = (min[i] - oo[i]) / dd[i], b = (max[i] - oo[i]) / dd[i];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && (!best || t0 < best.dist)) best = { mob: m, dist: t0 };
    }
    return best;
  }

  hurtMob(m, dmg, fromX, fromZ) {
    if (m.hurtT > 0.25) return;
    m.hp -= dmg;
    m.hurtT = 0.45;
    const dx = m.pos.x - fromX, dz = m.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    m.vel.x += (dx / l) * 7; m.vel.z += (dz / l) * 7; m.vel.y = 5.5;
    m.fleeT = 4;
    sfx.hit();
    if (m.type === 'pig') sfx.oink();
    if (m.hp <= 0) {
      this.game.particles.smoke(m.pos.x, m.pos.y + m.h / 2, m.pos.z, 18, 0.8);
      this.game.onMobKilled(m, TYPES[m.type].xp);
      this.remove(m);
    }
  }

  primeTNT(x, y, z, fuse = 3) {
    const mesh = new THREE.Mesh(this.game.tntGeometry, this.game.tntMaterial.clone());
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.game.scene.add(mesh);
    this.tnts.push({ pos: { x: x + 0.5, y, z: z + 0.5 }, vel: { x: (Math.random() - 0.5) * 1.5, y: 4, z: (Math.random() - 0.5) * 1.5 }, hw: 0.49, h: 0.98, fuse, mesh, onGround: false });
    sfx.fuse();
  }

  explode(x, y, z, power) {
    const { world, player, particles } = this.game;
    sfx.explode();
    const r = power;
    const changed = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dy, dz);
      if (d > r * (0.7 + Math.random() * 0.35)) continue;
      const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
      const id = world.getBlock(bx, by, bz);
      if (!id || id === B.BEDROCK || id === B.WATER) continue;
      if (id === B.TNT) { world.setBlock(bx, by, bz, B.AIR); this.primeTNT(bx, by, bz, 0.4 + Math.random() * 1.0); continue; }
      world.setBlock(bx, by, bz, B.AIR);
      if (Math.random() < 0.08) changed.push([bx, by, bz, id]);
    }
    for (const [bx, by, bz, id] of changed) particles.blockBurst(bx, by, bz, id, 4);
    particles.smoke(x, y, z, 70, r * 1.6, true);
    // damage + knockback
    const pd = Math.hypot(player.pos.x - x, player.pos.y + 0.9 - y, player.pos.z - z);
    if (pd < r * 2) {
      const f = 1 - pd / (r * 2);
      const l = pd || 1;
      const kx = ((player.pos.x - x) / l) * f * 14, kz = ((player.pos.z - z) / l) * f * 14;
      if (player.damage(Math.round(f * r * 4.5), kx, kz)) this.game.onPlayerHurt();
      player.vel.y += f * 6;
    }
    for (const m of this.mobs.slice()) {
      const md = Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z);
      if (md < r * 2 && !m.dead) this.hurtMob(m, Math.round((1 - md / (r * 2)) * r * 6), x, z);
    }
    this.game.shake = Math.max(this.game.shake, 0.6);
  }

  update(dt, light) {
    const { world, player } = this.game;
    const survival = !player.creative && !player.dead;

    // maintain population near the player
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 4;
      const near = (t) => this.mobs.filter((m) => m.type === t).length;
      if (near('creeper') < 3) this.trySpawnAround('creeper', player.pos.x, player.pos.z, 24, 44);
      if (near('pig') < 5) this.trySpawnAround('pig', player.pos.x, player.pos.z, 16, 40);
    }

    for (const m of this.mobs.slice()) {
      if (m.dead) continue;
      const T = TYPES[m.type];
      const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, dy = player.pos.y - m.pos.y;
      const dist = Math.hypot(dx, dz, dy);
      if (dist > 96 || !world.getChunk(Math.floor(m.pos.x / 16), Math.floor(m.pos.z / 16))) { this.remove(m); continue; }
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.fleeT = Math.max(0, m.fleeT - dt);
      let speed = 0;
      let targetYaw = m.yaw;

      if (m.type === 'creeper' && survival && dist < 16) {
        targetYaw = Math.atan2(dx, dz);
        if (dist < 3.2) {
          if (m.fuse === 0) sfx.hiss();
          m.fuse += dt;
          speed = 0;
        } else {
          m.fuse = Math.max(0, m.fuse - dt * (dist > 7 ? 1 : 0.25));
          speed = T.chase;
        }
        if (m.fuse >= 1.5) {
          this.remove(m);
          this.explode(m.pos.x, m.pos.y + 0.8, m.pos.z, 3);
          continue;
        }
      } else {
        m.fuse = Math.max(0, m.fuse - dt);
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = 2 + Math.random() * 5;
          m.moving = Math.random() < 0.6;
          m.wanderYaw = Math.random() * Math.PI * 2;
        }
        if (m.fleeT > 0) { targetYaw = Math.atan2(-dx, -dz); speed = T.speed * 2.2; }
        else if (m.moving) { targetYaw = m.wanderYaw; speed = T.speed; }
      }

      // turn smoothly
      let dyaw = ((targetYaw - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      m.yaw += dyaw * Math.min(1, dt * 6);
      const ax = Math.sin(m.yaw) * speed, az = Math.cos(m.yaw) * speed;
      const k = 1 - Math.exp(-(m.onGround ? 10 : 2) * dt);
      m.vel.x += (ax - m.vel.x) * k;
      m.vel.z += (az - m.vel.z) * k;
      const wet = inWater(world, m.pos.x, m.pos.y + 0.3, m.pos.z);
      if (wet) m.vel.y = Math.min(m.vel.y + 18 * dt, 2.5);
      else m.vel.y = Math.max(m.vel.y - GRAVITY * dt, -50);
      const hit = moveEntity(world, m, dt);
      if ((hit.x || hit.z) && m.onGround && speed > 0) m.vel.y = 8.2;
      if ((hit.x || hit.z) && speed > 0 && m.fleeT <= 0 && m.type !== 'creeper') m.wanderYaw = (m.wanderYaw || 0) + Math.PI * 0.7;

      // animation
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.walk += hs * dt * 4;
      const swing = Math.sin(m.walk) * Math.min(1, hs / 1.5) * 0.7;
      m.model.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
      const g = m.model.group;
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      g.rotation.y = m.yaw;
      const swell = m.fuse > 0 ? 1 + Math.min(1.5, m.fuse) * 0.12 : 1;
      g.scale.set(swell, 1 + (swell - 1) * 0.5, swell);
      if (m.type === 'creeper' && dist < 16) m.model.head.rotation.x = -Math.atan2(dy + 1.6 - 1.4, Math.hypot(dx, dz)) * 0.5;
      const flash = m.fuse > 0 && Math.floor(m.fuse * 8) % 2 === 0;
      const hurt = m.hurtT > 0;
      for (const mt of m.model.mats) {
        if (flash) mt.color.setRGB(2.2, 2.2, 2.2);
        else if (hurt) mt.color.setRGB(light * 1.4, light * 0.45, light * 0.45);
        else mt.color.setRGB(light, light, light);
      }
      m.sound -= dt;
      if (m.sound <= 0) { m.sound = 6 + Math.random() * 10; if (m.type === 'pig' && dist < 14) sfx.oink(); }
    }
    this.mobs = this.mobs.filter((m) => !m.dead);

    // primed TNT
    for (const t of this.tnts.slice()) {
      t.fuse -= dt;
      t.vel.y = Math.max(t.vel.y - GRAVITY * dt, -40);
      t.vel.x *= 0.95; t.vel.z *= 0.95;
      moveEntity(world, t, dt);
      t.mesh.position.set(t.pos.x, t.pos.y + 0.49, t.pos.z);
      const flash = Math.floor(t.fuse * 4) % 2 === 0;
      t.mesh.material.color.setScalar(flash ? 2.2 : light);
      if (t.fuse < 0.4) t.mesh.scale.setScalar(1 + (0.4 - t.fuse) * 0.4);
      if (t.fuse <= 0) {
        this.game.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.tnts.splice(this.tnts.indexOf(t), 1);
        this.explode(t.pos.x, t.pos.y + 0.5, t.pos.z, 4);
      }
    }
  }
}
