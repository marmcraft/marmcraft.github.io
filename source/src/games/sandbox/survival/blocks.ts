import type { BlockDefinition, BlockTexture } from '@platform';

/**
 * Survival's blocks: how each is mined and what it drops (Mineclonia's numbers: `research/mineclonia-spec.md`), and
 * the blocks survival needs that the world hadn't (a crafting table, a furnace, the ores and metal blocks it lacked),
 * painted here as Sandbox's other blocks are.
 */

/** Which tool mines it fastest. */
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword';

/** One stack a block drops. */
export interface Drop {
  item: string;
  count: number;
}

export interface BlockRule {
  /** Minecraft's hardness: seconds to mine it are `hardness / speed`, ×1.5 when it drops, ×5 when it doesn't. */
  hardness: number;
  /** The tool that mines it fast (none: a hand's as good as anything). */
  tool: ToolType | null;
  /**
   * The least pickaxe that gets anything from it (wood 1, gold 2, stone 3, iron 4, diamond 5); 0: anything, a bare
   * hand too. Mined with less, it breaks (slowly) and drops nothing.
   */
  level: number;
  /** It drops only to its own tool (snow's snowballs need a shovel), though anything mines it. */
  needsTool?: boolean;
  /** What it drops (default: itself), rolled each time. */
  drops?(rand: () => number): Drop[];
}

const between = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const one = (item: string, count = 1) => () => [{ item, count }];
const nothing = () => [];

/** An ore: hardness 3, a pickaxe of `level`, and what it gives (`count` a fixed number, or a range). */
const ore = (level: number, item: string, lo = 1, hi = lo, hardness = 3): BlockRule => ({ hardness, tool: 'pickaxe', level, drops: (r) => [{ item, count: between(r, lo, hi) }] });

