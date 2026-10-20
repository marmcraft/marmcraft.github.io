import type { Entity, GameContext, ItemStack } from '../platform/api/types';
import { Headless } from '../platform/host/headless';
import type { PlayerInput } from '../platform/net/protocol';
import { games } from '../games/server';
import { GROUPS, RECIPES, SMELTING, fuelTime, type Recipe } from '../games/sandbox/survival/recipes';
import { grade, taskById, type GradeState, type Task } from './tasks';

/**
 * MARM as an agent environment (weeks 4 and 5): one body in a seeded survival world, driven by high-level actions
 * that are carried out with the body's own controls (walking keys, the view, mouse buttons held for a block's real
 * dig time, the inventory screen's moves), never by editing the world. What the agent observes is what's in sight
 * round it; what the grader reads (`grade`) is the true state, which the agent never sees.
 *
 *   reset(task, seed)  -> observation
 *   act(action)        -> { observation, result, done }
 *   grade()            -> success, progress, milestones, counts
 *
 * The world goes on between actions only while an action runs (or `wait`): time of day, mobs spawning and
 * attacking, liquids flowing, furnaces cooking. It's stepped at 30 ticks a simulated second, faster than real time.
 */

const DT = 1 / 30;
/** How far the agent sees: blocks within this many (across) and this many up or down, exposed to air. */
const SIGHT = 12;
const SIGHT_UP = 6;
/** How far it reaches to dig, place or use (the building kit's 4.6, less a margin). */
const REACH = 4.2;
const HOSTILE = ['zombie', 'skeleton', 'spider', 'creeper'];
const CREATURES = [...HOSTILE, 'cow'];

export type Action =
  | { type: 'move_to'; x: number; y: number; z: number }
  | { type: 'mine'; block: string; count?: number }
  | { type: 'dig'; x: number; y: number; z: number }
  | { type: 'place'; item: string; x: number; y: number; z: number }
  | { type: 'craft'; item: string; count?: number }
  | { type: 'smelt'; item: string; count?: number; fuel?: string }
  | { type: 'equip'; item: string }
  | { type: 'attack'; target?: string }
  | { type: 'use'; item: string; x: number; y: number; z: number }
  | { type: 'chat'; message: string }
  | { type: 'wait'; seconds: number }
  | { type: 'scan' };

export interface Result {
  ok: boolean;
  message: string;
}

export interface Observation {
  text: string;
  data: {
    task: string;
    position: { x: number; y: number; z: number };
    health: number;
    time: { day: number; clock: string; phase: string };
    inventory: Record<string, number>;
    held: string | null;
    blocks: { block: string; count: number; nearest: [number, number, number]; distance: number }[];
    creatures: { type: string; distance: number; at: [number, number, number] }[];
    events: string[];
    step: number;
    stepsLeft: number;
  };
}

interface Cell {
  x: number;
  y: number;
  z: number;
}

