// Non-block items (tools, food). Pure data, safe to import in Node tests.
// Item ids start at 200 so they never collide with block ids.
import { B, BLOCKS } from './blocks.js';

export const ITEM_BASE = 200;

export const I = {
  IRON_SWORD: 200, IRON_PICKAXE: 201, IRON_AXE: 202, IRON_SHOVEL: 203, BREAD: 204,
};

// Palette for the 16x16 sprites. '.' = transparent.
export const PALETTE = {
  k: [40, 30, 20], // outline (dark)
  h: [104, 78, 40], // handle wood
  H: [137, 103, 54], // handle highlight
  d: [74, 54, 28], // handle shadow
  s: [216, 216, 216], // iron
  S: [255, 255, 255], // iron highlight
  g: [150, 150, 150], // iron shade
  G: [96, 96, 96], // iron dark
  b: [196, 140, 62], // bread crust
  B: [232, 186, 102], // bread light
  c: [150, 96, 38], // bread dark
};

// Sprites drawn the vanilla way: handle bottom-left, head top-right.
const SWORD = [
  '.............kkk',
  '............kSsk',
  '...........kSsgk',
  '..........kSsgk.',
  '.........kSsgk..',
  '........kSsgk...',
  '.......kSsgk....',
  '..kk..kSsgk.....',
  '..kGkkSsgk......',
  '...kGSsgk.......',
  '...kkGgk........',
  '..kHdkGk........',
  '.kHdk.kGk.......',
  'kHdk...kk.......',
  'kdk.............',
  '.k..............',
];
const PICKAXE = [
  '....kkkkkk......',
  '...kSssssgk.....',
  '....kkkkkSgk....',
  '.........kgsk...',
  '........kHkgsk..',
  '.......kHdk.kgk.',
  '......kHdk..kgk.',
  '.....kHdk...kgk.',
  '....kHdk....kGk.',
  '...kHdk......k..',
  '..kHdk..........',
  '.kHdk...........',
  'kHdk............',
  'kdk.............',
  '.k..............',
  '................',
];
const AXE = [
  '.......kkk......',
  '......kSssk.....',
  '.....kSssssk....',
  '....kSssssHkk...',
  '....kSsssHdk....',
  '....kgssHdk.....',
  '.....kgHdk......',
  '.....kHdk.......',
  '....kHdk........',
  '...kHdk.........',
  '..kHdk..........',
  '.kHdk...........',
  'kHdk............',
  'kdk.............',
  '.k..............',
  '................',
];
const SHOVEL = [
  '...........kkk..',
  '..........kSsgk.',
  '.........kSssgk.',
  '.........ksssgk.',
  '..........kggk..',
  '.........kHkk...',
  '........kHdk....',
  '.......kHdk.....',
  '......kHdk......',
  '.....kHdk.......',
  '....kHdk........',
  '...kHdk.........',
  '..kHdk..........',
  '..kdk...........',
  '...k............',
  '................',
];
const BREAD = [
  '................',
  '................',
  '................',
  '................',
  '.........kkkk...',
  '......kkkBBbbk..',
  '....kkBBbBbbBck.',
  '...kBBbbBbbBbck.',
  '..kBbbBbbBbbcck.',
  '..kbbBbbBbccck..',
  '.kbbbbbbcccck...',
  '.kccbbccccck....',
  '..kkcccckkk.....',
  '....kkkk........',
  '................',
  '................',
];

const item = (name, sprite, extra) => ({ name, sprite, item: true, ...extra });

/** @type {Record<number, any>} */
export const ITEMS = {
  [I.IRON_SWORD]: item('Iron Sword', SWORD, { tool: 'sword', damage: 6, speed: 1.5 }),
  [I.IRON_PICKAXE]: item('Iron Pickaxe', PICKAXE, { tool: 'pickaxe', damage: 4, speed: 4 }),
  [I.IRON_AXE]: item('Iron Axe', AXE, { tool: 'axe', damage: 5, speed: 4 }),
  [I.IRON_SHOVEL]: item('Iron Shovel', SHOVEL, { tool: 'shovel', damage: 3.5, speed: 4 }),
  [I.BREAD]: item('Bread', BREAD, { food: 5, stack: 64 }),
};

