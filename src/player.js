// First-person player: walking, sprinting, sneaking, jumping, swimming, flying, fall damage.
import { moveEntity, collides, inWater, GRAVITY } from './physics.js';
import { B } from './blocks.js';

export class Player {
  constructor() {
    this.pos = { x: 0, y: 80, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hw = 0.3;
    this.h = 1.8;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.creative = false;
    this.sprinting = false;
    this.sneaking = false;
    this.inWater = false;
    this.headInWater = false;
    this.health = 20;
    this.hunger = 20;
    this.armor = 12; // armor points (0-20), each point blocks 4% of damage
    this.xp = 0;
    this.fallStart = null;
    this.walkDist = 0;
    this.bob = 0;
    this.eyeOffset = 1.62;
    this.regenTimer = 0;
    this.hurtCooldown = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.stepAcc = 0;
  }

  get eye() {
    return { x: this.pos.x, y: this.pos.y + this.eyeOffset, z: this.pos.z };
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  get level() { return Math.floor(Math.sqrt(this.xp / 7)); }
  get xpProgress() {
    const l = this.level, a = l * l * 7, b = (l + 1) * (l + 1) * 7;
    return (this.xp - a) / (b - a);
  }

  damage(amount, kx = 0, kz = 0) {
    if (this.creative || this.dead || amount <= 0) return false;
    if (this.hurtCooldown > 0) return false;
    amount *= 1 - Math.min(20, this.armor) * 0.04;
    this.health = Math.max(0, this.health - amount);
    this.hurtCooldown = 0.5;
    this.hurtFlash = 0.35;
    this.vel.x += kx; this.vel.z += kz; this.vel.y = Math.max(this.vel.y, 5);
    if (this.health <= 0) this.dead = true;
    return true;
  }

  /** @param input {forward,back,left,right,jump,sneak,sprint} */
  update(world, dt, input, events) {
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.dead) return;

    this.inWater = inWater(world, this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.headInWater = inWater(world, this.pos.x, this.pos.y + this.eyeOffset, this.pos.z);
    this.sneaking = input.sneak && !this.flying;
    const moving = input.forward || input.back || input.left || input.right;
    if (!input.forward || this.sneaking || this.hunger <= 6) this.sprinting = false;
    else if (input.sprint && moving) this.sprinting = true;

    let fx = 0, fz = 0;
    if (input.forward) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;

    let speed = this.flying ? (this.sprinting ? 21 : 10.9) : this.sneaking ? 1.3 : this.sprinting ? 5.6 : 4.3;
    if (this.inWater && !this.flying) speed *= 0.55;
    const k = this.flying ? 6 : this.onGround ? 14 : this.inWater ? 6 : 2.6;
    const a = 1 - Math.exp(-k * dt);
    this.vel.x += (wx * speed - this.vel.x) * a;
    this.vel.z += (wz * speed - this.vel.z) * a;

    if (this.flying) {
      let vy = 0;
      if (input.jump) vy += 8;
      if (input.sneak) vy -= 8;
      this.vel.y += (vy - this.vel.y) * (1 - Math.exp(-8 * dt));
      this.fallStart = null;
    } else if (this.inWater) {
      this.vel.y = Math.max(this.vel.y - 10 * dt, -3);
      if (input.jump) this.vel.y = Math.min(this.vel.y + 28 * dt, 4);
      this.fallStart = null;
    } else {
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -55);
      if (input.jump && this.onGround) { this.vel.y = 9; events.jump = true; }
    }

    // sneaking keeps you from walking off edges
    if (this.sneaking && this.onGround) {
      const hw = this.hw - 0.05;
      if (!collides(world, this.pos.x + this.vel.x * dt, this.pos.y - 0.6, this.pos.z, hw, 0.6)) this.vel.x = 0;
      if (!collides(world, this.pos.x, this.pos.y - 0.6, this.pos.z + this.vel.z * dt, hw, 0.6)) this.vel.z = 0;
    }

    const ox = this.pos.x, oz = this.pos.z;
    const hit = moveEntity(world, this, dt);

    // auto-jump onto one block high steps
    if ((hit.x || hit.z) && this.onGround && moving && !this.flying && !this.sneaking) {
      const dx = wx * 0.4, dz = wz * 0.4;
      if (!collides(world, this.pos.x + dx, this.pos.y + 1.05, this.pos.z + dz, this.hw, this.h)) this.vel.y = 8.4;
    }
    if (hit.x || hit.z) this.sprinting = this.sprinting && !(hit.x && hit.z);
    if (this.inWater && (hit.x || hit.z) && input.jump) this.vel.y = 5;

    // fall damage
    if (!this.onGround && !this.flying && !this.inWater) {
      if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = this.pos.y;
    }
    if (this.onGround) {
      if (this.fallStart !== null) {
        const d = this.fallStart - this.pos.y;
        if (d > 3.5) { if (this.damage(Math.floor(d - 3))) events.hurt = true; }
        if (d > 1.2) events.land = true;
      }
      this.fallStart = null;
      if (this.flying && !this.creative) this.flying = false;
    }

    // view bobbing + footsteps
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.onGround && !this.flying) {
      this.walkDist += moved;
      this.stepAcc += moved;
      if (this.stepAcc > 1.9) { this.stepAcc = 0; events.step = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)); }
      this.bob += (Math.min(1, moved / dt / 4.3) - this.bob) * (1 - Math.exp(-10 * dt));
    } else this.bob *= Math.exp(-8 * dt);
    const targetEye = this.sneaking ? 1.47 : 1.62;
    this.eyeOffset += (targetEye - this.eyeOffset) * (1 - Math.exp(-14 * dt));

    // hunger + regeneration
    if (!this.creative) {
      this.hunger = Math.max(0, this.hunger - dt * (this.sprinting ? 0.06 : 0.006));
      this.regenTimer += dt;
      if (this.regenTimer > 3) {
        this.regenTimer = 0;
        if (this.hunger >= 17 && this.health < 20) this.health = Math.min(20, this.health + 1);
        else if (this.hunger <= 0 && this.health > 1) { this.health -= 1; this.hurtFlash = 0.3; }
      }
    } else { this.health = 20; this.hunger = 20; }

    if (this.pos.y < -30) { this.damage(100); }
    if (this.headInWater && world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)) === B.WATER) events.underwater = true;
  }
}
