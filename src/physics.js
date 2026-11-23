// AABB vs voxel collision shared by the player and mobs. No DOM dependencies.
import { BLOCKS, B } from './blocks.js';

export const GRAVITY = 30;

/** Does an AABB (feet-centred) intersect any solid block? */
export function collides(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-6);
  for (let by = y0; by <= y1; by++)
    for (let bz = z0; bz <= z1; bz++)
      for (let bx = x0; bx <= x1; bx++)
        if (BLOCKS[world.getBlock(bx, by, bz)].solid) return true;
  return false;
}

export function inWater(world, x, y, z) {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.WATER;
}

/**
 * Move an entity {pos:{x,y,z}, vel:{x,y,z}, hw, h} through the world with collision.
 * Returns info about collisions on each axis.
 */
export function moveEntity(world, e, dt) {
  const hit = { x: false, y: false, z: false, landed: false, fall: 0 };
  const maxStep = 0.35;
  const dist = Math.max(Math.abs(e.vel.x), Math.abs(e.vel.y), Math.abs(e.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  const sdt = dt / steps;
  const wasGround = e.onGround;
  e.onGround = false;
  for (let s = 0; s < steps; s++) {
    for (const axis of ['y', 'x', 'z']) {
      const d = e.vel[axis] * sdt;
      if (!d) continue;
      const p = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
      p[axis] += d;
      if (collides(world, p.x, p.y, p.z, e.hw, e.h)) {
        // snap to the block boundary
        if (axis === 'y') {
          if (d < 0) { e.pos.y = Math.floor(p.y) + 1; e.onGround = true; }
          else e.pos.y = Math.floor(p.y + e.h) - e.h - 1e-4;
        } else {
          const lo = p[axis] - e.hw, hi = p[axis] + e.hw;
          e.pos[axis] = d > 0 ? Math.floor(hi) - e.hw - 1e-4 : Math.floor(lo) + 1 + e.hw + 1e-4;
        }
        if (axis === 'y' && d < 0 && e.vel.y < 0) hit.fall = -e.vel.y;
        e.vel[axis] = 0;
        hit[axis] = true;
      } else {
        e.pos[axis] = p[axis];
      }
    }
  }
  // ground probe (standing still on ground)
  if (!e.onGround && e.vel.y <= 0 && collides(world, e.pos.x, e.pos.y - 0.02, e.pos.z, e.hw, e.h)) e.onGround = true;
  hit.landed = e.onGround && !wasGround;
  return hit;
}