export const TOOL_ITEMS = [I.IRON_SWORD, I.IRON_PICKAXE, I.IRON_AXE, I.IRON_SHOVEL, I.BREAD];

export const isItem = (id) => id >= ITEM_BASE && !!ITEMS[id];
export const isBlock = (id) => id > 0 && id < ITEM_BASE && !!BLOCKS[id];
/** Block def or item def for any slot id. */
export const defOf = (id) => (isItem(id) ? ITEMS[id] : BLOCKS[id]);
export const nameOf = (id) => (defOf(id) ? defOf(id).name : '');
export const validId = (id) => isItem(id) || isBlock(id);
export const maxStack = (id) => (isItem(id) ? ITEMS[id].stack || 1 : 64);

// Which tool mines each block fastest.
const PICK = [B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.BRICK, B.COAL_ORE, B.IRON_ORE];
const AXE_BLOCKS = [B.LOG, B.PLANKS, B.CRAFTING, B.BOOKSHELF, B.DOOR_LOWER, B.DOOR_UPPER];
const SHOVEL_BLOCKS = [B.DIRT, B.GRASS, B.SAND, B.GRAVEL, B.COARSE_DIRT, B.SNOW, B.SNOWY_GRASS];
export const TOOL_FOR = {};
for (const id of PICK) TOOL_FOR[id] = 'pickaxe';
for (const id of AXE_BLOCKS) TOOL_FOR[id] = 'axe';
for (const id of SHOVEL_BLOCKS) TOOL_FOR[id] = 'shovel';
TOOL_FOR[B.LEAVES] = 'sword';

/**
 * Seconds it takes to break block `blockId` with item `heldId` in hand (on the ground).
 * Infinity = unbreakable.
 */
export function breakTime(blockId, heldId) {
  const h = BLOCKS[blockId]?.hardness ?? 0;
  if (h === Infinity) return Infinity;
  if (h <= 0) return 0;
  const tool = isItem(heldId) ? ITEMS[heldId] : null;
  let t = h;
  // stone-type blocks are painfully slow without a pickaxe, like the original
  if (TOOL_FOR[blockId] === 'pickaxe' && (!tool || tool.tool !== 'pickaxe')) t *= 3.3;
  if (tool && tool.tool && TOOL_FOR[blockId] === tool.tool) t /= tool.speed;
  return t;
}

/**
 * Extrude a 16x16 sprite into a 1-pixel-thick 3D model (like held items in the original).
 * Returns { positions, colors, indices } centered on the origin, 1 unit wide.
 */
export function extrudeSprite(sprite) {
  const n = sprite.length;
  const px = 1 / n, th = px / 2;
  const pos = [], col = [], idx = [];
  const solid = (x, y) => x >= 0 && y >= 0 && x < n && y < n && sprite[y][x] !== '.';
  const quad = (a, b, c, d, rgb, shade) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) col.push((rgb[0] / 255) * shade, (rgb[1] / 255) * shade, (rgb[2] / 255) * shade);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!solid(x, y)) continue;
      const rgb = PALETTE[sprite[y][x]] || [255, 0, 255];
      const x0 = x * px - 0.5, x1 = x0 + px;
      const y1 = 0.5 - y * px, y0 = y1 - px;
      quad([x0, y0, th], [x1, y0, th], [x1, y1, th], [x0, y1, th], rgb, 1);
      quad([x1, y0, -th], [x0, y0, -th], [x0, y1, -th], [x1, y1, -th], rgb, 0.78);
      if (!solid(x - 1, y)) quad([x0, y0, -th], [x0, y0, th], [x0, y1, th], [x0, y1, -th], rgb, 0.7);
      if (!solid(x + 1, y)) quad([x1, y0, th], [x1, y0, -th], [x1, y1, -th], [x1, y1, th], rgb, 0.7);
      if (!solid(x, y - 1)) quad([x0, y1, th], [x1, y1, th], [x1, y1, -th], [x0, y1, -th], rgb, 0.9);
      if (!solid(x, y + 1)) quad([x0, y0, -th], [x1, y0, -th], [x1, y0, th], [x0, y0, th], rgb, 0.6);
    }
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: new Uint32Array(idx) };
}

/** Melee damage dealt with the held item. */
export function attackDamage(heldId) {
  return isItem(heldId) && ITEMS[heldId].damage ? ITEMS[heldId].damage : 2;
}
