import type { GameContext } from '@platform';
import { ITEM_ART, paintItems } from './art.shared';
import { ATLAS, NO_ITEM } from './looks.shared';
import type { ToolStats, ToolType } from './blocks';

/**
 * Survival's items: the tools (five kinds in five materials, Mineclonia's levels, speeds and uses), what's mined and
 * smelted (coal, raw iron, ingots, gems…), and an item for every block that can be placed (named as the block).
 */

/** Each material's pickaxe level, mining speed and uses (`research/mineclonia-spec.md`). */
export const MATERIALS: Record<string, { level: number; speed: number; uses: number; label: string }> = {
  wooden: { level: 1, speed: 2, uses: 60, label: 'Wooden' },
  stone: { level: 3, speed: 4, uses: 132, label: 'Stone' },
  iron: { level: 4, speed: 6, uses: 251, label: 'Iron' },
  golden: { level: 2, speed: 12, uses: 33, label: 'Golden' },
  diamond: { level: 5, speed: 8, uses: 1562, label: 'Diamond' },
};
export const TOOL_KINDS: ToolType[] = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];

/** What a tool's item is to mining (null for anything else). */
export function toolStats(item: string | undefined | null): ToolStats | null {
  if (!item) return null;
  const k = item.lastIndexOf('_');
  const material = MATERIALS[item.slice(0, k)];
  const type = item.slice(k + 1) as ToolType;
  if (!material || !TOOL_KINDS.includes(type)) return null;
  return { type, level: material.level, speed: material.speed };
}

/** Flint and steel's uses (Minecraft's 65 lights). */
export const FLINT_USES = 65;

/** A tool's uses before it breaks (undefined: not a tool). */
export const usesOf = (item: string) => (item === 'flint_and_steel' ? FLINT_USES : MATERIALS[item.slice(0, item.lastIndexOf('_'))]?.uses);

/** What isn't a block or a tool: its name for players. */
const MATERIAL_NAMES: Record<string, string> = {
  stick: 'Stick',
  coal: 'Coal',
  charcoal: 'Charcoal',
  raw_iron: 'Raw Iron',
  raw_gold: 'Raw Gold',
  raw_copper: 'Raw Copper',
  iron_ingot: 'Iron Ingot',
  gold_ingot: 'Gold Ingot',
  copper_ingot: 'Copper Ingot',
  diamond: 'Diamond',
  emerald: 'Emerald',
  lapis_lazuli: 'Lapis Lazuli',
  redstone: 'Redstone Dust',
  glowstone_dust: 'Glowstone Dust',
  flint: 'Flint',
  iron_nugget: 'Iron Nugget',
  gold_nugget: 'Gold Nugget',
  clay_ball: 'Clay Ball',
  snowball: 'Snowball',
  brick: 'Brick',
  apple: 'Apple',
  quartz: 'Nether Quartz',
  nether_brick: 'Nether Brick',
  eye_of_ender: 'Eye of Ender',
  rotten_flesh: 'Rotten Flesh',
  bone: 'Bone',
  string: 'String',
  gunpowder: 'Gunpowder',
  bucket: 'Bucket',
  water_bucket: 'Water Bucket',
  lava_bucket: 'Lava Bucket',
};
/** These stack to 16 (Minecraft's), and these not at all. */
const SIXTEENS = new Set(['snowball', 'bucket']);
const SINGLES = new Set(['water_bucket', 'lava_bucket']);

/**
 * Define every survival item, once, in the game's `setup`: the pictures painted into their atlas, the tools and
 * materials, and an item for each block (so mined blocks can be carried and placed). Returns the block items' names.
 */
export function defineItems(game: GameContext): Set<string> {
  const painted = paintItems();
  game.items.atlas(ATLAS, { width: painted.width, height: painted.height, pixels: painted.pixels });
  for (const name of Object.keys(ITEM_ART)) {
    if (game.items.get(name)) continue;
    const tool = toolStats(name);
    if (name === 'flint_and_steel') {
      game.items.define(name, { kind: 'tool', name: 'Flint and Steel', stack: 1, uses: FLINT_USES });
    } else if (tool) {
      const m = MATERIALS[name.slice(0, name.lastIndexOf('_'))];
      game.items.define(name, { kind: 'tool', name: `${m.label} ${tool.type.charAt(0).toUpperCase()}${tool.type.slice(1)}`, stack: 1, uses: m.uses });
    } else {
      game.items.define(name, { kind: 'material', name: MATERIAL_NAMES[name] ?? name, ...(SIXTEENS.has(name) && { stack: 16 }), ...(SINGLES.has(name) && { stack: 1 }) });
    }
  }
  // A block's item: every block the world has (by name), as the block.
  const blocks = new Set<string>();
  for (let id = 1; id < 65535; id++) {
    const info = game.world.blockInfo(id);
    if (!info) break;
    if (NO_ITEM.has(info.name) || blocks.has(info.name) || info.liquid) continue;
    blocks.add(info.name);
    if (!game.items.get(info.name)) game.items.define(info.name, { kind: 'block', name: info.label });
  }
  return blocks;
}
