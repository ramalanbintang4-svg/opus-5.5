// Minecraft-style HUD: hotbar, hearts, hunger, XP bar, crosshair, creative inventory.
import { BLOCKS, PLACEABLE, faceTile, TILE } from './blocks.js';
import { drawItemIcon } from './textures.js';
import { isItem, ITEMS, PALETTE, nameOf, TOOL_ITEMS } from './items.js';

const COLORS = {
  K: [24, 6, 6, 255], R: [230, 24, 24, 255], W: [255, 210, 210, 255], D: [150, 10, 10, 255],
  E: [52, 20, 20, 210], M: [176, 104, 52, 255], N: [124, 66, 30, 255], B: [236, 226, 206, 255], O: [20, 20, 20, 255],
  G: [60, 40, 26, 210],
  A: [222, 222, 226, 255], Q: [150, 150, 158, 255], e: [40, 40, 40, 200],
};
const ARMOR = ['KK.....KK', 'KAKKKKKAK', 'KAAAAAAQK', 'KKAAAAQKK', '.KAAAAQK.', '.KAAAAQK.', '.KAAAQQK.', '.KQQQQQK.', '.KKKKKKK.'];
const ARMOR_EMPTY = ARMOR.map((r) => r.replace(/[AQ]/g, 'e'));
const ARMOR_HALF = ARMOR.map((r) => r.split('').map((ch, x) => (x >= 4 && (ch === 'A' || ch === 'Q') ? 'e' : ch)).join(''));
const HEART = ['.KK.KK...', 'KRWKRRK..', 'KWRRRRK..', 'KRRRRDK..', '.KRRDK...', '..KDK....', '...K.....'];
const HEART_EMPTY = ['.KK.KK...', 'KEEKEEK..', 'KEEEEEK..', 'KEEEEEK..', '.KEEEK...', '..KEK....', '...K.....'];
const FOOD = ['.....OO..', '....OBBO.', '....OBO..', '..OOMO...', '.OMMNO...', 'OMMMNO...', 'OMMNO....', '.ONO.....', '..O......'];
const FOOD_EMPTY = ['.....OO..', '....OGGO.', '....OGO..', '..OOGO...', '.OGGGO...', 'OGGGGO...', 'OGGGO....', '.OGO.....', '..O......'];

function sprite(rows, half = null) {
  const w = rows[0].length, h = rows.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let ch = rows[y][x];
    if (half === 'left' && x >= 4 && ch !== 'K' && ch !== 'O' && ch !== '.') ch = ch === 'M' || ch === 'N' || ch === 'B' ? 'G' : 'E';
    const col = COLORS[ch];
    if (!col) continue;
    img.data.set(col, (y * w + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function hotbarImage() {
  const c = document.createElement('canvas');
  c.width = 182; c.height = 22;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, 182, 22);
  for (let i = 0; i < 9; i++) {
    const x = 1 + i * 20;
    g.fillStyle = 'rgba(120,120,120,0.85)'; g.fillRect(x, 1, 20, 20);
    g.fillStyle = 'rgba(70,70,70,0.9)'; g.fillRect(x + 1, 2, 18, 18);
    g.fillStyle = 'rgba(139,139,139,0.55)'; g.fillRect(x + 2, 3, 16, 16);
  }
  return c.toDataURL();
}

function selectorImage() {
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 24, 24);
  g.fillStyle = '#e8e8e8'; g.fillRect(1, 1, 22, 22);
  g.fillStyle = '#a0a0a0'; g.fillRect(2, 2, 20, 20);
  g.clearRect(3, 3, 18, 18);
  return c.toDataURL();
}

/** Flat pixel-art icon for a non-block item. */
export function spriteIcon(sprite, size = 32) {
  const n = sprite.length;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const k = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const rgb = PALETTE[sprite[y][x]];
    if (!rgb) continue;
    g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    g.fillRect(Math.floor(x * k), Math.floor(y * k), Math.ceil(k), Math.ceil(k));
  }
  return c;
}

export function iconFor(atlas, id, size = 32) {
  if (isItem(id)) return spriteIcon(ITEMS[id].sprite, size);
  const d = BLOCKS[id];
  return drawItemIcon(atlas, {
    top: faceTile(id, 'py'), left: faceTile(id, 'pz'), right: faceTile(id, 'px'), side: faceTile(id, 'px'),
  }, d.render === 'cross', size);
}

export class HUD {
  constructor(atlas) {
    this.atlas = atlas;
    this.iconCache = new Map();
    this.root = document.getElementById('hud');
    this.bottom = document.getElementById('hud-bottom');
    this.img = {
      heart: sprite(HEART), heartHalf: sprite(HEART, 'left'), heartEmpty: sprite(HEART_EMPTY),
      food: sprite(FOOD), foodHalf: sprite(FOOD, 'left'), foodEmpty: sprite(FOOD_EMPTY),
      armor: sprite(ARMOR), armorHalf: sprite(ARMOR_HALF), armorEmpty: sprite(ARMOR_EMPTY),
    };
    this.bottom.innerHTML = '';
    const mk = (cls, parent = this.bottom, tag = 'div') => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
    this.bar = mk('hotbar', this.bottom, 'img'); this.bar.src = hotbarImage(); this.bar.alt = '';
    this.sel = mk('selector', this.bottom, 'img'); this.sel.src = selectorImage(); this.sel.alt = '';
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const s = mk('slot');
      const cnt = mk('count', s, 'span');
      this.slotEls.push({ s, cnt, icon: null, id: -1 });
    }
    this.hearts = []; this.foods = []; this.armors = [];
    for (let i = 0; i < 10; i++) { const h = mk('armor', this.bottom, 'img'); h.alt = ''; this.armors.push(h); }
    for (let i = 0; i < 10; i++) { const h = mk('heart', this.bottom, 'img'); h.alt = ''; this.hearts.push(h); }
    for (let i = 0; i < 10; i++) { const h = mk('food', this.bottom, 'img'); h.alt = ''; this.foods.push(h); }
    this.xp = mk('xpbar'); this.xpFill = mk('xpfill', this.xp); this.xpLevel = mk('xplevel');
    this.name = document.getElementById('itemname');
    this.nameTimer = 0;
    this.last = {};
    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  icon(id) {
    if (!this.iconCache.has(id)) this.iconCache.set(id, iconFor(this.atlas, id, 32).toDataURL());
    return this.iconCache.get(id);
  }

