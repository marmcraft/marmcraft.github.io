import type { GameContext } from '@platform';

/**
 * Water and lava flowing, Mineclonia's (Minecraft's) way (`research/mineclonia-spec.md`, Liquids):
 *
 * - A source feeds the cells beside it at the top level (water 7, lava 6); each block further, a level lower (water
 *   by 1, lava by 2), so water runs seven blocks over flat ground and lava three.
 * - Liquid falls first: a cell with the same liquid over it is a falling column (full), and a flowing cell spreads
 *   sideways only when what's below it holds it up. Spreading, it heads for the nearest way down (within a few
 *   blocks), else all four ways.
 * - Cut off from what fed it, it dries up a level at a time.
 * - Two water sources either side of a cell, over something that holds it (or more water), make it a source:
 *   Minecraft's infinite water.
 * - Lava meeting water: a lava source touched by water turns to obsidian, flowing lava to cobblestone, and lava
 *   falling onto water turns that water to stone.
 * - Flowing water washes away what breaks at a touch (plants, torches), dropping them; lava burns them.
 *
 * Event-driven: a cell is looked at again when something beside it changes, after its liquid's tick (water a
 * quarter second, lava a second and a half).
 */

type Fluid = 'water' | 'lava';

/** What a cell is to the liquids. */
interface Cell {
  /** The liquid in it, if any. */
  fluid: Fluid | null;
  /** Its level: 8 a source, 'fall' a falling column, 1..7 flowing. */
  level: number | 'fall' | 0;
  /** Liquid can run into it (air, a plant, a lower level of the same liquid). */
  open: boolean;
  /** It breaks at a touch (washed away). */
  washable: boolean;
  /** Known (in a loaded chunk). */
  known: boolean;
}

const TICK: Record<Fluid, number> = { water: 0.25, lava: 1.5 };
/** The level beside a source, and how much it drops a block. */
const TOP: Record<Fluid, number> = { water: 7, lava: 6 };
const STEP: Record<Fluid, number> = { water: 1, lava: 2 };
/** How far flowing liquid looks for a way down. */
const SEEK: Record<Fluid, number> = { water: 4, lava: 2 };
const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The most cells looked at again in one step (a flood spreads over the next steps). */
const BUDGET = 4000;

export interface Liquids {
  update(dt: number): void;
  /** Look at a cell (and what's around it) again soon: a block was placed or taken there. */
  poke(x: number, y: number, z: number): void;
  /** The liquid source at a cell, if it is one. */
  sourceAt(x: number, y: number, z: number): Fluid | null;
}