/** The rules for blocks by name (the built-in ones and the new ones; the game's others are worked out below). */
const RULES: Record<string, BlockRule> = {
  stone: { hardness: 1.5, tool: 'pickaxe', level: 1, drops: one('cobblestone') },
  cobblestone: { hardness: 2, tool: 'pickaxe', level: 1 },
  mossy_cobblestone: { hardness: 2, tool: 'pickaxe', level: 1 },
  stone_bricks: { hardness: 1.5, tool: 'pickaxe', level: 1 },
  bricks: { hardness: 2, tool: 'pickaxe', level: 1 },
  granite: { hardness: 1.5, tool: 'pickaxe', level: 1 },
  diorite: { hardness: 1.5, tool: 'pickaxe', level: 1 },
  andesite: { hardness: 1.5, tool: 'pickaxe', level: 1 },
  sandstone: { hardness: 0.8, tool: 'pickaxe', level: 1 },
  smooth_stone: { hardness: 2, tool: 'pickaxe', level: 1 },
  deepslate: { hardness: 3, tool: 'pickaxe', level: 1, drops: one('cobbled_deepslate') },
  cobbled_deepslate: { hardness: 3.5, tool: 'pickaxe', level: 1 },
  end_stone: { hardness: 3, tool: 'pickaxe', level: 1 },
  obsidian: { hardness: 50, tool: 'pickaxe', level: 5 },
  dirt: { hardness: 0.5, tool: 'shovel', level: 0 },
  podzol: { hardness: 0.5, tool: 'shovel', level: 0, drops: one('dirt') },
  grass_block: { hardness: 0.6, tool: 'shovel', level: 0, drops: one('dirt') },
  snowy_grass: { hardness: 0.6, tool: 'shovel', level: 0, drops: one('dirt') },
  sand: { hardness: 0.5, tool: 'shovel', level: 0 },
  gravel: { hardness: 0.6, tool: 'shovel', level: 0, drops: (r) => [{ item: r() < 0.1 ? 'flint' : 'gravel', count: 1 }] },
  clay: { hardness: 0.6, tool: 'shovel', level: 0, drops: one('clay_ball', 4) },
  // Snow drops snowballs only to a shovel (a hand gets nothing).
  snow_block: { hardness: 0.2, tool: 'shovel', level: 0, needsTool: true, drops: one('snowball', 4) },
  snow_layer: { hardness: 0.1, tool: 'shovel', level: 0, needsTool: true, drops: one('snowball') },
  ice: { hardness: 0.5, tool: 'pickaxe', level: 0, drops: nothing },
  glass: { hardness: 0.3, tool: null, level: 0, drops: nothing },
  glass_pane: { hardness: 0.3, tool: null, level: 0, drops: nothing },
  glowstone: { hardness: 0.3, tool: null, level: 0, drops: (r) => [{ item: 'glowstone_dust', count: between(r, 2, 4) }] },
  sea_lantern: { hardness: 0.3, tool: null, level: 0 },
  cactus: { hardness: 0.4, tool: null, level: 0 },
  bookshelf: { hardness: 1.5, tool: 'axe', level: 0 },
  crafting_table: { hardness: 2.5, tool: 'axe', level: 0 },
  chest: { hardness: 2.5, tool: 'axe', level: 0 },
  furnace: { hardness: 3.5, tool: 'pickaxe', level: 1 },
  furnace_lit: { hardness: 3.5, tool: 'pickaxe', level: 1, drops: one('furnace') },
  // The ores, and where each needs a better pickaxe.
  coal_ore: ore(1, 'coal'),
  copper_ore: ore(3, 'raw_copper', 2, 5),
  iron_ore: ore(3, 'raw_iron'),
  lapis_ore: ore(3, 'lapis_lazuli', 4, 9),
  gold_ore: ore(4, 'raw_gold'),
  redstone_ore: ore(4, 'redstone', 4, 5),
  diamond_ore: ore(4, 'diamond'),
  emerald_ore: ore(4, 'emerald'),
  // The metal and gem blocks.
  coal_block: { hardness: 5, tool: 'pickaxe', level: 1 },
  iron_block: { hardness: 5, tool: 'pickaxe', level: 3 },
  copper_block: { hardness: 3, tool: 'pickaxe', level: 3 },
  lapis_block: { hardness: 3, tool: 'pickaxe', level: 3 },
  gold_block: { hardness: 3, tool: 'pickaxe', level: 4 },
  redstone_block: { hardness: 5, tool: 'pickaxe', level: 1 },
  diamond_block: { hardness: 5, tool: 'pickaxe', level: 4 },
  emerald_block: { hardness: 5, tool: 'pickaxe', level: 4 },
  raw_iron_block: { hardness: 5, tool: 'pickaxe', level: 3 },
  raw_copper_block: { hardness: 5, tool: 'pickaxe', level: 3 },
  raw_gold_block: { hardness: 5, tool: 'pickaxe', level: 4 },
  bedrock: { hardness: Infinity, tool: null, level: 0, drops: nothing },
  // The Nether's.
  netherrack: { hardness: 0.4, tool: 'pickaxe', level: 1 },
  soul_sand: { hardness: 0.5, tool: 'shovel', level: 0 },
  nether_quartz_ore: ore(1, 'quartz'),
  nether_bricks: { hardness: 2, tool: 'pickaxe', level: 1 },
  quartz_block: { hardness: 0.8, tool: 'pickaxe', level: 1 },
  nether_portal: { hardness: Infinity, tool: null, level: 0, drops: nothing },
  // The End's (its frames don't break, as Minecraft's in survival).
  end_portal_frame: { hardness: Infinity, tool: null, level: 0, drops: nothing },
  end_portal_frame_filled: { hardness: Infinity, tool: null, level: 0, drops: nothing },
  end_portal: { hardness: Infinity, tool: null, level: 0, drops: nothing },
};
// Deepslate's ores: as stone's, a little harder.
for (const name of ['coal', 'copper', 'iron', 'lapis', 'gold', 'redstone', 'diamond', 'emerald']) RULES[`deepslate_${name}_ore`] = { ...RULES[`${name}_ore`], hardness: 4.5 };