const key = (c: Cell) => `${c.x},${c.y},${c.z}`;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export class MarmEnv {
  private h!: Headless;
  task!: Task;
  seed = 1;
  /** Actions taken, invalid ones among them, deaths, chat said. */
  steps = 0;
  invalid = 0;
  deaths = 0;
  chat: string[] = [];
  private day = 0;
  private lastTime = 0;
  private events: string[] = [];
  private ever: Record<string, number> = {};
  /** Blocks the agent placed that still stand, by cell. */
  private placed = new Map<string, string>();
  private done = false;
  private simSeconds = 0;

  /** Called after each reset and every tick: watch mode's (src/agent/watch.ts), to show the episode to a screen. */
  hooks: { reset?(h: Headless): void; tick?(h: Headless): void } = {};

  constructor(private wasm: BufferSource) {}

  get ctx(): GameContext {
    return this.h.ctx;
  }

  /** The agent's body: the host's own player (not `ctx.player`, whoever's acting: a watcher, once one joins). */
  get player() {
    return this.h.me.api;
  }

  private get me() {
    return this.player;
  }

  // ------------------------------------------------------------------------------------------ episodes

  reset(taskId: string, seed: number): Observation {
    const task = taskById(taskId);
    if (!task) throw new Error(`no task "${taskId}"`);
    this.h?.host.dispose();
    this.task = task;
    this.seed = seed;
    Math.random = mulberry32(seed ^ 0x5bd1e995);
    const def = games.find((g) => g.id === 'sandbox')!;
    this.h = new Headless(def, { wasm: this.wasm, seed, radius: 5, cheats: true });
    this.h.start();
    this.steps = this.invalid = this.deaths = 0;
    this.chat = [];
    this.events = [];
    this.ever = {};
    this.placed.clear();
    this.done = false;
    this.simSeconds = 0;
    this.day = 0;
    const ctx = this.ctx;
    // One body, no crowd: the wandering bots are off (the mobs and cows stay).
    ctx.commands.run('bots off');
    this.h.run(1, { dt: DT });
    ctx.commands.run('gamemode survival');
    this.h.run(0.5, { dt: DT });
    // Its start: what it carries, and the time of day.
    const inv = this.me.inventory;
    for (let i = 0; i < inv.slots.length; i++) inv.set(i, null);
    Object.entries(task.start.items ?? {}).forEach(([item, count], i) => inv.set(i, { item, count }));
    if (task.start.time !== undefined) ctx.env.time = task.start.time;
    this.lastTime = ctx.env.time;
    this.listen();
    this.h.run(0.5, { dt: DT });
    this.note();
    this.events = [];
    this.hooks.reset?.(this.h);
    return this.observe();
  }

  private listen() {
    const ctx = this.ctx;
    const me = this.me;
    ctx.events.on('playerDamage', ({ player, amount, source }) => {
      if (player !== me) return;
      const by = source && typeof source === 'object' && 'type' in source ? (source as Entity).type : 'something';
      this.events.push(`took ${round(amount)} damage from ${by}`);
    });
    ctx.events.on('playerDeath', ({ player }) => {
      if (player !== me) return;
      this.deaths++;
      this.events.push('DIED (you will respawn at the spawn point; what you carried was dropped where you died)');
    });
    ctx.events.on('pickup', ({ player, item, count }) => {
      if (player === me) this.events.push(`picked up ${item} x${count}`);
    });
    ctx.events.on('blockPlace', ({ x, y, z, block, by }) => {
      if (by === (me as unknown)) this.placed.set(key({ x, y, z }), block);
    });
    ctx.events.on('blockChange', ({ x, y, z, block }) => {
      const k = key({ x, y, z });
      const was = this.placed.get(k);
      // (A placed furnace lights and goes out: still the agent's furnace.)
      if (was && block !== was && !(was.startsWith('furnace') && block.startsWith('furnace'))) this.placed.delete(k);
    });
  }

  /** Run the world (the agent's controls as `pilot` says), counting days and recording what it has had. */
  private run(seconds: number, pilot: (() => Partial<PlayerInput> | null) | null = null, until?: () => boolean): number {
    const t0 = this.h.time;
    while (this.h.time - t0 < seconds) {
      this.h.step(DT, pilot?.() ?? null);
      this.hooks.tick?.(this.h);
      const t = this.ctx.env.time;
      if (t < this.lastTime - 0.5) this.day++;
      this.lastTime = t;
      if (until?.()) break;
    }
    const spent = this.h.time - t0;
    this.simSeconds += spent;
    this.note();
    return spent;
  }

  /** What the agent holds now (carried, worn, and placed blocks still standing). */
  private holdings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.me.inventory.slots) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
    for (const [k, block] of this.placed) {
      const [x, y, z] = k.split(',').map(Number);
      const now = this.ctx.world.blockName(this.ctx.world.getBlock(x, y, z));
      const name = now.startsWith('furnace') ? 'furnace' : now;
      if (name === block || (block.startsWith('furnace') && name === 'furnace')) out[name] = (out[name] ?? 0) + 1;
    }
    return out;
  }

  private note() {
    for (const [item, n] of Object.entries(this.holdings())) this.ever[item] = Math.max(this.ever[item] ?? 0, n);
  }

  private gradeState(): GradeState {
    return { holdings: { now: this.holdings(), ever: { ...this.ever } }, alive: this.me.alive, deaths: this.deaths, time: this.ctx.env.time, day: this.day };
  }

  /** The grader's view: the true state, scored against the task. */
  grade() {
    const s = this.gradeState();
    const g = grade(this.task, s);
    return {
      task: this.task.id,
      seed: this.seed,
      ...g,
      steps: this.steps,
      invalid: this.invalid,
      deaths: this.deaths,
      simSeconds: round(this.simSeconds),
      holdings: s.holdings.now,
      chat: this.chat,
      done: this.done,
    };
  }

  // ------------------------------------------------------------------------------------------ observing

  private clock() {
    const t = this.ctx.env.time;
    const minutes = Math.floor(t * 24 * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const night = t < 0.23 || t > 0.77;
    const dayLength = 1200;
    const phase = night ? `night (sunrise in ${Math.round((((0.23 - t + 1) % 1) * dayLength) / 60)} min)` : `day (sunset in ${Math.round(((0.77 - t) * dayLength) / 60)} min)`;
    return { day: this.day + 1, clock, phase };
  }

  /** Blocks in sight: within reach of the eye's sight, with a face open to the air (what's buried isn't seen). */
  private visibleBlocks(radius = SIGHT) {
    const w = this.ctx.world;
    const p = this.me.position;
    const [px, py, pz] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    const open = (x: number, y: number, z: number) => {
      const id = w.getBlock(x, y, z);
      if (id === 0) return true;
      const i = w.blockInfo(id);
      return !!i && (!i.solid || i.plant);
    };
    const found = new Map<string, { count: number; nearest: Cell; d: number }>();
    for (let x = px - radius; x <= px + radius; x++) {
      for (let z = pz - radius; z <= pz + radius; z++) {
        for (let y = py - SIGHT_UP; y <= py + SIGHT_UP; y++) {
          const id = w.getBlock(x, y, z);
          if (id <= 0 || id === 65535) continue;
          const name = w.blockName(id);
          if (name === 'air' || name === 'water' && y < py - 2) continue;
          if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1) || open(x, y, z - 1))) continue;
          const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + 1.6), z + 0.5 - p.z);
          const f = found.get(name);
          if (!f) found.set(name, { count: 1, nearest: { x, y, z }, d });
          else {
            f.count++;
            if (d < f.d) [f.nearest, f.d] = [{ x, y, z }, d];
          }
        }
      }
    }
    return [...found.entries()]
      .map(([block, f]) => ({ block, count: f.count, nearest: [f.nearest.x, f.nearest.y, f.nearest.z] as [number, number, number], distance: round(f.d) }))
      .sort((a, b) => a.distance - b.distance);
  }

  private creatures() {
    const p = this.me.position;
    return CREATURES.flatMap((type) => this.ctx.entities.all(type))
      .filter((e) => e.alive)
      .map((e) => ({ type: e.type, distance: round(Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z)), at: [Math.floor(e.position.x), Math.floor(e.position.y), Math.floor(e.position.z)] as [number, number, number] }))
      .filter((c) => c.distance < 24)
      .sort((a, b) => a.distance - b.distance);
  }

  observe(radius = SIGHT, result?: Result): Observation {
    const p = this.me.position;
    const inventory: Record<string, number> = {};
    for (const s of this.me.inventory.slots) if (s) inventory[s.item] = (inventory[s.item] ?? 0) + s.count;
    const held = this.me.inventory.held?.item ?? null;
    const blocks = this.visibleBlocks(radius);
    const creatures = this.creatures();
    const time = this.clock();
    const under = this.ctx.world.blockName(this.ctx.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)));
    const events = [...this.events];
    this.events = [];
    const data = {
      task: this.task.goal,
      position: { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) },
      health: round(this.me.health),
      time,
      inventory,
      held,
      blocks: blocks.slice(0, 16),
      creatures: creatures.slice(0, 8),
      events,
      step: this.steps,
      stepsLeft: this.task.budget.steps - this.steps,
    };
    const lines = [
      `Task: ${this.task.goal}`,
      `Step ${this.steps}/${this.task.budget.steps}. Day ${time.day}, ${time.clock}, ${time.phase}. Health ${data.health}/20.`,
      `You are at (${data.position.x}, ${data.position.y}, ${data.position.z}), standing on ${under}.`,
      `Inventory: ${Object.entries(inventory).map(([k, n]) => `${k} x${n}`).join(', ') || 'empty'}. In hand: ${held ?? 'nothing'}.`,
      `Blocks in sight (type x count, nearest at): ${data.blocks.map((b) => `${b.block} x${b.count} @ (${b.nearest.join(', ')}) ${b.distance}m`).join('; ') || 'none'}.`,
      `Creatures nearby: ${data.creatures.map((c) => `${c.type} ${c.distance}m @ (${c.at.join(', ')})`).join('; ') || 'none'}.`,
      ...(result ? [`Last action: ${result.ok ? 'OK' : 'FAILED'}: ${result.message}`] : []),
      ...(events.length ? [`Since then: ${events.join('; ')}.`] : []),
    ];
    return { text: lines.join('\n'), data };
  }

  // ------------------------------------------------------------------------------------------ acting

  act(action: Action): { observation: Observation; result: Result; done: boolean; grade: ReturnType<MarmEnv['grade']> } {
    if (this.done) {
      const result = { ok: false, message: 'the episode is over' };
      return { observation: this.observe(SIGHT, result), result, done: true, grade: this.grade() };
    }
    this.steps++;
    let result: Result;
    try {
      result = this.perform(action);
    } catch (err) {
      result = { ok: false, message: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!result.ok) this.invalid++;
    const g = this.grade();
    if (g.success || this.steps >= this.task.budget.steps || this.simSeconds >= this.task.budget.seconds) this.done = true;
    return { observation: this.observe(action.type === 'scan' ? 20 : SIGHT, result), result, done: this.done, grade: this.grade() };
  }

  private perform(a: Action): Result {
    switch (a.type) {
      case 'move_to':
        return this.moveTo({ x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) }, 1.2);
      case 'mine':
        return this.mine(a.block, Math.max(1, Math.min(16, Math.floor(a.count ?? 1))));
      case 'dig':
        return this.dig({ x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
      case 'place':
        return this.place(a.item, { x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
      case 'craft':
        return this.craft(a.item, Math.max(1, Math.min(16, Math.floor(a.count ?? 1))));
      case 'smelt':
        return this.smelt(a.item, Math.max(1, Math.min(16, Math.floor(a.count ?? 1))), a.fuel);
      case 'equip':
        return this.equip(a.item);
      case 'attack':
        return this.attack(a.target);
      case 'use':
        return this.use(a.item, { x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
      case 'chat':
        this.chat.push(String(a.message).slice(0, 500));
        return { ok: true, message: 'said' };
      case 'wait': {
        const s = Math.max(1, Math.min(300, Number(a.seconds) || 1));
        this.run(s, () => ({}));
        return { ok: true, message: `waited ${s} s` };
      }
      case 'scan':
        return { ok: true, message: 'looked around (wider view below)' };
      default:
        return { ok: false, message: `unknown action "${(a as { type: string }).type}"` };
    }
  }

  // ------------------------------------------------------------------------------------------ the body's controls

  private eye() {
    const p = this.me.position;
    return { x: p.x, y: p.y + 1.62, z: p.z };
  }

  /** The view that looks at a point: yaw 0 looks toward −z. */
  private aimAt(t: { x: number; y: number; z: number }) {
    const e = this.eye();
    const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  private solid(x: number, y: number, z: number) {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id === 65535 || id < 0) return true;
    const i = this.ctx.world.blockInfo(id);
    return !!i && i.solid;
  }

  private name(c: Cell) {
    return this.ctx.world.blockName(this.ctx.world.getBlock(c.x, c.y, c.z));
  }

  private dangerous(x: number, y: number, z: number) {
    const n = this.ctx.world.blockName(this.ctx.world.getBlock(x, y, z));
    return n === 'lava' || n === 'cactus' || n === 'fire';
  }

  /** A cell a body can stand in: room for feet and head, something solid under it, no lava. */
  private standable(x: number, y: number, z: number) {
    return !this.solid(x, y, z) && !this.solid(x, y + 1, z) && this.solid(x, y - 1, z) && !this.dangerous(x, y, z) && !this.dangerous(x, y - 1, z);
  }

  /** A* over standable cells: steps across, a jump up one, a drop of up to three. Null if there's no way within reach. */
  private path(from: Cell, goal: (c: Cell) => boolean, h: (c: Cell) => number, limit = 6000): Cell[] | null {
    const open: { c: Cell; f: number; g: number }[] = [{ c: from, f: h(from), g: 0 }];
    const came = new Map<string, Cell | null>([[key(from), null]]);
    const cost = new Map<string, number>([[key(from), 0]]);
    let seen = 0;
    while (open.length && seen++ < limit) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { c, g } = open.splice(bi, 1)[0];
      if (goal(c)) {
        const out: Cell[] = [];
        for (let k: Cell | null = c; k; k = came.get(key(k)) ?? null) out.unshift(k);
        return out;
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz;
        const options: Cell[] = [];
        if (this.standable(nx, c.y, nz)) options.push({ x: nx, y: c.y, z: nz });
        else if (this.standable(nx, c.y + 1, nz) && !this.solid(c.x, c.y + 2, c.z)) options.push({ x: nx, y: c.y + 1, z: nz });
        else if (!this.solid(nx, c.y, nz) && !this.solid(nx, c.y + 1, nz)) {
          for (let d = 1; d <= 3; d++) {
            if (this.standable(nx, c.y - d, nz)) {
              options.push({ x: nx, y: c.y - d, z: nz });
              break;
            }
            if (this.solid(nx, c.y - d, nz)) break;
          }
        }
        for (const n of options) {
          const k = key(n);
          const ng = g + 1 + (n.y > c.y ? 0.5 : 0);
          if (ng < (cost.get(k) ?? Infinity)) {
            cost.set(k, ng);
            came.set(k, c);
            open.push({ c: n, g: ng, f: ng + h(n) });
          }
        }
      }
    }
    return null;
  }

  private feet(): Cell {
    const p = this.me.position;
    return { x: Math.floor(p.x), y: Math.floor(p.y + 0.05), z: Math.floor(p.z) };
  }

  /** Walk a path, a cell at a time: face the next cell's middle, hold forward, jump where it's a step up. */
  private walk(cells: Cell[]): Result {
    let stuck = 0;
    for (let i = 1; i < cells.length; i++) {
      const c = cells[i];
      const target = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
      let last = { ...this.me.position };
      let t = 0;
      const up = c.y > cells[i - 1].y;
      const reached = () => Math.hypot(this.me.position.x - target.x, this.me.position.z - target.z) < 0.3 && Math.abs(this.me.position.y - c.y) < 1.2;
      while (!reached() && t < 4) {
        const p = this.me.position;
        const yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
        const moved = Math.hypot(p.x - last.x, p.z - last.z);
        const jump = up || (t > 0.4 && moved < 0.02);
        last = { ...p };
        t += this.run(DT * 2, () => ({ yaw, pitch: 0, down: jump ? ['KeyW', 'Space'] : ['KeyW'], pressed: jump ? ['Space'] : [] }));
        if (!this.me.alive) return { ok: false, message: 'died on the way' };
      }
      if (!reached()) {
        stuck++;
        if (stuck > 2) return { ok: false, message: `stuck near (${this.feet().x}, ${this.feet().y}, ${this.feet().z})` };
      }
    }
    // Come to a stop.
    this.run(0.2, () => ({}));
    return { ok: true, message: `arrived at (${this.feet().x}, ${this.feet().y}, ${this.feet().z})` };
  }

  private moveTo(goal: Cell, within: number): Result {
    const dist = (c: Cell) => Math.hypot(c.x - goal.x, c.y - goal.y, c.z - goal.z);
    if (dist(this.feet()) <= within) return { ok: true, message: 'already there' };
    if (dist(this.feet()) > 64) return { ok: false, message: 'too far: move somewhere within 64 blocks at a time' };
    const p = this.path(this.feet(), (c) => dist(c) <= within, dist);
    if (!p) return { ok: false, message: `no walkable way to (${goal.x}, ${goal.y}, ${goal.z}) found (blocked: dig through, or pick a nearer place)` };
    return this.walk(p);
  }

  /**
   * Stand where the eye can reach a block (within reach), unless it already can. `clear`: a cell the body mustn't be
   * beside (one a block's going into: Minecraft won't place a block where it'd touch the player).
   */
  private approach(b: Cell, clear?: Cell): Result {
    const centre = { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 };
    const away = (c: Cell) => !clear || Math.hypot(c.x - clear.x, c.z - clear.z) >= 2 || c.y >= clear.y + 2 || c.y <= clear.y - 2;
    // (In reach, and in sight from there: the line from the eye to the block's middle meets it first; plants aside.)
    const seen = (c: Cell) => {
      const e = { x: c.x + 0.5, y: c.y + 1.62, z: c.z + 0.5 };
      const d = { x: centre.x - e.x, y: centre.y - e.y, z: centre.z - e.z };
      const l = Math.hypot(d.x, d.y, d.z);
      for (let k = 0, o = e; k < 3; k++) {
        const hit = this.ctx.world.raycast(o, { x: d.x / l, y: d.y / l, z: d.z / l }, REACH + 1);
        if (!hit) return false;
        if (hit.x === b.x && hit.y === b.y && hit.z === b.z) return true;
        if (!this.ctx.world.blockInfo(hit.block)?.plant) return false;
        o = { x: hit.point.x + (d.x / l) * 0.05, y: hit.point.y + (d.y / l) * 0.05, z: hit.point.z + (d.z / l) * 0.05 };
      }
      return false;
    };
    const near = (c: Cell) => Math.hypot(c.x + 0.5 - centre.x, c.y + 1.62 - centre.y, c.z + 0.5 - centre.z) <= REACH - 0.4 && key(c) !== key(b) && key({ ...c, y: c.y + 1 }) !== key(b) && away(c);
    const reach = (c: Cell) => near(c) && seen(c);
    if (reach(this.feet())) {
      this.centre();
      return { ok: true, message: 'in reach' };
    }
    const p = this.path(this.feet(), reach, (c) => Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z));
    if (!p) return { ok: false, message: `can't get within reach of (${b.x}, ${b.y}, ${b.z})` };
    const r = this.walk(p);
    if (r.ok) this.centre();
    return r;
  }

  /** Step onto the middle of the cell the body's in (where `approach` judged the view from). */
  private centre() {
    const f = this.feet();
    const t = { x: f.x + 0.5, z: f.z + 0.5 };
    this.run(1, () => {
      const p = this.me.position;
      const yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      return { yaw, pitch: 0, down: ['KeyW'] };
    }, () => Math.hypot(this.me.position.x - t.x, this.me.position.z - t.z) < 0.12);
    this.run(0.15, () => ({}));
  }

  /** What the eye's line to a block's middle hits first. */
  private lineTo(b: Cell) {
    const e = this.eye();
    const d = { x: b.x + 0.5 - e.x, y: b.y + 0.5 - e.y, z: b.z + 0.5 - e.z };
    const l = Math.hypot(d.x, d.y, d.z);
    return this.ctx.world.raycast(e, { x: d.x / l, y: d.y / l, z: d.z / l }, REACH + 1);
  }

  /** The face of a block the eye sees first (where a click lands), or null if something else is in the way. */
  private sees(b: Cell) {
    const hit = this.lineTo(b);
    return hit && hit.x === b.x && hit.y === b.y && hit.z === b.z ? hit : null;
  }

  /** A plant in the line of sight to a block (grass, a flower) is knocked away first, as a player would; anything else is reported. */
  private clearLine(b: Cell): Result {
    for (let tries = 0; tries < 3 && !this.sees(b); tries++) {
      const hit = this.lineTo(b);
      if (!hit) break;
      const what = this.ctx.world.blockName(hit.block);
      if (!this.ctx.world.blockInfo(hit.block)?.plant) return { ok: false, message: `${what} at (${hit.x}, ${hit.y}, ${hit.z}) is in the way of (${b.x}, ${b.y}, ${b.z}): dig that first` };
      const a2 = this.aimAt({ x: hit.x + 0.5, y: hit.y + 0.3, z: hit.z + 0.5 });
      this.run(1, () => ({ ...a2, buttons: 1, clicked: 1 }), () => this.ctx.world.getBlock(hit.x, hit.y, hit.z) !== hit.block);
    }
    return this.sees(b) ? { ok: true, message: 'in sight' } : { ok: false, message: `can't see (${b.x}, ${b.y}, ${b.z}) from here` };
  }

  private dig(b: Cell): Result {
    const block = this.name(b);
    if (block === 'air' || block === 'water' || block === 'lava') return { ok: false, message: `nothing to dig at (${b.x}, ${b.y}, ${b.z}) (${block})` };
    if (block === 'bedrock') return { ok: false, message: "bedrock can't be broken" };
    const near = this.approach(b);
    if (!near.ok) return near;
    const clear = this.clearLine(b);
    if (!clear.ok) return clear;
    const aim = this.aimAt({ x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 });
    const was = this.ctx.world.getBlock(b.x, b.y, b.z);
    const spent = this.run(30, () => ({ ...aim, buttons: 1, clicked: 1 }), () => this.ctx.world.getBlock(b.x, b.y, b.z) !== was || !this.me.alive);
    if (this.ctx.world.getBlock(b.x, b.y, b.z) === was) return { ok: false, message: `couldn't break ${block} in 30 s` };
    // Gather what dropped: step toward it a moment.
    this.run(0.3, () => ({}));
    const drop = { x: b.x, y: b.y, z: b.z };
    const stand = this.path(this.feet(), (c) => Math.hypot(c.x - drop.x, c.z - drop.z) <= 1 && Math.abs(c.y - drop.y) <= 2, (c) => Math.hypot(c.x - drop.x, c.y - drop.y, c.z - drop.z), 800);
    if (stand && stand.length > 1) this.walk(stand);
    this.run(0.8, () => ({}));
    return { ok: true, message: `broke ${block} at (${b.x}, ${b.y}, ${b.z}) in ${round(spent)} s` };
  }

  private mine(block: string, count: number): Result {
    let got = 0;
    const tried = new Set<string>();
    const notes: string[] = [];
    for (let n = 0; n < count && this.me.alive; n++) {
      const target = this.nearestVisible((name) => name === block || (block === 'log' && name.endsWith('_log')), tried);
      if (!target) {
        notes.push(`no more ${block} in sight`);
        break;
      }
      tried.add(key(target));
      const r = this.dig(target);
      if (r.ok) got++;
      else {
        notes.push(r.message);
        if (notes.length > 3) break;
        n--;
      }
    }
    const msg = `mined ${got} of ${count} ${block}${notes.length ? ` (${notes.join('; ')})` : ''}`;
    return { ok: got > 0, message: msg };
  }

  /** The nearest block in sight that fits, not among `skip`. */
  private nearestVisible(fits: (name: string) => boolean, skip: Set<string>): Cell | null {
    const w = this.ctx.world;
    const p = this.me.position;
    const [px, py, pz] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    let best: Cell | null = null;
    let bd = Infinity;
    const open = (x: number, y: number, z: number) => !this.solid(x, y, z) || w.blockInfo(w.getBlock(x, y, z))?.plant;
    for (let x = px - SIGHT; x <= px + SIGHT; x++) {
      for (let z = pz - SIGHT; z <= pz + SIGHT; z++) {
        for (let y = py - SIGHT_UP; y <= py + SIGHT_UP; y++) {
          const id = w.getBlock(x, y, z);
          if (id <= 0 || id === 65535 || !fits(w.blockName(id)) || skip.has(`${x},${y},${z}`)) continue;
          if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1) || open(x, y, z - 1))) continue;
          const d = Math.hypot(x - p.x, (y - p.y) * 1.5, z - p.z);
          if (d < bd) [best, bd] = [{ x, y, z }, d];
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------ inventory

  private send(msg: Record<string, unknown>) {
    this.h.send({ ...msg, player: this.me.id } as never);
    this.run(DT * 2, () => ({}));
  }

  /** Put an item in hand: into the hotbar if it's behind it, then that slot chosen (its number key). */
  private equip(item: string): Result {
    const inv = this.me.inventory;
    let at = inv.slots.findIndex((s) => s?.item === item);
    if (at < 0) return { ok: false, message: `you have no ${item}` };
    if (at >= 9) {
      const free = inv.slots.slice(0, 9).findIndex((s) => !s);
      const to = free >= 0 ? free : inv.selected;
      this.send({ t: 'inventoryOpen' });
      this.send({ t: 'inventoryMove', from: at, to });
      this.send({ t: 'inventoryClose' });
      at = to;
    }
    this.run(DT * 2, () => ({ pressed: [`Digit${at + 1}`] }));
    return inv.held?.item === item ? { ok: true, message: `holding ${item}` } : { ok: false, message: `couldn't take ${item} in hand` };
  }

  /** Right-click a block's face (to place against it, open it, or use an item on it). */
  private click(b: Cell, face?: { x: number; y: number; z: number }) {
    const t = face ? { x: b.x + 0.5 + face.x * 0.5, y: b.y + 0.5 + face.y * 0.5, z: b.z + 0.5 + face.z * 0.5 } : { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 };
    const aim = this.aimAt(t);
    this.run(DT * 3, () => aim);
    this.run(DT, () => ({ ...aim, buttons: 4, clicked: 4 }));
    this.run(DT * 3, () => aim);
  }

  private place(item: string, c: Cell): Result {
    if (this.solid(c.x, c.y, c.z) && !this.ctx.world.blockInfo(this.ctx.world.getBlock(c.x, c.y, c.z))?.replaceable) return { ok: false, message: `(${c.x}, ${c.y}, ${c.z}) is taken by ${this.name(c)}` };
    const f = this.feet();
    if (c.x === f.x && c.z === f.z && (c.y === f.y || c.y === f.y + 1)) return { ok: false, message: "you're standing there" };
    // Something to place it against: a solid neighbour.
    const sides = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    const against = sides.map(([dx, dy, dz]) => ({ b: { x: c.x + dx, y: c.y + dy, z: c.z + dz }, n: { x: -dx, y: -dy, z: -dz } })).find(({ b }) => this.solid(b.x, b.y, b.z));
    if (!against) return { ok: false, message: 'nothing solid beside that spot to place against' };
    const eq = this.equip(item);
    if (!eq.ok) return eq;
    const near = this.approach(against.b, c);
    if (!near.ok) return near;
    const before = this.name(c);
    this.click(against.b, against.n);
    const now = this.name(c);
    return now !== before && now !== 'air' ? { ok: true, message: `placed ${now} at (${c.x}, ${c.y}, ${c.z})` } : { ok: false, message: `couldn't place ${item} there (aim blocked, or someone's standing in it)` };
  }

  private use(item: string, c: Cell): Result {
    const eq = this.equip(item);
    if (!eq.ok) return eq;
    const near = this.approach(c);
    if (!near.ok) return near;
    const before = JSON.stringify(this.me.inventory.slots);
    const blocks = [-1, 0, 1].map((d) => this.name({ ...c, y: c.y + d })).join();
    const hit = this.sees(c);
    this.click(c, hit?.normal);
    const changed = before !== JSON.stringify(this.me.inventory.slots) || blocks !== [-1, 0, 1].map((d) => this.name({ ...c, y: c.y + d })).join();
    return changed ? { ok: true, message: `used ${item} on (${c.x}, ${c.y}, ${c.z})` } : { ok: false, message: `using ${item} on (${c.x}, ${c.y}, ${c.z}) did nothing` };
  }

  // ------------------------------------------------------------------------------------------ crafting and smelting

  private count(item: string) {
    return this.me.inventory.slots.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
  }

  /** What the agent carries that fits a recipe's ingredient (an item, or a group's member). */
  private fitting(want: string, used: Record<string, number>): string | null {
    for (const s of this.me.inventory.slots) {
      if (!s) continue;
      const ok = want.startsWith('#') ? GROUPS[want]?.(s.item) : s.item === want;
      if (ok && this.count(s.item) - (used[s.item] ?? 0) > 0) return s.item;
    }
    return null;
  }

  /** The grid a recipe needs (2 fits the inventory's 2×2; 3 needs a crafting table) and its cells' ingredients. */
  private layout(r: Recipe): { size: number; cells: (string | null)[] } {
    if (r.shape) {
      const h = r.shape.length, w = r.shape[0].length;
      const size = h <= 2 && w <= 2 ? 2 : 3;
      const cells: (string | null)[] = Array(size * size).fill(null);
      r.shape.forEach((row, y) => [...row].forEach((ch, x) => (cells[y * size + x] = ch === '.' ? null : r.key![ch])));
      return { size, cells };
    }
    const size = r.of!.length <= 4 ? 2 : 3;
    const cells: (string | null)[] = Array(size * size).fill(null);
    r.of!.forEach((want, i) => (cells[i] = want));
    return { size, cells };
  }

  private craft(item: string, count: number): Result {
    const recipes = RECIPES.filter((r) => r.out === item);
    if (!recipes.length) return { ok: false, message: `no recipe makes ${item}` };
    // The first recipe the agent has the ingredients for.
    let chosen: { r: Recipe; size: number; cells: (string | null)[]; items: (string | null)[] } | null = null;
    for (const r of recipes) {
      const { size, cells } = this.layout(r);
      const used: Record<string, number> = {};
      const items = cells.map((want) => {
        if (!want) return null;
        const it = this.fitting(want, used);
        if (it) used[it] = (used[it] ?? 0) + 1;
        return it;
      });
      if (items.every((it, i) => !cells[i] || it)) {
        chosen = { r, size, cells, items };
        break;
      }
    }
    if (!chosen) {
      const need = recipes[0].shape ? Object.values(recipes[0].key!).join(', ') : recipes[0].of!.join(', ');
      return { ok: false, message: `missing ingredients for ${item} (needs ${need}${this.layout(recipes[0]).size === 3 ? ', at a crafting table' : ''})` };
    }
    // Open the grid: the inventory's 2×2, or a crafting table's 3×3 (right-clicked).
    if (chosen.size === 3) {
      const table = this.nearestVisible((n) => n === 'crafting_table', new Set());
      if (!table || Math.hypot(table.x - this.me.position.x, table.z - this.me.position.z) > 16) return { ok: false, message: `${item} needs a crafting table: place one nearby first` };
      const near = this.approach(table);
      if (!near.ok) return near;
      const seen = this.clearLine(table);
      if (!seen.ok) return seen;
      this.click(table, this.sees(table)?.normal);
      if (this.me.container?.slots.length !== 10) return { ok: false, message: `couldn't open the crafting table at (${table.x}, ${table.y}, ${table.z}) from here` };
    } else {
      if (this.me.container) this.send({ t: 'inventoryClose' });
      this.send({ t: 'inventoryOpen' });
      if (this.me.container?.slots.length !== 9) return { ok: false, message: "couldn't open the inventory's crafting grid" };
    }
    const n = chosen.size * chosen.size;
    const before = this.count(item);
    let made = 0;
    for (let k = 0; k < count; k++) {
      // One of each ingredient into its cell, from what's carried.
      // (What's already in the grid has left the inventory: no need to count it off.)
      let ok = true;
      for (let i = 0; i < n; i++) {
        const want = chosen.cells[i];
        if (!want) continue;
        const it = this.fitting(want, {});
        const from = this.me.inventory.slots.findIndex((s) => s?.item === it);
        if (!it || from < 0) {
          ok = false;
          break;
        }
        this.send({ t: 'inventoryMove', from, to: 100 + i, count: 1 });
      }
      const out = this.me.container?.slots[n];
      if (!ok || !out || out.item !== item) break;
      this.send({ t: 'inventoryMove', from: 100 + n, to: -1 });
      made += out.count;
      if (this.count(item) - before >= count) break;
    }
    this.send({ t: 'inventoryClose' });
    const got = this.count(item) - before;
    return got > 0 ? { ok: true, message: `crafted ${got} ${item}` } : { ok: false, message: `crafting ${item} didn't work` };
  }

  private smelt(item: string, count: number, fuel?: string): Result {
    const out = SMELTING[item];
    if (!out) return { ok: false, message: `${item} doesn't smelt into anything` };
    if (this.count(item) < count) return { ok: false, message: `you have only ${this.count(item)} ${item}` };
    const furnace = this.nearestVisible((n) => n === 'furnace' || n === 'furnace_lit', new Set());
    if (!furnace || Math.hypot(furnace.x - this.me.position.x, furnace.z - this.me.position.z) > 16) return { ok: false, message: 'no furnace nearby: place one first' };
    const fuels = this.me.inventory.slots.filter((s): s is ItemStack => !!s && fuelTime(s.item) > 0 && s.item !== item).map((s) => s.item);
    const burn = fuel && this.count(fuel) ? fuel : fuels[0];
    if (!burn) return { ok: false, message: 'no fuel (coal, charcoal, wood) to burn' };
    const near = this.approach(furnace);
    if (!near.ok) return near;
    const seen = this.clearLine(furnace);
    if (!seen.ok) return seen;
    this.click(furnace, this.sees(furnace)?.normal);
    const box = this.me.container;
    if (!box || box.slots.length !== 3) return { ok: false, message: "couldn't open the furnace" };
    const slot = (it: string) => this.me.inventory.slots.findIndex((s) => s?.item === it);
    this.send({ t: 'inventoryMove', from: slot(item), to: 100, count });
    const fuelNeeded = Math.max(1, Math.ceil((count * 10) / fuelTime(burn)));
    this.send({ t: 'inventoryMove', from: slot(burn), to: 101, count: Math.min(fuelNeeded, this.count(burn)) });
    const before = this.count(out);
    // Cooking: ten seconds an item, the world going on meanwhile.
    this.run(count * 10 + 2, () => ({}), () => (box.slots[2]?.count ?? 0) >= count || !this.me.alive);
    if (box.slots[2]) this.send({ t: 'inventoryMove', from: 102, to: -1 });
    // (What wasn't used comes back.)
    if (box.slots[0]) this.send({ t: 'inventoryMove', from: 100, to: -1 });
    if (box.slots[1]) this.send({ t: 'inventoryMove', from: 101, to: -1 });
    this.send({ t: 'inventoryClose' });
    const got = this.count(out) - before;
    return got > 0 ? { ok: true, message: `smelted ${got} ${out}` } : { ok: false, message: `nothing came out of the furnace` };
  }

  // ------------------------------------------------------------------------------------------ fighting

  private attack(target?: string): Result {
    const p = this.me.position;
    const pick = this.creatures().find((c) => !target || c.type === target);
    if (!pick) return { ok: false, message: target ? `no ${target} nearby` : 'no creature nearby' };
    const e = this.ctx.entities.all(pick.type).filter((x) => x.alive).sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
    let t = 0;
    let swings = 0;
    while (e.alive && this.me.alive && t < 20) {
      const d = Math.hypot(e.position.x - this.me.position.x, e.position.z - this.me.position.z);
      const aim = this.aimAt({ x: e.position.x, y: e.position.y + 1, z: e.position.z });
      if (d > 2.5) {
        t += this.run(DT * 3, () => ({ ...aim, down: ['KeyW'] }));
        continue;
      }
      t += this.run(DT, () => ({ ...aim, buttons: 1, clicked: 1 }));
      swings++;
      t += this.run(0.6, () => aim);
    }
    return !e.alive ? { ok: true, message: `killed the ${pick.type} (${swings} swings)` } : { ok: false, message: `the ${pick.type} is still alive after ${round(t)} s` };
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