  layout() {
    const s = Math.max(1, Math.min(3, Math.min(Math.floor(innerWidth / 190), Math.floor(innerHeight / 200))));
    this.s = s;
    document.documentElement.style.setProperty('--gs', String(s));
    const P = (el, x, y, w, h) => Object.assign(el.style, { left: `${x * s}px`, top: `${y * s}px`, width: `${w * s}px`, height: `${h * s}px` });
    this.bottom.style.width = `${182 * s}px`;
    this.bottom.style.height = `${40 * s}px`;
    const hy = 18;
    P(this.bar, 0, hy, 182, 22);
    this.slotEls.forEach((e, i) => P(e.s, 3 + i * 20, hy + 3, 16, 16));
    this.hearts.forEach((h, i) => P(h, i * 8, 0, 9, 7));
    this.foods.forEach((h, i) => P(h, 182 - 9 - i * 8, -1, 9, 9));
    this.armors.forEach((h, i) => P(h, i * 8, -10, 9, 9));
    P(this.xp, 1, 12, 180, 3);
    P(this.xpLevel, 0, 4, 182, 8);
    this.layoutSel = (i) => P(this.sel, -1 + i * 20, hy - 1, 24, 24);
    this.last = {};
  }

  showName(text) {
    this.name.textContent = text;
    this.name.style.opacity = '1';
    this.nameTimer = 2.2;
  }

  update(dt, st) {
    const L = this.last;
    if (L.selected !== st.selected) { this.layoutSel(st.selected); L.selected = st.selected; }
    st.slots.forEach((slot, i) => {
      const e = this.slotEls[i];
      const id = slot ? slot.id : 0;
      if (e.id !== id) {
        e.id = id;
        e.s.style.backgroundImage = id ? `url(${this.icon(id)})` : 'none';
      }
      const txt = slot && (slot.count > 1 && !st.creative) ? String(slot.count) : '';
      if (e.cnt.textContent !== txt) e.cnt.textContent = txt;
    });
    const showBars = !st.creative;
    if (L.showBars !== showBars) {
      [...this.hearts, ...this.foods, this.xp, this.xpLevel].forEach((el) => (el.style.visibility = showBars ? 'visible' : 'hidden'));
      L.showBars = showBars;
    }
    const hp = Math.ceil(st.health), fd = Math.ceil(st.hunger);
    if (L.hp !== hp || L.flash !== st.hurtFlash > 0) {
      this.hearts.forEach((h, i) => {
        const v = hp - i * 2;
        h.src = v >= 2 ? this.img.heart : v === 1 ? this.img.heartHalf : this.img.heartEmpty;
        h.classList.toggle('shake', hp <= 4);
      });
      L.hp = hp; L.flash = st.hurtFlash > 0;
    }
    const ar = Math.round(st.armor || 0);
    const showArmor = showBars && ar > 0;
    if (L.ar !== ar || L.showArmor !== showArmor) {
      this.armors.forEach((h, i) => {
        const v = ar - i * 2;
        h.src = v >= 2 ? this.img.armor : v === 1 ? this.img.armorHalf : this.img.armorEmpty;
        h.style.visibility = showArmor ? 'visible' : 'hidden';
      });
      L.ar = ar; L.showArmor = showArmor;
    }
    if (L.fd !== fd) {
      this.foods.forEach((h, i) => {
        const v = fd - i * 2;
        h.src = v >= 2 ? this.img.food : v === 1 ? this.img.foodHalf : this.img.foodEmpty;
      });
      L.fd = fd;
    }
    const xpw = `${Math.round(st.xpProgress * 100)}%`;
    if (L.xpw !== xpw) { this.xpFill.style.width = xpw; L.xpw = xpw; }
    const lvl = st.level > 0 ? String(st.level) : '';
    if (L.lvl !== lvl) { this.xpLevel.textContent = lvl; L.lvl = lvl; }
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer < 0.6) this.name.style.opacity = String(Math.max(0, this.nameTimer / 0.6));
    }
  }
}

/** Creative inventory grid (E). onPick(id) is called when a block is chosen. */
export function buildInventory(hud, onPick) {
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';
  for (const id of [...TOOL_ITEMS, ...PLACEABLE]) {
    const b = document.createElement('button');
    b.className = 'inv-slot';
    b.title = nameOf(id);
    b.setAttribute('aria-label', nameOf(id));
    b.style.backgroundImage = `url(${hud.icon(id)})`;
    b.addEventListener('click', () => onPick(id));
    grid.appendChild(b);
  }
}

export { TILE };
