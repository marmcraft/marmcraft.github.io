import { ARMOUR, ARMOUR_SHAPES } from './armor';

/**
 * Crafting (Mineclonia's recipes: `research/mineclonia-spec.md`). A shaped recipe is rows of letters, each letter an
 * item or a group (`#planks`: any planks); it matches wherever it sits in the grid (empty rows and columns round it
 * don't count), and mirrored. A shapeless one is just what's in the grid, anywhere. Smelting and fuels are here too.
 */

export interface Recipe {
  /** Rows of letters (`.` empty); or none, for a shapeless recipe. */
  shape?: string[];
  /** Each letter's item or group. */
  key?: Record<string, string>;
  /** A shapeless recipe's ingredients (items or groups). */
  of?: string[];
  out: string;
  count?: number;
}

/** The groups a recipe may ask for: any of these. */
export const GROUPS: Record<string, (item: string) => boolean> = {
  '#planks': (i) => i.endsWith('_planks'),
  '#log': (i) => i.endsWith('_log'),
  '#cobble': (i) => i === 'cobblestone' || i === 'cobbled_deepslate',
  '#coal': (i) => i === 'coal' || i === 'charcoal',
  '#wool': (i) => i.endsWith('_wool'),
};
const fits = (want: string, item: string) => (want.startsWith('#') ? (GROUPS[want]?.(item) ?? false) : want === item);

const TOOL_SHAPES: Record<string, string[]> = {
  pickaxe: ['MMM', '.S.', '.S.'],
  axe: ['MM', 'MS', '.S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', '.S', '.S'],
};
const TOOL_MATERIALS: Record<string, string> = { wooden: '#planks', stone: '#cobble', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };

/** Nine of an item make its block, and the block makes nine back. */
const STORAGE: [string, string][] = [
  ['iron_ingot', 'iron_block'],
  ['gold_ingot', 'gold_block'],
  ['copper_ingot', 'copper_block'],
  ['diamond', 'diamond_block'],
  ['emerald', 'emerald_block'],
  ['lapis_lazuli', 'lapis_block'],
  ['redstone', 'redstone_block'],
  ['coal', 'coal_block'],
  ['raw_iron', 'raw_iron_block'],
  ['raw_gold', 'raw_gold_block'],
  ['raw_copper', 'raw_copper_block'],
  ['iron_nugget', 'iron_ingot'],
  ['gold_nugget', 'gold_ingot'],
];