/** Planks, logs and things of wood: an axe's. */
const WOODEN = /(planks|_log|_slab|_stairs|_fence|_fence_gate|_door|_door_top|_trapdoor|_table|_beam|_pressure_plate)$/;
const STONY = /^(stone|cobblestone|stone_brick|brick|sandstone|mossy_cobblestone)_(slab|stairs|wall)$|_concrete$|^iron_bars$|^stone_button$|^lantern$/;

/**
 * How a block is mined and what it drops: its rule, else worked out from what it's called and what it is (a plant
 * breaks at a touch, a wooden thing is an axe's, a stone one a pickaxe's, leaves drop saplings now and then).
 */
export function blockRule(name: string, info: { plant: boolean; hardness?: number } | null): BlockRule {
  const rule = RULES[name];
  if (rule) return rule;
  if (info?.plant) {
    // Grass and ferns drop nothing (no seeds yet); flowers, mushrooms, torches themselves.
    if (name === 'short_grass' || name === 'fern' || name === 'dead_bush') return { hardness: 0, tool: null, level: 0, drops: nothing };
    return { hardness: 0, tool: null, level: 0 };
  }
  if (name.endsWith('_leaves')) {
    return {
      hardness: 0.2,
      tool: 'hoe',
      level: 0,
      drops: (r) => {
        const out: Drop[] = [];
        if (r() < 1 / 50) out.push({ item: 'stick', count: r() < 0.5 ? 1 : 2 });
        if (name === 'oak_leaves' && r() < 1 / 200) out.push({ item: 'apple', count: 1 });
        return out;
      },
    };
  }
  if (name.endsWith('_wool') || name.endsWith('_carpet')) return { hardness: name.endsWith('_wool') ? 0.8 : 0.1, tool: null, level: 0 };
  if (name.endsWith('_bed')) return { hardness: 0.2, tool: null, level: 0 };
  if (name.startsWith('neon_')) return { hardness: 0.3, tool: null, level: 0 };
  if (name.endsWith('_concrete')) return { hardness: 1.8, tool: 'pickaxe', level: 1 };
  if (STONY.test(name)) return { hardness: 2, tool: 'pickaxe', level: 1 };
  if (WOODEN.test(name)) return { hardness: 2, tool: 'axe', level: 0 };
  // Anything else: as hard as the game made it, any tool, itself.
  return { hardness: info?.hardness ?? 1, tool: null, level: 0 };
}

/** A tool as mining reads it. */
export interface ToolStats {
  type: ToolType;
  level: number;
  speed: number;
}

/**
 * Seconds to mine a block with a tool (or a bare hand), Mineclonia's way: `hardness / speed`, ×1.5 if it'll drop,
 * ×5 if not, rounded up to a twentieth; nearly nothing breaks at once. And whether it drops.
 */
export function digTime(rule: BlockRule, tool: ToolStats | null): { time: number; drops: boolean } {
  if (!Number.isFinite(rule.hardness)) return { time: Infinity, drops: false };
  const right = !!tool && !!rule.tool && tool.type === rule.tool;
  // (A sword cuts through cobwebs and leaves faster; it's no pickaxe.)
  const speed = right ? tool!.speed : tool?.type === 'sword' && (rule.tool === 'hoe' || rule.tool === null) ? 1.5 : 1;
  const drops = rule.level === 0 ? !rule.needsTool || right : right && tool!.level >= rule.level;
  let t = (rule.hardness / speed) * (drops ? 1.5 : 5);
  if (t <= 0.05) return { time: 0, drops };
  t = Math.ceil(t * 20 - 1e-9) / 20;
  return { time: t, drops };
}

// ---------------------------------------------------------------------------------------------- the new blocks