/** `washed`: a block that breaks at a touch was swept away by water (to drop) or burnt by lava (`burnt`). */
export function liquids(game: GameContext, washed: (x: number, y: number, z: number, block: string, burnt: boolean) => void): Liquids {
  const { world } = game;
  const ids = {
    water: world.blockId('water'),
    lava: world.blockId('lava'),
    air: world.blockId('air'),
  };
  const flowIds = new Map<string, number>();
  const flowId = (f: Fluid, level: number | 'fall') => {
    const ref = level === 'fall' ? `${f}[falling=true]` : `${f}[level=${level}]`;
    let id = flowIds.get(ref);
    if (id === undefined) flowIds.set(ref, (id = world.blockId(ref)));
    return id;
  };
  /** Ids to what they are (worked out once each). */
  const cache = new Map<number, Omit<Cell, 'known'>>();
  const UNKNOWN = 65535;

  const cell = (x: number, y: number, z: number): Cell => {
    const id = world.getBlock(x, y, z);
    if (id === UNKNOWN) return { fluid: null, level: 0, open: false, washable: false, known: false };
    let c = cache.get(id);
    if (!c) {
      const info = world.blockInfo(id);
      if (!info) c = { fluid: null, level: 0, open: false, washable: false };
      else if (info.name === 'water' || info.name === 'lava') {
        const level = info.state.falling ? 'fall' : info.state.level ? Number(info.state.level) : 8;
        c = { fluid: info.name, level, open: false, washable: false };
      } else {
        const washable = info.name !== 'air' && info.plant;
        c = { fluid: null, level: 0, open: info.name === 'air' || washable, washable };
      }
      cache.set(id, c);
    }
    return { ...c, known: true };
  };

  // ---------------------------------------------------------------------------------------- the queue
  /** Cells due a look, and when (the game clock). */
  const due = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const schedule = (x: number, y: number, z: number, delay: number) => {
    const k = key(x, y, z);
    const at = game.clock.total + delay;
    const was = due.get(k);
    if (was === undefined || at < was) due.set(k, at);
  };
  /** A cell changed: it and the six beside it, after the liquid's tick. */
  const around = (x: number, y: number, z: number, delay: number) => {
    schedule(x, y, z, delay);
    schedule(x, y + 1, z, delay);
    schedule(x, y - 1, z, delay);
    for (const [dx, dz] of SIDES) schedule(x + dx, y, z + dz, delay);
  };
  /** Whether anything liquid is in or beside a cell (else a change there is nothing to the liquids). */
  const nearLiquid = (x: number, y: number, z: number) => {
    if (cell(x, y, z).fluid || cell(x, y + 1, z).fluid || cell(x, y - 1, z).fluid) return true;
    return SIDES.some(([dx, dz]) => !!cell(x + dx, y, z + dz).fluid);
  };

  /** Our own changes, so `blockChange` doesn't schedule them twice. */
  let setting = false;
  const set = (x: number, y: number, z: number, id: number, fluid: Fluid | null) => {
    setting = true;
    world.setBlock(x, y, z, id);
    setting = false;
    around(x, y, z, fluid ? TICK[fluid] : TICK.water);
  };

  game.events.on('blockChange', ({ x, y, z }) => {
    if (setting) return;
    if (nearLiquid(x, y, z)) around(x, y, z, 0.05);
  });

  // ---------------------------------------------------------------------------------------- the rules
  /** Liquid in this cell holds up what's above it (it doesn't fall through). */
  const holds = (c: Cell, f: Fluid) => c.known && !c.open && !(c.fluid === f && c.level !== 8);

  /**
   * Which ways flowing liquid at (x, y, z) runs: toward the nearest way down within its reach (open with open
   * below), else every open way.
   */
  function ways(x: number, y: number, z: number, f: Fluid): [number, number][] {
    let best = Infinity;
    let out: [number, number][] = [];
    for (const [dx, dz] of SIDES) {
      const d = seek(x + dx, y, z + dz, f, dx, dz, 1);
      if (d < best) {
        best = d;
        out = [[dx, dz]];
      } else if (d === best && d < Infinity) out.push([dx, dz]);
    }
    if (best < Infinity) return out;
    return SIDES.filter(([dx, dz]) => flowable(cell(x + dx, y, z + dz), f));
  }
  /** Can this liquid run into a cell (open, or a lower level of itself)? */
  const flowable = (c: Cell, f: Fluid) => c.known && (c.open || (c.fluid === f && c.level !== 8 && c.level !== 'fall'));
  /** How far from (x, y, z), heading on (not back), is a way down: Infinity if none within reach. */
  function seek(x: number, y: number, z: number, f: Fluid, fromX: number, fromZ: number, depth: number): number {
    if (!flowable(cell(x, y, z), f)) return Infinity;
    if (flowable(cell(x, y - 1, z), f)) return depth;
    if (depth >= SEEK[f]) return Infinity;
    let best = Infinity;
    for (const [dx, dz] of SIDES) {
      if (dx === -fromX && dz === -fromZ) continue;
      best = Math.min(best, seek(x + dx, y, z + dz, f, dx, dz, depth + 1));
    }
    return best;
  }

  /** What a neighbour of this liquid at (nx, ny, nz) feeds a cell beside it, heading (dx, dz): a level, or 0. */
  function feeds(nx: number, ny: number, nz: number, n: Cell, f: Fluid, dx: number, dz: number): number {
    if (n.fluid !== f) return 0;
    if (n.level === 8) return TOP[f];
    // Flowing or falling: sideways only when held up from below, and only the ways it's heading.
    if (!holds(cell(nx, ny - 1, nz), f)) return 0;
    if (!ways(nx, ny, nz, f).some(([wx, wz]) => wx === dx && wz === dz)) return 0;
    // (A falling column landing spreads as a source does.)
    const from = n.level === 'fall' ? TOP[f] + STEP[f] : (n.level as number);
    return Math.max(0, from - STEP[f]);
  }

  /** What a cell should be now, by what's around it (null: as it is). */
  function settle(x: number, y: number, z: number) {
    const here = cell(x, y, z);
    if (!here.known) return;
    if (here.fluid && here.level === 8) {
      if (here.fluid === 'lava') meetWater(x, y, z, true);
      else spreadInto(x, y, z);
      return;
    }
    if (!here.fluid && !here.open) return;
    // Which liquid could be here: one over it, else the most from beside it.
    const up = cell(x, y + 1, z);
    let fluid: Fluid | null = null;
    let level: number | 'fall' = 0;
    if (up.fluid && (here.fluid === null || here.fluid === up.fluid)) {
      fluid = up.fluid;
      level = 'fall';
    } else {
      let sources = 0;
      for (const f of (here.fluid ? [here.fluid] : ['water', 'lava']) as Fluid[]) {
        let most = 0;
        for (const [dx, dz] of SIDES) {
          const n = cell(x - dx, y, z - dz);
          if (n.fluid === f && n.level === 8 && f === 'water') sources++;
          most = Math.max(most, feeds(x - dx, y, z - dz, n, f, dx, dz));
        }
        if (most > (typeof level === 'number' ? level : 0)) {
          fluid = f;
          level = most;
        }
      }
      // Infinite water: two sources beside it, over something that holds it or more water.
      const below = cell(x, y - 1, z);
      if (sources >= 2 && (here.fluid === 'water' || here.open) && (below.fluid === 'water' ? below.level === 8 : holds(below, 'water'))) {
        fluid = 'water';
        level = 8;
      }
    }
    if (here.fluid && fluid !== here.fluid && fluid !== null) return; // (Another liquid's: meeting handles that.)
    const same = fluid === here.fluid && level === here.level;
    if (!same) {
      if (!fluid || level === 0) {
        // Dried up.
        if (here.fluid) set(x, y, z, ids.air, here.fluid);
      } else {
        if (here.washable) washed(x, y, z, world.blockName(world.getBlock(x, y, z)), fluid === 'lava');
        set(x, y, z, level === 8 ? ids[fluid] : flowId(fluid, level), fluid);
      }
    }
    const now = cell(x, y, z);
    if (now.fluid === 'lava') meetWater(x, y, z, now.level === 8);
    else if (now.fluid === 'water') spreadInto(x, y, z);
  }

  /** Water at (x, y, z) touching lava beside or below: the lava turns (a source to obsidian, flowing to cobblestone). */
  function spreadInto(x: number, y: number, z: number) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]] as const) {
      const n = cell(x + dx, y + dy, z + dz);
      if (n.fluid === 'lava') meetWater(x + dx, y + dy, z + dz, n.level === 8);
    }
  }

  /** Lava at (x, y, z) and water beside or over it: obsidian (a source) or cobblestone; water under falling lava: stone. */
  function meetWater(x: number, y: number, z: number, source: boolean) {
    const below = cell(x, y - 1, z);
    if (below.fluid === 'water') {
      set(x, y - 1, z, world.blockId('stone'), null);
      fizz(x, y - 1, z);
    }
    let touched = cell(x, y + 1, z).fluid === 'water';
    for (const [dx, dz] of SIDES) if (cell(x + dx, y, z + dz).fluid === 'water') touched = true;
    if (!touched) return;
    set(x, y, z, world.blockId(source ? 'obsidian' : 'cobblestone'), null);
    fizz(x, y, z);
  }

  const fizz = (x: number, y: number, z: number) => {
    game.fx.burst({ x: x + 0.5, y: y + 1, z: z + 0.5 }, { color: '#d8d8d8', count: 8, speed: 1, gravity: -2, size: 0.15 });
  };

  return {
    poke(x, y, z) {
      around(x, y, z, 0.05);
    },
    sourceAt(x, y, z) {
      const c = cell(x, y, z);
      return c.fluid && c.level === 8 ? c.fluid : null;
    },
    update() {
      const now = game.clock.total;
      let n = 0;
      // (Taken in the order they fell due; what's looked at schedules more for later.)
      const ready: string[] = [];
      for (const [k, at] of due) if (at <= now) ready.push(k);
      ready.sort((a, b) => due.get(a)! - due.get(b)!);
      for (const k of ready) {
        if (n++ >= BUDGET) break;
        due.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        settle(x, y, z);
      }
    },
  };
}
