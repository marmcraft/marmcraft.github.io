import { building } from '@platform/kits';
import type { Container, GameContext, ItemStack, Player } from '@platform';
import { blockRule, digTime } from './blocks';
import { furnaces } from './furnace';
import { defineItems, toolStats, usesOf } from './items';
import { liquids } from './liquids';
import { endPortal } from './endportal';
import { mobs } from './mobs';
import { portals } from './portals';
import { craft } from './recipes';

/**
 * Survival, Minecraft's way (Mineclonia's numbers): what a survivor carries (36 slots, the hotbar the first nine),
 * mining by hand and by tool (a block's hardness, the tool that suits it, the pickaxe it needs to drop anything),
 * the drops, tools wearing out, crafting (a 2×2 grid in the inventory, 3×3 at a crafting table) and furnaces.
 *
 * It's for players in survival or adventure (`modeOf`; adventure's may not break or place); a creative builder
 * builds as ever. What a survivor carries is kept for them between visits and between modes.
 */

type Mode = 'creative' | 'survival' | 'adventure' | 'spectator';

/** Slots a survivor carries, and the hotbar's. */
const SLOTS = 36;
const BAR = 9;
const KEPT = 'survival:inventory';
/** How far from a crafting table or furnace they can be and keep it open. */
const REACH = 8;
/** How far they reach to use a block or a bucket. */
const REACH_USE = 4.6;

export interface Survival {
  /** Their mode changed (or they arrived: `was` undefined): into survival their things come back, out of it they're put away. */
  changed(player: Player, mode: Mode, was: Mode | undefined): void;
  /** Every step, from the game's `update`. */
  update(dt: number): void;
}

