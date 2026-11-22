// Block registry. Pure data, safe to import in Node tests.

// Texture tiles in the atlas (16 x 16 tiles of 16 px). Order = atlas index.
export const TILES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'sand', 'water', 'log_side',
  'log_top', 'leaves', 'planks', 'glass', 'brick', 'gravel', 'bedrock', 'tall_grass',
  'poppy', 'dandelion', 'snow', 'coal_ore', 'iron_ore', 'tnt_side', 'tnt_top', 'tnt_bottom',
  'crafting_top', 'crafting_side', 'crafting_front', 'bookshelf', 'coarse_dirt', 'door_lower', 'door_upper', 'mossy_cobblestone',
  'stone_bricks', 'wool', 'snow_side',
];
export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, WATER: 6, LOG: 7,
  LEAVES: 8, PLANKS: 9, GLASS: 10, BRICK: 11, GRAVEL: 12, BEDROCK: 13, TALL_GRASS: 14,
  POPPY: 15, DANDELION: 16, SNOW: 17, COAL_ORE: 18, IRON_ORE: 19, TNT: 20, CRAFTING: 21,
  BOOKSHELF: 22, COARSE_DIRT: 23, DOOR_LOWER: 24, DOOR_UPPER: 25, MOSSY_COBBLE: 26,
  STONE_BRICKS: 27, WOOL: 28, SNOWY_GRASS: 29,
};

const cube = (name, tiles, extra = {}) => ({
  name, tiles, render: 'cube', solid: true, opaque: true, hardness: 0.5, ...extra,
});
const all = (t) => ({ top: t, side: t, bottom: t });

/** @type {Array<any>} */
export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'Air', render: 'none', solid: false, opaque: false, hardness: 0 };
BLOCKS[B.GRASS] = cube('Grass Block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, { hardness: 0.45, drop: B.DIRT });
BLOCKS[B.DIRT] = cube('Dirt', all('dirt'), { hardness: 0.4 });
BLOCKS[B.STONE] = cube('Stone', all('stone'), { hardness: 1.1, drop: B.COBBLE });
BLOCKS[B.COBBLE] = cube('Cobblestone', all('cobblestone'), { hardness: 1.2 });
BLOCKS[B.SAND] = cube('Sand', all('sand'), { hardness: 0.4 });
BLOCKS[B.WATER] = { name: 'Water', tiles: all('water'), render: 'water', solid: false, opaque: false, hardness: Infinity, liquid: true };
BLOCKS[B.LOG] = cube('Oak Log', { top: 'log_top', side: 'log_side', bottom: 'log_top' }, { hardness: 0.9 });
BLOCKS[B.LEAVES] = cube('Oak Leaves', all('leaves'), { opaque: false, cutout: true, hardness: 0.15, shadeSky: true, drop: null });
BLOCKS[B.PLANKS] = cube('Oak Planks', all('planks'), { hardness: 0.8 });
BLOCKS[B.GLASS] = cube('Glass', all('glass'), { opaque: false, cutout: true, hardness: 0.2, cullSelf: true, drop: null });
BLOCKS[B.BRICK] = cube('Bricks', all('brick'), { hardness: 1.2 });
BLOCKS[B.GRAVEL] = cube('Gravel', all('gravel'), { hardness: 0.45 });
BLOCKS[B.BEDROCK] = cube('Bedrock', all('bedrock'), { hardness: Infinity });
BLOCKS[B.TALL_GRASS] = { name: 'Grass', tiles: all('tall_grass'), render: 'cross', solid: false, opaque: false, hardness: 0, drop: null, plant: true };
BLOCKS[B.POPPY] = { name: 'Poppy', tiles: all('poppy'), render: 'cross', solid: false, opaque: false, hardness: 0, plant: true };
BLOCKS[B.DANDELION] = { name: 'Dandelion', tiles: all('dandelion'), render: 'cross', solid: false, opaque: false, hardness: 0, plant: true };
BLOCKS[B.SNOW] = cube('Snow Block', all('snow'), { hardness: 0.3 });
BLOCKS[B.COAL_ORE] = cube('Coal Ore', all('coal_ore'), { hardness: 1.4, xp: 2 });
BLOCKS[B.IRON_ORE] = cube('Iron Ore', all('iron_ore'), { hardness: 1.6, xp: 3 });
BLOCKS[B.TNT] = cube('TNT', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom' }, { hardness: 0, explosive: true });
BLOCKS[B.CRAFTING] = cube('Crafting Table', { top: 'crafting_top', side: 'crafting_side', bottom: 'planks', pz: 'crafting_front', nx: 'crafting_front' }, { hardness: 0.9 });
BLOCKS[B.BOOKSHELF] = cube('Bookshelf', { top: 'planks', side: 'bookshelf', bottom: 'planks' }, { hardness: 0.8 });
BLOCKS[B.COARSE_DIRT] = cube('Coarse Dirt', all('coarse_dirt'), { hardness: 0.4 });
BLOCKS[B.DOOR_LOWER] = { name: 'Oak Door', tiles: all('door_lower'), render: 'door', solid: false, opaque: false, hardness: 0.6, drop: null, cutout: true };
BLOCKS[B.DOOR_UPPER] = { name: 'Oak Door', tiles: all('door_upper'), render: 'door', solid: false, opaque: false, hardness: 0.6, drop: null, cutout: true };
BLOCKS[B.MOSSY_COBBLE] = cube('Mossy Cobblestone', all('mossy_cobblestone'), { hardness: 1.2 });
BLOCKS[B.STONE_BRICKS] = cube('Stone Bricks', all('stone_bricks'), { hardness: 1.2 });
BLOCKS[B.WOOL] = cube('White Wool', all('wool'), { hardness: 0.3 });
BLOCKS[B.SNOWY_GRASS] = cube('Snowy Grass', { top: 'snow', side: 'snow_side', bottom: 'dirt' }, { hardness: 0.45, drop: B.DIRT });

export function blockDef(id) {
  return BLOCKS[id] || BLOCKS[B.AIR];
}

/** Tile index for a given block face: face in px,nx,py,ny,pz,nz */
export function faceTile(id, face) {
  const t = BLOCKS[id].tiles;
  const name = t[face] || (face === 'py' ? t.top : face === 'ny' ? t.bottom : t.side);
  return TILE[name];
}

/** Item the player gets for breaking a block (null = nothing). */
export function dropOf(id) {
  const d = BLOCKS[id];
  if (!d) return null;
  if (d.drop === null) return null;
  return d.drop !== undefined ? d.drop : id;
}

// Blocks available in the creative inventory (E).
export const PLACEABLE = [
  B.GRASS, B.DIRT, B.COARSE_DIRT, B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.BRICK,
  B.SAND, B.GRAVEL, B.LOG, B.PLANKS, B.LEAVES, B.GLASS, B.BOOKSHELF, B.CRAFTING,
  B.TNT, B.WOOL, B.SNOW, B.COAL_ORE, B.IRON_ORE, B.BEDROCK, B.TALL_GRASS, B.POPPY, B.DANDELION,
];
