import type { Container, GameContext, ItemStack } from '@platform';
import { COOK_TIME, SMELTING, fuelTime } from './recipes';

/**
 * Furnaces: each placed one keeps its three slots (what's smelting, the fuel, what's done) and burns on its own,
 * whether anyone has it open or not, Mineclonia's way: new fuel only when there's something to smelt with room for
 * it, ten seconds an item, the smelting starting over if the fuel runs out. It glows while it burns (a lit
 * furnace in its place). They're kept with the world (`game.store`).
 */

const INPUT = 0;
const FUEL = 1;
const OUTPUT = 2;
const KEPT = 'survival:furnaces';

interface Furnace {
  slots: (ItemStack | null)[];
  /** Seconds the fuel burns on, and how long it burned when lit (for the flame). */
  burn: number;
  burnMax: number;
  /** Seconds the item in it has cooked. */
  cook: number;
  container: Container;
}

export interface Furnaces {
  /** Open the furnace at a block (making it if it's new) for a player. */
  open(x: number, y: number, z: number): Container;
  /** A furnace was broken: what was in it, to drop (and it's gone). */
  broken(x: number, y: number, z: number): ItemStack[];
  update(dt: number): void;
}

export function furnaces(game: GameContext, most: (item: string) => number): Furnaces {
  const all = new Map<string, Furnace>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  let dirty = false;
  let saveIn = 0;

  const make = (k: string, slots: (ItemStack | null)[] = [null, null, null], burn = 0, burnMax = 0, cook = 0): Furnace => {
    const f: Furnace = {
      slots,
      burn,
      burnMax,
      cook,
      container: {
        kind: 'furnace',
        title: 'Furnace',
        slots,
        output: [OUTPUT],
        progress: {},
        accepts: (slot, stack) => (slot === FUEL ? fuelTime(stack.item) > 0 : slot === INPUT),
        changed: () => {
          dirty = true;
        },
      },
    };
    all.set(k, f);
    return f;
  };

  // The furnaces kept with the world.
  const kept = game.store.get<Record<string, { slots: (ItemStack | null)[]; burn: number; burnMax: number; cook: number }>>(KEPT);
  if (kept) for (const [k, f] of Object.entries(kept)) make(k, f.slots, f.burn, f.burnMax, f.cook);

  const save = () => {
    const out: Record<string, { slots: (ItemStack | null)[]; burn: number; burnMax: number; cook: number }> = {};
    for (const [k, f] of all) out[k] = { slots: f.slots, burn: f.burn, burnMax: f.burnMax, cook: f.cook };
    game.store.set(KEPT, out);
    dirty = false;
  };

  /** Lit or not: the block's swapped for its other self, facing the same way. */
  const light = (k: string, on: boolean) => {
    const [x, y, z] = k.split(',').map(Number);
    const id = game.world.getBlock(x, y, z);
    const name = game.world.blockName(id);
    const from = on ? 'furnace' : 'furnace_lit';
    if (name !== from) return;
    const turn = id - game.world.blockId(from);
    game.world.setBlock(x, y, z, game.world.blockId(on ? 'furnace_lit' : 'furnace') + turn);
  };

  function step(k: string, f: Furnace, dt: number) {
    const input = f.slots[INPUT];
    const made = input ? SMELTING[input.item] : undefined;
    const out = f.slots[OUTPUT];
    const room = !!made && game.items.get(made) !== undefined && (!out || (out.item === made && !out.wear && out.count < most(made)));
    const wasLit = f.burn > 0;
    // New fuel only when there's something to smelt with room for it, and the last is spent.
    if (f.burn <= 0 && room) {
      const fuel = f.slots[FUEL];
      const t = fuel ? fuelTime(fuel.item) : 0;
      if (fuel && t > 0) {
        f.burn = f.burnMax = t;
        // (A lava bucket burns, and leaves its bucket.)
        f.slots[FUEL] = fuel.item === 'lava_bucket' ? { item: 'bucket', count: 1 } : fuel.count > 1 ? { ...fuel, count: fuel.count - 1 } : null;
        dirty = true;
      }
    }
    if (f.burn > 0) {
      f.burn = Math.max(0, f.burn - dt);
      if (room) {
        f.cook += dt;
        if (f.cook >= COOK_TIME) {
          f.cook = 0;
          f.slots[INPUT] = input!.count > 1 ? { ...input!, count: input!.count - 1 } : null;
          f.slots[OUTPUT] = out ? { ...out, count: out.count + 1 } : { item: made!, count: 1 };
          dirty = true;
        }
      } else f.cook = 0;
    } else if (f.cook > 0) {
      // (Out of fuel: it starts over.)
      f.cook = 0;
    }
    if (wasLit !== f.burn > 0) light(k, f.burn > 0);
    f.container.progress = { cook: f.cook / COOK_TIME, burn: f.burnMax ? f.burn / f.burnMax : 0 };
  }

  return {
    open(x, y, z) {
      const k = key(x, y, z);
      return (all.get(k) ?? make(k)).container;
    },
    broken(x, y, z) {
      const k = key(x, y, z);
      const f = all.get(k);
      if (!f) return [];
      all.delete(k);
      dirty = true;
      // (Whoever had it open: it's shut.)
      for (const p of game.players) if (p.container === f.container) p.openContainer(null);
      return f.slots.filter((s): s is ItemStack => !!s);
    },
    update(dt) {
      for (const [k, f] of all) step(k, f, dt);
      saveIn -= dt;
      if (dirty && saveIn <= 0) {
        saveIn = 5;
        save();
      }
    },
  };
}