export function survival(game: GameContext, modeOf: (player: Player) => Mode): Survival {
  const blockItems = defineItems(game);
  const known = (item: string) => !!game.items.get(item);
  const most = (item: string) => game.items.get(item)?.stack ?? 64;
  const surviving = (p: Player) => {
    const m = modeOf(p);
    return m === 'survival' || m === 'adventure';
  };
  const ovens = furnaces(game, most);
  // Nether portals: lit with flint and steel, taking anyone in one (creative too) to the other world.
  const gates = portals(game, (p) => !surviving(p));
  // The End: eyes of ender into frames (or thrown toward a stronghold), its portal there and back.
  const end = endPortal(game);
  // The night's mobs, for survivors (creative builders and spectators go unnoticed).
  const night = mobs(game, (p) => modeOf(p) === 'survival' || modeOf(p) === 'adventure');
  // Water and lava flow for everyone (a creative builder's too): what they wash away drops, what lava reaches burns.
  const flow = liquids(game, (x, y, z, block, burnt) => {
    if (burnt) return;
    const rule = blockRule(block, game.world.blockInfo(block));
    drop(rule.drops ? rule.drops(Math.random) : [{ item: block, count: 1 }], x, y, z);
  });

  // ------------------------------------------------------------------------------------------ mining and placing
  const build = building(game, {
    who: surviving,
    canBreak: (_at, _block, by) => !('kind' in by && by.kind === 'player') || modeOf(by as Player) !== 'adventure',
    canPlace: (_at, _block, by) => !('kind' in by && by.kind === 'player') || modeOf(by as Player) !== 'adventure',
    breakTime: (block, held) => digTime(blockRule(block, game.world.blockInfo(block)), toolStats(held?.item)).time,
    blockOf: (item) => (blockItems.has(item) ? item : null),
  });

  /** Things dropped at a block, scattered a little as Minecraft's are. */
  const drop = (stacks: ItemStack[], x: number, y: number, z: number) => {
    for (const s of stacks) {
      if (!known(s.item) || s.count <= 0) continue;
      const v = { x: (Math.random() - 0.5) * 2, y: 2.5, z: (Math.random() - 0.5) * 2 };
      game.items.spawnPickup(s.item, { x: x + 0.5, y: y + 0.4, z: z + 0.5 }, { count: s.count, velocity: v, ...(s.wear && { wear: s.wear }) });
    }
  };

  /** Their tool's worn by a use (a sword twice: it's no digger); worn out, it breaks. */
  const wear = (player: Player, by = 1) => {
    const held = player.inventory.held;
    const uses = held ? usesOf(held.item) : undefined;
    if (!held || !uses) return;
    const worn = (held.wear ?? 0) + by;
    if (worn >= uses) {
      player.inventory.set(player.inventory.selected, null);
      player.hud.toast(`Your ${game.items.get(held.item)?.name ?? 'tool'} broke`);
      return;
    }
    player.inventory.set(player.inventory.selected, { ...held, wear: worn });
  };

  game.events.on('blockBreak', ({ x, y, z, block, by }) => {
    if (typeof by !== 'object' || by.kind !== 'player') return;
    const player = by as unknown as Player;
    if (!surviving(player)) return;
    const rule = blockRule(block, game.world.blockInfo(block));
    const held = player.inventory.held;
    const tool = toolStats(held?.item);
    const { drops } = digTime(rule, tool);
    if (drops) drop(rule.drops ? rule.drops(Math.random) : [{ item: block, count: 1 }], x, y, z);
    if (block === 'furnace' || block === 'furnace_lit') drop(ovens.broken(x, y, z), x, y, z);
    // (A block that breaks at a touch doesn't wear a tool.)
    if (rule.hardness > 0) wear(player, tool?.type === 'sword' ? 2 : 1);
  });

  // ------------------------------------------------------------------------------------------ crafting
  /** A crafting grid (`size` 2: the inventory's; 3: a table's) and its result, given back when it's shut. */
  const grid = (player: Player, size: number, at?: { x: number; y: number; z: number }): Container & { at?: typeof at } => {
    const n = size * size;
    const slots: (ItemStack | null)[] = Array.from({ length: n + 1 }, () => null);
    const c: Container & { at?: typeof at } = {
      kind: 'crafting',
      title: 'Crafting',
      slots,
      output: [n],
      at,
      accepts: (slot) => slot < n,
      changed() {
        const made = craft(slots.slice(0, n).map((s) => s?.item ?? null), size, known);
        slots[n] = made ? { item: made.item, count: made.count } : null;
      },
      taken() {
        // One of everything in the grid went into it.
        for (let i = 0; i < n; i++) {
          const s = slots[i];
          if (s) slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
        }
      },
      closed() {
        const back = slots.slice(0, n).filter((s): s is ItemStack => !!s);
        slots.fill(null);
        const p = player.position;
        for (const s of back) {
          const left = player.inventory.giveStack(s);
          if (left > 0) drop([{ ...s, count: left }], Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        }
      },
    };
    return c;
  };

  // The inventory opened: the 2×2 grid's there with it.
  game.events.on('inventoryOpen', ({ player }) => {
    if (surviving(player) && !player.container) player.openContainer(grid(player, 2));
  });

  /** A crafting table or furnace right-clicked: it opens (unless they're sneaking: then they place against it); else a bucket's used. */
  function useBlocks(player: Player) {
    if (!player.alive || player.spectating || !player.input.buttonPressed(2)) return;
    const hit = game.world.raycast(player.eye, player.look, REACH_USE);
    const name = hit ? game.world.blockName(hit.block) : '';
    if (hit && !player.crouching && name === 'crafting_table') player.openContainer(grid(player, 3, { x: hit.x, y: hit.y, z: hit.z }));
    else if (hit && !player.crouching && (name === 'furnace' || name === 'furnace_lit')) player.openContainer(ovens.open(hit.x, hit.y, hit.z));
    else if (!useBucket(player) && !strike(player) && !end.useEye(player)) return;
    player.input.consume(2);
  }

  /** Flint and steel struck at a block: the cell in front of it, if it's inside an obsidian frame, lights a portal. */
  function strike(player: Player): boolean {
    const held = player.inventory.held;
    if (held?.item !== 'flint_and_steel' || modeOf(player) !== 'survival') return false;
    const hit = game.world.raycast(player.eye, player.look, REACH_USE);
    if (!hit) return false;
    player.viewModel.play('swing');
    wear(player);
    gates.light(hit.x + hit.normal.x, hit.y + hit.normal.y, hit.z + hit.normal.z);
    return true;
  }

  /** The bucket in hand: an empty one takes the liquid source looked at, a full one pours one out. True if it did. */
  function useBucket(player: Player): boolean {
    const held = player.inventory.held;
    if (!held || modeOf(player) !== 'survival') return false;
    const into = (item: string) => {
      // (One of a stack of empties filled: the full one goes in with the rest of what they carry.)
      const slot = player.inventory.selected;
      if (held.count > 1) {
        player.inventory.set(slot, { ...held, count: held.count - 1 });
        const left = player.inventory.giveStack({ item, count: 1 });
        if (left) drop([{ item, count: 1 }], Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z));
      } else player.inventory.set(slot, { item, count: 1 });
    };
    if (held.item === 'bucket') {
      // Along their look to the first liquid source (or the first thing in the way).
      const { x: ex, y: ey, z: ez } = player.eye;
      const { x: dx, y: dy, z: dz } = player.look;
      let last = '';
      for (let t = 0; t <= REACH_USE; t += 0.05) {
        const x = Math.floor(ex + dx * t), y = Math.floor(ey + dy * t), z = Math.floor(ez + dz * t);
        const k = `${x},${y},${z}`;
        if (k === last) continue;
        last = k;
        const fluid = flow.sourceAt(x, y, z);
        if (fluid) {
          game.world.setBlock(x, y, z, 'air');
          into(`${fluid}_bucket`);
          return true;
        }
        const info = game.world.blockInfo(game.world.getBlock(x, y, z));
        if (info && info.name !== 'air' && !info.liquid && !info.plant) return false;
      }
      return false;
    }
    if (held.item !== 'water_bucket' && held.item !== 'lava_bucket') return false;
    const hit = game.world.raycast(player.eye, player.look, REACH_USE);
    if (!hit) return false;
    const replace = game.world.blockInfo(hit.block)?.replaceable;
    const x = replace ? hit.x : hit.x + hit.normal.x;
    const y = replace ? hit.y : hit.y + hit.normal.y;
    const z = replace ? hit.z : hit.z + hit.normal.z;
    const there = game.world.blockInfo(game.world.getBlock(x, y, z));
    if (!there || !(there.name === 'air' || there.replaceable)) return false;
    if (there.plant && there.name !== 'air') drop([{ item: there.name, count: 1 }], x, y, z);
    game.world.setBlock(x, y, z, held.item === 'water_bucket' ? 'water' : 'lava');
    player.inventory.set(player.inventory.selected, { item: 'bucket', count: 1 });
    return true;
  }

  /** Walked away from a table, or it's gone: it shuts. */
  function keepOpen(player: Player) {
    const c = player.container as (Container & { at?: { x: number; y: number; z: number } }) | null;
    if (!c?.at) return;
    const { x, y, z } = c.at;
    const p = player.position;
    const far = Math.hypot(p.x - x - 0.5, p.y - y, p.z - z - 0.5) > REACH;
    if (far || game.world.blockName(game.world.getBlock(x, y, z)) !== 'crafting_table') player.openContainer(null);
  }

  // ------------------------------------------------------------------------------------------ what they carry, kept
  const savedAs = new Map<string, string>();
  const save = (player: Player) => {
    if (player.bot || !surviving(player)) return;
    const stacks = player.inventory.slots.map((s) => (s ? { item: s.item, count: s.count, ...(s.wear && { wear: s.wear }) } : null));
    const json = JSON.stringify(stacks);
    if (savedAs.get(player.id) === json) return;
    savedAs.set(player.id, json);
    player.store.set(KEPT, stacks);
  };
  const load = (player: Player) => {
    player.inventory.setCapacity(SLOTS, BAR);
    player.inventory.clear();
    const kept = player.store.get<(ItemStack | null)[]>(KEPT) ?? [];
    kept.forEach((s, i) => {
      if (s && known(s.item) && i < SLOTS) player.inventory.set(i, s);
    });
    savedAs.set(player.id, JSON.stringify(kept));
  };

  game.events.on('playerLeave', ({ player }) => {
    save(player);
    savedAs.delete(player.id);
  });

  // Dying in survival, what they carried falls where they died.
  game.events.on('playerDeath', ({ player }) => {
    if (player.bot || modeOf(player) !== 'survival') return;
    player.openContainer(null);
    const p = player.position;
    drop(player.inventory.slots.filter((s): s is ItemStack => !!s), Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    player.inventory.clear();
    save(player);
  });

  let saveIn = 0;
  function update(dt: number) {
    for (const p of game.players) {
      if (!surviving(p)) continue;
      useBlocks(p);
      keepOpen(p);
    }
    build.update(dt);
    ovens.update(dt);
    flow.update(dt);
    gates.update(dt);
    end.update(dt);
    night.update(dt);
    saveIn -= dt;
    if (saveIn <= 0) {
      saveIn = 2;
      for (const p of game.players) save(p);
    }
  }

  return {
    update,
    changed(player, mode, was) {
      const now = mode === 'survival' || mode === 'adventure';
      const before = was === 'survival' || was === 'adventure';
      if (now && !before) load(player);
      if (!now && before) {
        player.openContainer(null);
        // (Their things are put away, as they were, for when they're back.)
        const stacks = player.inventory.slots.map((s) => (s ? { ...s } : null));
        player.store.set(KEPT, stacks);
        savedAs.delete(player.id);
        player.inventory.clear();
      }
    },
  };
}