export const RECIPES: Recipe[] = [
  // Wood.
  { of: ['oak_log'], out: 'oak_planks', count: 4 },
  { of: ['birch_log'], out: 'birch_planks', count: 4 },
  { of: ['spruce_log'], out: 'spruce_planks', count: 4 },
  { shape: ['P', 'P'], key: { P: '#planks' }, out: 'stick', count: 4 },
  { shape: ['PP', 'PP'], key: { P: '#planks' }, out: 'crafting_table' },
  { shape: ['C', 'S'], key: { C: '#coal', S: 'stick' }, out: 'torch', count: 4 },
  { shape: ['PPP', 'P.P', 'PPP'], key: { P: '#planks' }, out: 'chest' },
  { shape: ['S.S', 'SSS', 'S.S'], key: { S: 'stick' }, out: 'ladder', count: 3 },
  { shape: ['PSP', 'PSP'], key: { P: 'oak_planks', S: 'stick' }, out: 'oak_fence', count: 3 },
  { shape: ['PSP', 'PSP'], key: { P: 'spruce_planks', S: 'stick' }, out: 'spruce_fence', count: 3 },
  { shape: ['SPS', 'SPS'], key: { P: 'oak_planks', S: 'stick' }, out: 'oak_fence_gate' },
  { shape: ['PP', 'PP', 'PP'], key: { P: 'oak_planks' }, out: 'oak_door', count: 3 },
  { shape: ['PPP', 'PPP'], key: { P: 'oak_planks' }, out: 'oak_trapdoor', count: 2 },
  { shape: ['PP'], key: { P: 'oak_planks' }, out: 'oak_pressure_plate' },
  { shape: ['PPP', 'BBB', 'PPP'], key: { P: '#planks', B: 'book' }, out: 'bookshelf' },
  { shape: ['WWW', 'PPP'], key: { W: 'red_wool', P: '#planks' }, out: 'red_bed' },
  // Stone.
  { shape: ['CCC', 'C.C', 'CCC'], key: { C: '#cobble' }, out: 'furnace' },
  { shape: ['SS', 'SS'], key: { S: 'stone' }, out: 'stone_bricks', count: 4 },
  { shape: ['SSS'], key: { S: 'stone' }, out: 'stone_slab', count: 6 },
  { shape: ['SSS'], key: { S: 'cobblestone' }, out: 'cobblestone_slab', count: 6 },
  { shape: ['S..', 'SS.', 'SSS'], key: { S: 'cobblestone' }, out: 'cobblestone_stairs', count: 4 },
  { shape: ['SSS'], key: { S: 'oak_planks' }, out: 'oak_slab', count: 6 },
  { shape: ['S..', 'SS.', 'SSS'], key: { S: 'oak_planks' }, out: 'oak_stairs', count: 4 },
  { shape: ['SSS', 'SSS'], key: { S: 'cobblestone' }, out: 'cobblestone_wall', count: 6 },
  { of: ['stone'], out: 'stone_button' },
  { shape: ['SS', 'SS'], key: { S: 'sand' }, out: 'sandstone' },
  { shape: ['BB', 'BB'], key: { B: 'brick' }, out: 'bricks' },
  { shape: ['CC', 'CC'], key: { C: 'clay_ball' }, out: 'clay' },
  { shape: ['SS', 'SS'], key: { S: 'snowball' }, out: 'snow_block' },
  { shape: ['GG', 'GG'], key: { G: 'glowstone_dust' }, out: 'glowstone' },
  { shape: ['GGG', 'GGG'], key: { G: 'glass' }, out: 'glass_pane', count: 16 },
  { of: ['cobblestone', 'vine'], out: 'mossy_cobblestone' },
  // Metal.
  { shape: ['III', 'III'], key: { I: 'iron_ingot' }, out: 'iron_bars', count: 16 },
  { shape: ['I.I', 'ISI', 'I.I'], key: { I: 'iron_ingot', S: 'stick' }, out: 'rail', count: 16 },
  { shape: ['NNN', 'NTN', 'NNN'], key: { N: 'iron_nugget', T: 'torch' }, out: 'lantern' },
  { shape: ['I.I', '.I.'], key: { I: 'iron_ingot' }, out: 'bucket' },
  { of: ['iron_ingot', 'flint'], out: 'flint_and_steel' },
  { shape: ['BB', 'BB'], key: { B: 'nether_brick' }, out: 'nether_bricks' },
  { shape: ['QQ', 'QQ'], key: { Q: 'quartz' }, out: 'quartz_block' },
  // (Minecraft's is a blaze's powder and an enderman's pearl; there are no mobs yet, so an emerald from the
  // overworld and quartz and glowstone from the Nether stand in.)
  { of: ['emerald', 'quartz', 'glowstone_dust'], out: 'eye_of_ender' },
  { shape: ['B.B', '.B.'], key: { B: 'brick' }, out: 'flower_pot' },
  { shape: ['GGG', 'GAG', 'GGG'], key: { G: 'gold_ingot', A: 'apple' }, out: 'golden_apple' },
  // Wool to carpet.
  { shape: ['WW'], key: { W: 'white_wool' }, out: 'white_carpet', count: 3 },
  { shape: ['WW'], key: { W: 'red_wool' }, out: 'red_carpet', count: 3 },
];
for (const [kind, shape] of Object.entries(TOOL_SHAPES)) {
  for (const [material, m] of Object.entries(TOOL_MATERIALS)) RECIPES.push({ shape, key: { M: m, S: 'stick' }, out: `${material}_${kind}` });
}
// Armour: each piece of each material (Minecraft's shapes).
for (const [material, m] of Object.entries(ARMOUR)) {
  for (const [piece, shape] of Object.entries(ARMOUR_SHAPES)) RECIPES.push({ shape, key: { M: m.of }, out: `${material}_${piece}` });
}
for (const [small, block] of STORAGE) {
  RECIPES.push({ shape: ['XXX', 'XXX', 'XXX'], key: { X: small }, out: block });
  // (Nuggets come back out of an ingot; an ingot isn't a block.)
  RECIPES.push({ of: [block], out: small, count: 9 });
}

