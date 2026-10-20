import { blockRule, digTime } from '../../src/games/sandbox/survival/blocks';
import { toolStats } from '../../src/games/sandbox/survival/items';
import { blockItems } from '../../src/games/sandbox/survival/looks.shared';
import { craft } from '../../src/games/sandbox/survival/recipes';
import { shared } from '../../src/games/sandbox/shared';
import type { Container, ItemStack } from '../../src/platform';
import { check, launch } from './_harness';

/**
 * Sandbox's survival (`survival/`): Mineclonia's dig times and harvest levels, crafting in the 2×2 and 3×3 grids,
 * and in the game: 36 slots, mined blocks dropping what they should (only to the right pickaxe), tools wearing,
 * the inventory's crafting grid, a furnace smelting, and the inventory put away out of survival.
 */
export default function survivalTest() {
  // ---------------------------------------------------------------- the numbers
  const time = (block: string, tool?: string) => digTime(blockRule(block, null), toolStats(tool)).time;
  const drops = (block: string, tool?: string) => digTime(blockRule(block, null), toolStats(tool)).drops;
  check(time('stone') === 7.5 && !drops('stone'), `stone by hand: ${time('stone')} s, nothing`);
  check(time('stone', 'wooden_pickaxe') === 1.15 && drops('stone', 'wooden_pickaxe'), `stone, wooden pickaxe: ${time('stone', 'wooden_pickaxe')} s`);
  check(time('obsidian', 'diamond_pickaxe') === 9.4 && drops('obsidian', 'diamond_pickaxe') && !drops('obsidian', 'iron_pickaxe'), `obsidian, diamond pickaxe: ${time('obsidian', 'diamond_pickaxe')} s`);
  check(time('dirt') === 0.75 && drops('dirt'), `dirt by hand: ${time('dirt')} s`);
  check(drops('iron_ore', 'stone_pickaxe') && !drops('iron_ore', 'wooden_pickaxe') && !drops('diamond_ore', 'stone_pickaxe') && drops('diamond_ore', 'iron_pickaxe'), 'ores need their pickaxe');
  check(time('oak_log', 'stone_axe') < time('oak_log') && time('oak_log', 'stone_pickaxe') === time('oak_log'), 'an axe for wood, not a pickaxe');

  // ---------------------------------------------------------------- crafting
  const all = () => true;
  const P = 'oak_planks', S = 'stick', C = 'cobblestone';
  check(craft(['oak_log', null, null, null], 2, all)?.item === 'oak_planks', 'a log: four planks');
  check(craft([P, P, P, P], 2, all)?.item === 'crafting_table', '2×2 planks: a crafting table');
  check(craft([null, null, null, null, P, P, null, P, P], 3, all)?.item === 'crafting_table', 'anywhere in the 3×3 too');
  check(craft([null, P, null, null, P, null, null, null, null], 3, all)?.count === 4, 'two planks stacked: four sticks');
  check(craft([C, C, C, null, S, null, null, S, null], 3, all)?.item === 'stone_pickaxe', 'a stone pickaxe');
  check(craft([P, P, null, S, P, null, S, null, null], 3, all)?.item === 'wooden_axe' && craft([null, P, P, null, P, S, null, null, S], 3, all)?.item === 'wooden_axe', 'an axe, either way round');
  check(craft([C, C, C, C, null, C, C, C, C], 3, all)?.item === 'furnace', 'a furnace');
  check(craft([C, C, C, C, C, C, C, C, C], 3, all) === null, 'nine cobblestone: nothing');

  // ---------------------------------------------------------------- in the game
  // (Read afresh: what the checks before narrowed.)
  const slot = (i: number) => h.ctx.player.inventory.slots[i] as ItemStack | null;
  const opened = () => h.ctx.player.container as Container | null;
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const me = g.player;
  h.run(2);
  g.commands.run('gamemode survival');
  h.run(0.2);
  check(me.inventory.capacity === 36 && me.inventory.slots.length === 36, `36 slots (${me.inventory.capacity})`);
  check(me.inventory.slots.every((s) => !s), 'a survivor starts with nothing');
  // (Every block the server makes an item of, each screen gives a look: the screens' list is the world's.)
  const served = new Set(h.sim.items.ids().filter((i) => h.ctx.items.get(i)?.kind === 'block'));
  const shown = new Set(blockItems(Object.keys(shared.blocks ?? {})));
  const missing = [...served].filter((n) => !shown.has(n)), extra = [...shown].filter((n) => !served.has(n));
  check(!missing.length && !extra.length, `block items: ${served.size} served, the screens' list misses ${missing} and has extra ${extra}`);

  const s = g.world.spawn;
  const x = Math.floor(s.x), z = Math.floor(s.z);
  const top = g.world.surfaceY(x, z);
  const down = -(Math.PI / 2 - 0.01);
  /** Stand on the block at (x, y, z), looking down at it, and mine it, holding a slot's item. */
  const mine = (y: number, block: string) => {
    g.world.setBlock(x, y, z, block);
    me.teleport({ x: x + 0.5, y: y + 1, z: z + 0.5 }, 0, down);
    h.run(0.3, { pilot: () => ({ pitch: down }) });
    return h.run(20, { pilot: () => ({ pitch: down, buttons: 1 }), until: () => g.world.blockName(g.world.getBlock(x, y, z)) !== block });
  };
  /** Stand still a moment for what dropped to come to them. */
  const gather = () => h.run(1.5, { pilot: () => ({ pitch: down }) });

  // Stone by hand: slow, and nothing.
  const t1 = mine(top, 'stone');
  gather();
  check(t1 > 7 && me.inventory.count('cobblestone') === 0, `stone by hand: ${t1.toFixed(2)} s, no cobblestone`);

  // With a wooden pickaxe: quick, cobblestone, the pickaxe worn.
  me.inventory.set(0, { item: 'wooden_pickaxe', count: 1 });
  me.inventory.select(0);
  const t2 = mine(top - 1, 'stone');
  gather();
  check(t2 < 1.6 && me.inventory.count('cobblestone') === 1, `stone with a wooden pickaxe: ${t2.toFixed(2)} s, ${me.inventory.count('cobblestone')} cobblestone`);
  check(slot(0)?.wear === 1, `the pickaxe's worn by one (${slot(0)?.wear})`);

  // Iron ore needs stone: with wood, nothing.
  const t3 = mine(top - 2, 'iron_ore');
  gather();
  check(me.inventory.count('raw_iron') === 0, `iron ore with a wooden pickaxe: nothing (${t3.toFixed(2)} s)`);
  me.inventory.set(0, { item: 'stone_pickaxe', count: 1 });
  mine(top - 3, 'iron_ore');
  gather();
  check(me.inventory.count('raw_iron') === 1, 'iron ore with a stone pickaxe: raw iron');

  // The inventory's 2×2 grid: a log in, planks out.
  me.inventory.set(5, { item: 'oak_log', count: 2 });
  h.sim.receive({ t: 'inventoryOpen', player: me.id });
  h.run(0.1);
  const grid = me.container;
  check(grid?.kind === 'crafting' && grid.slots.length === 9, `the 2×2 grid's open, with the armour slots (${grid?.slots.length} slots)`);
  h.sim.receive({ t: 'inventoryMove', player: me.id, from: 5, to: 100 });
  h.run(0.1);
  check(grid!.slots[4]?.item === 'oak_planks' && grid!.slots[4]?.count === 4, `a log in it: ${grid!.slots[4]?.count} planks to take`);
  h.sim.receive({ t: 'inventoryMove', player: me.id, from: 104, to: -1 });
  h.run(0.1);
  check(me.inventory.count('oak_planks') === 4 && grid!.slots[0]?.count === 1 && grid!.slots[4]?.item === 'oak_planks', `taken: 4 planks, one log left in the grid`);
  h.sim.receive({ t: 'inventoryClose', player: me.id });
  h.run(0.1);
  check(!me.container && me.inventory.count('oak_log') === 1, 'shut: the log left in it comes back');

  // A furnace: raw iron and coal, an iron ingot ten seconds later.
  // (Stood on it, looking down: right-clicked, as one opens it.)
  const fy = top - 4;
  g.world.setBlock(x, fy, z, 'furnace');
  me.teleport({ x: x + 0.5, y: fy + 1, z: z + 0.5 }, 0, down);
  h.run(0.3, { pilot: () => ({ pitch: down }) });
  h.run(1, { pilot: () => ({ pitch: down, clicked: 4, buttons: 4 }), until: () => !!me.container });
  const box = opened();
  check(box?.kind === 'furnace', `right-clicked, the furnace opens (${box?.kind})`);
  if (box) {
    box.slots[0] = { item: 'raw_iron', count: 1 };
    box.slots[1] = { item: 'coal', count: 1 };
    h.run(10.5);
    check(box.slots[2]?.item === 'iron_ingot' && !box.slots[0], `smelted: ${box.slots[2]?.item}`);
    check(g.world.blockName(g.world.getBlock(x, fy, z)) === 'furnace_lit', 'it burns on (lit)');
  }

  // Armour: put on in the inventory's armour slots (5 to 8 of its grid, head to feet), its points counted.
  me.inventory.set(7, { item: 'iron_chestplate', count: 1 });
  me.inventory.set(8, { item: 'diamond_helmet', count: 1 });
  me.inventory.set(9, { item: 'oak_planks', count: 1 });
  // (The furnace shut first: their own inventory, Minecraft's survival screen.)
  h.sim.receive({ t: 'inventoryClose', player: me.id });
  h.sim.receive({ t: 'inventoryOpen', player: me.id });
  h.run(0.1);
  const own = me.container!;
  h.sim.receive({ t: 'inventoryMove', player: me.id, from: 7, to: 106 });
  h.sim.receive({ t: 'inventoryMove', player: me.id, from: 9, to: 105 });
  h.sim.receive({ t: 'inventoryMove', player: me.id, from: 8, to: -1 });
  h.run(0.1);
  check(own.slots[6]?.item === 'iron_chestplate' && own.slots[5]?.item === 'diamond_helmet' && me.inventory.count('oak_planks') >= 1, `chestplate on, planks refused by the helmet's slot, a helmet shift-clicked on: ${own.slots.slice(5).map((s) => s?.item ?? '-')}`);
  check(me.armor === 9, `iron chestplate and diamond helmet: ${me.armor} armour points`);
  h.sim.receive({ t: 'inventoryClose', player: me.id });
  h.run(0.1);
  check(me.armor === 9, 'still worn with the inventory shut');
  // An iron chestplate crafted: eight ingots in its shape.
  const I = 'iron_ingot';
  check(craft([I, null, I, I, I, I, I, I, I], 3, () => true)?.item === 'iron_chestplate', 'an iron chestplate from eight ingots');

  // What they carry is theirs whatever the mode, as Minecraft's is.
  const carried = me.inventory.count('oak_planks');
  g.commands.run('gamemode creative');
  h.run(0.2);
  check(me.inventory.count('oak_planks') === carried && me.inventory.capacity === 36, `creative: still carried (${carried} planks)`);
  g.commands.run('gamemode survival');
  h.run(0.2);
  check(me.inventory.count('oak_planks') === carried && me.armor === 9, `survival again: ${carried} planks, the armour on`);
  console.log(`  stone by hand ${t1.toFixed(2)} s (nothing), wooden pickaxe ${t2.toFixed(2)} s; iron ore needs stone; crafted planks in the 2×2 grid; a furnace smelted raw iron`);
}
