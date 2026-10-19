import { ITEM_ART } from './art.shared';

/**
 * How survival's items look on each screen (the server says only what they are): the painted pictures, where each
 * is in the atlas the server sends (`survival_items`), and each block's item as the block.
 */

/** The atlas the item pictures are in (the server paints it: `items.ts`). */
export const ATLAS = 'survival_items';

/** Where each picture is in the atlas: sixteen to a row, in the order they're listed (`art.ts`). */
export function itemCells(): Map<string, { x: number; y: number }> {
  return new Map(Object.keys(ITEM_ART).map((name, k) => [name, { x: (k % 16) * 16, y: Math.floor(k / 16) * 16 }]));
}

/** The world's own blocks that are carried as items (the engine's; not air, liquids or bedrock). */
const BUILT_IN = (
  'stone grass_block dirt cobblestone oak_planks sand gravel oak_log oak_leaves glass sandstone snow_block ice coal_ore iron_ore gold_ore ' +
  'diamond_ore redstone_ore lapis_ore birch_log birch_leaves spruce_log spruce_leaves cactus short_grass fern dandelion poppy cornflower ' +
  'dead_bush glowstone bricks stone_bricks mossy_cobblestone clay snowy_grass obsidian bookshelf granite diorite andesite deepslate podzol ' +
  'white_wool red_wool yellow_wool green_wool blue_wool black_wool sea_lantern spruce_planks birch_planks brown_mushroom red_mushroom ' +
  'white_concrete light_gray_concrete gray_concrete black_concrete red_concrete iron_block end_stone orange_concrete magenta_concrete ' +
  'light_blue_concrete yellow_concrete lime_concrete pink_concrete cyan_concrete purple_concrete blue_concrete brown_concrete green_concrete ' +
  'neon_red neon_pink neon_cyan neon_yellow torch red_bed blue_bed green_bed yellow_bed ' +
  'stone_slab cobblestone_slab oak_slab spruce_slab birch_slab stone_brick_slab brick_slab sandstone_slab ' +
  'oak_stairs spruce_stairs birch_stairs cobblestone_stairs stone_brick_stairs brick_stairs'
).split(' ');

/** Blocks with no item: what can't be held (air, liquids, bedrock) or is another's state (a lit furnace). */
export const NO_ITEM = new Set(['air', 'water', 'lava', 'bedrock', 'furnace_lit', 'nether_portal', 'end_portal', 'end_portal_frame_filled']);

/** Every block carried as an item: the world's own and the game's (`own`: its `blocks`). */
export function blockItems(own: string[]): string[] {
  return [...new Set([...BUILT_IN, ...own])].filter((n) => !NO_ITEM.has(n));
}