/** A grid's items (`size` across, row by row; null empty). */
type Grid = (string | null)[];

/** The grid trimmed to what's in it: its rows and size. */
function trim(grid: Grid, size: number): { rows: (string | null)[][]; w: number; h: number } {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (grid[y * size + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const rows: (string | null)[][] = [];
  for (let y = y0; y <= y1; y++) rows.push(grid.slice(y * size + x0, y * size + x1 + 1));
  return { rows, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function shapedFits(r: Recipe, rows: (string | null)[][], w: number, h: number, mirror: boolean): boolean {
  const shape = r.shape!;
  if (shape.length !== h || shape[0].length !== w) return false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = shape[y][mirror ? w - 1 - x : x];
      const item = rows[y][x];
      if (c === '.' ? item !== null : !item || !fits(r.key![c], item)) return false;
    }
  return true;
}

function shapelessFits(r: Recipe, items: string[]): boolean {
  if (items.length !== r.of!.length) return false;
  const left = [...items];
  for (const want of r.of!) {
    const k = left.findIndex((i) => fits(want, i));
    if (k < 0) return false;
    left.splice(k, 1);
  }
  return true;
}

/** What a crafting grid makes (`size` 2 or 3), or null. Recipes asking for items the game hasn't are skipped. */
export function craft(grid: Grid, size: number, known: (item: string) => boolean): { item: string; count: number } | null {
  const items = grid.filter((i): i is string => !!i);
  if (!items.length) return null;
  const { rows, w, h } = trim(grid, size);
  for (const r of RECIPES) {
    if (!known(r.out)) continue;
    const ok = r.shape ? shapedFits(r, rows, w, h, false) || shapedFits(r, rows, w, h, true) : shapelessFits(r, items);
    if (ok) return { item: r.out, count: r.count ?? 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- the furnace

/** What smelts into what. */
export const SMELTING: Record<string, string> = {
  raw_iron: 'iron_ingot',
  raw_gold: 'gold_ingot',
  raw_copper: 'copper_ingot',
  iron_ore: 'iron_ingot',
  gold_ore: 'gold_ingot',
  copper_ore: 'copper_ingot',
  deepslate_iron_ore: 'iron_ingot',
  deepslate_gold_ore: 'gold_ingot',
  deepslate_copper_ore: 'copper_ingot',
  sand: 'glass',
  cobblestone: 'stone',
  cobbled_deepslate: 'deepslate',
  stone: 'smooth_stone',
  clay_ball: 'brick',
  netherrack: 'nether_brick',
  nether_quartz_ore: 'quartz',
  oak_log: 'charcoal',
  birch_log: 'charcoal',
  spruce_log: 'charcoal',
};

/** Seconds to smelt one. */
export const COOK_TIME = 10;

/** How long an item burns, in seconds (0: not a fuel). */
export function fuelTime(item: string): number {
  if (item === 'coal_block') return 800;
  if (item === 'lava_bucket') return 1000;
  if (item === 'coal' || item === 'charcoal') return 80;
  if (/(_log|_planks|_fence|_fence_gate|_stairs|_trapdoor|_door|_beam|_table)$/.test(item) || item === 'crafting_table' || item === 'chest' || item === 'ladder' || item === 'bookshelf') {
    return /^(stone|cobblestone|brick|stone_brick|sandstone)_/.test(item) ? 0 : 15;
  }
  if (/^(oak|spruce|birch)_slab$/.test(item)) return 7.5;
  if (/^wooden_/.test(item)) return 10;
  if (item === 'stick' || item.endsWith('_wool') || item.endsWith('_carpet')) return 5;
  return 0;
}