/** A cheap repeatable hash of a texel (so a block's speckles are the same everywhere). */
const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = (c: string[], x: number, y: number, seed: number) => c[Math.floor(hash(x, y, seed) * c.length)];

const STONE_GREYS = ['#7d7d7d', '#858585', '#747474', '#8c8c8c'];
const DEEPSLATE_GREYS = ['#4d4d52', '#45454a', '#55555a', '#3d3d42'];

/** An ore: speckles of its colour in clumps on stone (or deepslate). */
const oreTexture = (base: string[], colours: string[], seed: number): BlockTexture => ({
  paint: (x, y) => {
    // Four clumps, each a few texels round a centre.
    const clumps: [number, number][] = [[3, 3], [11, 4], [5, 11], [12, 12]];
    for (const [cx, cy] of clumps) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= 2 + hash(cx, cy, seed) * 2 && hash(x, y, seed + 7) > 0.25) return pick(colours, x, y, seed);
    }
    return pick(base, x, y, seed + 3);
  },
});

/** A block of metal or gem: its colour, with a bevelled rim (light top-left, dark bottom-right). */
const metalBlock = (light: string, mid: string, dark: string): BlockTexture => ({
  paint: (x, y) => (x === 0 || y === 0 ? light : x === 15 || y === 15 ? dark : (x + y) % 9 === 0 ? light : mid),
});
/** A block of raw ore: lumpy. */
const rawBlock = (colours: string[], seed: number): BlockTexture => ({ paint: (x, y) => pick(colours, x >> 1, y >> 1, seed) });

const PLANK = ['#a8834d', '#9c7843', '#b28b55'];
const planks = (x: number, y: number) => (y % 4 === 3 ? '#6b4f2a' : pick(PLANK, x >> 2, y, 11));
/** A crafting table: a grid of tools on top, tools hung on its sides. */
const TABLE_TOP: BlockTexture = {
  paint: (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? '#5a3f1f' : x === 5 || x === 10 || y === 5 || y === 10 ? '#4a3318' : pick(['#b8925a', '#ad874f'], x, y, 3)),
};
const TABLE_SIDE: BlockTexture = {
  paint: (x, y) => {
    if (y < 3) return y === 2 ? '#4a3318' : '#a07a46';
    // A saw (left) and a hammer (right) hung on the side.
    if (x >= 2 && x <= 6 && y >= 5 && y <= 11) return y === 5 || x === 2 ? '#c8c8c8' : (x + y) % 2 ? '#9a9a9a' : planks(x, y);
    if (x >= 10 && x <= 13 && y >= 5 && y <= 6) return '#8a8a8a';
    if (x === 11 && y >= 7 && y <= 13) return '#6b4f2a';
    return planks(x, y);
  },
};
const COBBLE = ['#7a7a7a', '#6a6a6a', '#8a8a8a', '#5a5a5a'];
const furnaceSide = (x: number, y: number) => (x === 0 || y === 0 || x === 15 || y === 15 ? '#4a4a4a' : pick(COBBLE, x >> 1, y >> 1, 5));
/** A furnace's front: its mouth dark, or (lit) aflame. */
const furnaceFront = (lit: boolean): BlockTexture => ({
  paint: (x, y) => {
    if (x >= 3 && x <= 12 && y >= 8 && y <= 13) {
      if (!lit) return y === 8 ? '#2a2a2a' : '#151515';
      // Flames: brighter low down, flickering up.
      const h = hash(x, y, 9);
      return y >= 11 ? (h > 0.4 ? '#ffd23a' : '#ff9a1a') : h > 0.55 ? '#ff7a10' : y === 8 ? '#2a2a2a' : '#5a1a05';
    }
    if (x >= 3 && x <= 12 && y >= 3 && y <= 5) return y === 4 ? '#2e2e2e' : '#3e3e3e';
    return furnaceSide(x, y);
  },
});
const FURNACE_TOP: BlockTexture = { paint: (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? '#5a5a5a' : pick(['#8a8a8a', '#7e7e7e', '#969696'], x, y, 13)) };
const SMOOTH_STONE: BlockTexture = { paint: (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? '#8a8a8a' : pick(['#a4a4a4', '#9e9e9e', '#aaaaaa'], x, y, 17)) };

const ORE_COLOURS: Record<string, string[]> = {
  coal: ['#1c1c1c', '#2e2e2e'],
  copper: ['#e2814f', '#4fa88a', '#c96a45'],
  iron: ['#d8af93', '#e8c9ad', '#b8906e'],
  gold: ['#fbe46a', '#f2c41a'],
  redstone: ['#ff2a1a', '#a8100a'],
  lapis: ['#2d4fd4', '#1a2c88'],
  diamond: ['#7af0e2', '#3ad8c8'],
  emerald: ['#3fe07a', '#16904a'],
};

/** The blocks survival adds to the world's (Sandbox's own, in the creative picker too; a lit furnace isn't). */
export function survivalBlocks(): Record<string, BlockDefinition> {
  const b: Record<string, BlockDefinition> = {};
  b.crafting_table = { texture: { top: TABLE_TOP, bottom: 'oak_planks', side: TABLE_SIDE }, hardness: 2.5 };
  b.furnace = { texture: { top: FURNACE_TOP, bottom: FURNACE_TOP, side: { paint: furnaceSide }, front: furnaceFront(false) }, facing: true, hardness: 3.5 };
  b.furnace_lit = { label: 'Furnace (Lit)', texture: { top: FURNACE_TOP, bottom: FURNACE_TOP, side: { paint: furnaceSide }, front: furnaceFront(true) }, facing: true, light: 13, hardness: 3.5, picker: false };
  b.smooth_stone = { texture: SMOOTH_STONE, hardness: 2 };
  b.cobbled_deepslate = { texture: { paint: (x, y) => (hash(x >> 1, y >> 1, 21) < 0.2 ? '#2e2e33' : pick(DEEPSLATE_GREYS, x >> 1, y >> 1, 23)) }, hardness: 3.5 };
  // Ores the world lacked, and deepslate's.
  b.copper_ore = { texture: oreTexture(STONE_GREYS, ORE_COLOURS.copper, 31), hardness: 3 };
  b.emerald_ore = { texture: oreTexture(STONE_GREYS, ORE_COLOURS.emerald, 37), hardness: 3 };
  for (const [name, colours] of Object.entries(ORE_COLOURS)) b[`deepslate_${name}_ore`] = { texture: oreTexture(DEEPSLATE_GREYS, colours, 41 + name.length), hardness: 4.5 };
  // Blocks of what's mined.
  b.coal_block = { texture: metalBlock('#3a3a3a', '#1e1e1e', '#0a0a0a'), hardness: 5 };
  b.gold_block = { texture: metalBlock('#fffbb0', '#fbe46a', '#c9a11c'), hardness: 3 };
  b.copper_block = { texture: metalBlock('#ffc39a', '#e2814f', '#a8522c'), hardness: 3 };
  b.diamond_block = { texture: metalBlock('#d8fff9', '#7af0e2', '#1d9a90'), hardness: 5 };
  b.emerald_block = { texture: metalBlock('#c8ffd5', '#3fe07a', '#16904a'), hardness: 5 };
  b.lapis_block = { texture: metalBlock('#8aa8ff', '#2d4fd4', '#1a2c88'), hardness: 3 };
  b.redstone_block = { texture: metalBlock('#ff6a5a', '#d4180c', '#8a0c05'), hardness: 5 };
  b.raw_iron_block = { texture: rawBlock(['#c39a7a', '#d8af93', '#a87e60'], 51), hardness: 5 };
  b.raw_gold_block = { texture: rawBlock(['#e6b72b', '#fbe46a', '#c9971a'], 53), hardness: 5 };
  b.raw_copper_block = { texture: rawBlock(['#c96a45', '#e2814f', '#a8522c'], 57), hardness: 5 };
  // The Nether's: rock, soul sand, quartz, its bricks, and the portal (a sheet of purple, facing along x or z).
  b.netherrack = { texture: { paint: (x, y) => pick(['#6f3434', '#7a3a3a', '#612c2c', '#854242', '#552424'], x, y >> (hash(x, 0, 61) < 0.5 ? 0 : 1), 63) }, hardness: 0.4 };
  b.soul_sand = { texture: { paint: (x, y) => ((x % 8 === 2 || x % 8 === 5) && y % 6 === 3 ? '#2a1d14' : pick(['#5b4535', '#513d2e', '#664e3c', '#47362a'], x, y, 67)) }, hardness: 0.5 };
  b.nether_quartz_ore = { texture: oreTexture(['#6f3434', '#7a3a3a', '#612c2c', '#854242'], ['#efe9e0', '#d8cfc2'], 71), hardness: 3 };
  b.nether_bricks = { texture: { paint: (x, y) => (y % 8 === 7 || (y % 16 < 8 ? x % 8 === 7 : (x + 4) % 8 === 7) ? '#1c0c0f' : pick(['#4a2128', '#40191f', '#55262e'], x, y, 73)) }, hardness: 2 };
  b.quartz_block = { texture: { paint: (x, y) => pick(['#ece6dc', '#e6dfd3', '#f2ede5'], x, y, 79) }, hardness: 0.8 };
  b.nether_portal = {
    label: 'Nether Portal',
    texture: { paint: (x, y) => pick(['#5b0fb5', '#7a1ed6', '#4a0a9a', '#9a3cf0', '#6614c4'], x, (y + (x >> 2)) >> 1, 83) },
    boxes: [[0, 0, 6, 16, 16, 10]],
    facing: true,
    transparency: 'transparent',
    solid: false,
    light: 11,
    glow: 0.9,
    breakable: false,
    picker: false,
  };
  // The End portal's frame (an eye's socket on top; filled, the eye in it), and the portal itself: a sheet of
  // starry black low in its cell, lighting all round it.
  const frameSide: BlockTexture = { paint: (x, y) => (y < 3 ? pick(['#3f6e5a', '#2f5a48', '#4a7e68'], x, y, 89) : pick(['#dcdcaa', '#cfcf98', '#e6e6ba', '#c4c48c'], x, y, 97)) };
  const frameTop = (eye: boolean): BlockTexture => ({
    paint: (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 3.5) return eye ? (d < 1.6 ? '#0b2e1e' : '#2fae6e') : '#1b3a30';
      if (d < 4.5) return '#3f6e5a';
      return pick(['#6aa08a', '#5a8e78', '#4f8068'], x, y, 101);
    },
  });
  b.end_portal_frame = { label: 'End Portal Frame', texture: { top: frameTop(false), bottom: 'end_stone', side: frameSide }, boxes: [[0, 0, 0, 16, 13, 16]], breakable: false, light: 1 };
  b.end_portal_frame_filled = { label: 'End Portal Frame (Eye)', texture: { top: frameTop(true), bottom: 'end_stone', side: frameSide }, boxes: [[0, 0, 0, 16, 13, 16]], breakable: false, light: 1, picker: false };
  b.end_portal = {
    label: 'End Portal',
    texture: { paint: (x, y) => (hash(x, y, 103) < 0.06 ? pick(['#9ff0d8', '#d8f8ff', '#6fd0ff'], x, y, 107) : pick(['#06080c', '#0a0d14', '#0c1018'], x, y, 109)) },
    boxes: [[0, 11, 0, 16, 12, 16]],
    solid: false,
    light: 15,
    glow: 0.4,
    breakable: false,
    picker: false,
  };
  return b;
}
