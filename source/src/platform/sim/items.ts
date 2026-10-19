import type { AtlasPixels, GameContext, GameEvents, ItemApi, ItemDefinition, ItemStack, InventoryApi, Pickup, Player, Vec3 } from '../api/types';
import type { Content } from '../content';
import type { Presentation } from './present';
import type { ItemKind } from '../api/items';

export interface ItemServices {
  ctx(): GameContext;
  emit<K extends keyof GameEvents>(event: K, e: GameEvents[K]): void;
  players(): readonly Player[];
  isSolid(x: number, y: number, z: number): boolean;
  /**
   * A solid prop just under a point (within `depth`): which, and the height of its surface there;
   * and where a point on one is now (null once it's gone or no longer solid).
   */
  propUnder(p: Vec3, depth: number): { id: number; surface: number } | null;
  onProp(id: number, at: Vec3, out: Vec3): Vec3 | null;
  /** A world point in a prop's own space (to ride on it). */
  propLocal(id: number, at: Vec3): Vec3 | null;
  /** Item definitions and atlases, for the client's icons and meshes. */
  content: Content;
  /** Sounds and toasts for the player who picks something up. */
  present: Presentation;
  /** The game's running item kinds (`items.kind`). */
  kind(name: string): ItemKind | null;
  /** Whether a player picks things up (one playing by items: a builder in creative doesn't). Default: everyone. */
  collects?(player: Player): boolean;
}

/** One pickup as the client draws it. */
export interface PickupFrame {
  id: number;
  item: string;
  x: number;
  y: number;
  z: number;
  /** Resting on the ground (it bobs). */
  settled: boolean;
  beam?: string;
}

export class Inventory implements InventoryApi {
  readonly slots: (ItemStack | null)[] = new Array(9).fill(null);
  selected = 0;
  /** How many of the slots, from the first, are the hotbar (what's chosen from and shown on the HUD); 0: all of them. */
  bar = 0;
  onChange: (() => void) | null = null;
  /** Each carried item's state, as its kind keeps it (`ItemKind.state`: a gun's rounds; a fresh one comes full). */
  private states = new Map<string, object>();

  constructor(
    private defs: Map<string, ItemDefinition>,
    /** The game's item kinds, by kind (`items`). */
    private kinds: ReadonlyMap<string, ItemKind> = new Map(),
  ) {}

  get capacity(): number {
    return this.slots.length;
  }

  /** How many slots they carry (`bar` of them the hotbar, from the first; 0: all): Minecraft's is 36, 9 the hotbar. */
  setCapacity(count: number, bar = 0) {
    if (!Number.isInteger(count) || count < 1 || count > 256) throw new Error(`inventory.setCapacity: invalid capacity ${count}`);
    this.bar = bar > 0 && bar < count ? Math.floor(bar) : 0;
    const previous = this.slots.length;
    this.slots.length = count;
    for (let i = previous; i < count; i++) this.slots[i] = null;
    this.selected = Math.min(this.selected, (this.bar || count) - 1);
    this.forget();
    this.onChange?.();
  }

  def(item: string): ItemDefinition | undefined {
    return this.defs.get(item);
  }

  private kindOf(item: string): ItemKind | undefined {
    const d = this.defs.get(item);
    return d ? this.kinds.get(d.kind) : undefined;
  }

  get held(): ItemStack | null {
    return this.slots[this.selected];
  }

  private max(item: string): number {
    return this.defs.get(item)?.stack ?? this.kindOf(item)?.stack ?? 64;
  }

  state<S extends object = Record<string, unknown>>(item: string): S | null {
    if (this.count(item) === 0) return null;
    let st = this.states.get(item);
    if (!st) {
      const def = this.defs.get(item);
      const k = this.kindOf(item);
      if (!def || !k?.state) return null;
      this.states.set(item, (st = k.state(def, item)));
    }
    return st as S;
  }

  /** Items no longer carried lose their state (given again, a gun comes full). */
  private forget() {
    for (const item of [...this.states.keys()]) if (this.count(item) === 0) this.states.delete(item);
  }

  give(item: string, count = 1): number {
    let left = count;
    const max = this.max(item);
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.item === item && s.count < max) {
        const n = Math.min(max - s.count, left);
        s.count += n;
        left -= n;
      }
    }
    // Full inventory: a better weapon replaces the weakest weapon of lower rank (kinds that `upgrade`).
    const def = this.defs.get(item);
    const upgrades = !!this.kindOf(item)?.upgrades;
    if (left > 0 && def && upgrades && !this.slots.includes(null)) {
      let worst = -1;
      let worstRank = def.rank ?? 0;
      this.slots.forEach((s, i) => {
        const d = s ? this.defs.get(s.item) : undefined;
        if (d && d.kind === def.kind && (d.rank ?? 0) < worstRank) {
          worstRank = d.rank ?? 0;
          worst = i;
        }
      });
      if (worst >= 0) this.slots[worst] = null;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, left);
        this.slots[i] = { item, count: n };
        left -= n;
        // Auto-equip strictly better weapons.
        const def = this.defs.get(item);
        const cur = this.held ? this.defs.get(this.held.item) : undefined;
        if (def && upgrades && (!cur || (def.rank ?? 0) > (cur.rank ?? 0))) this.selected = i;
      }
    }
    this.onChange?.();
    return left;
  }

  take(item: string, count = 1): boolean {
    if (this.count(item) < count) return false;
    let left = count;
    // From the stack in hand first (placing blocks, eating), then from the end of the hotbar.
    const order = [this.selected, ...Array.from({ length: this.slots.length }, (_, i) => this.slots.length - 1 - i)].filter((v, i, a) => a.indexOf(v) === i);
    for (const i of order) {
      if (left <= 0) break;
      const s = this.slots[i];
      if (s && s.item === item) {
        const n = Math.min(s.count, left);
        s.count -= n;
        left -= n;
        if (s.count === 0) this.slots[i] = null;
      }
    }
    this.forget();
    this.onChange?.();
    return true;
  }

  count(item: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  set(slot: number, stack: ItemStack | null) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slots.length) throw new Error(`inventory.set: no slot ${slot} (0 to ${this.slots.length - 1})`);
    if (stack && !this.defs.has(stack.item)) throw new Error(`inventory.set: unknown item "${stack.item}"`);
    const count = stack ? Math.min(this.max(stack.item), Math.floor(stack.count)) : 0;
    this.slots[slot] = stack && count > 0 ? { item: stack.item, count, ...(stack.wear ? { wear: stack.wear } : {}) } : null;
    this.forget();
    this.onChange?.();
  }

  /** How many of an item a slot holds at most. */
  most(item: string): number {
    return this.max(item);
  }

  /** A whole stack given (its wear with it, a tool's): into a slot with more of the same, else the first empty one. Returns what didn't fit. */
  giveStack(stack: ItemStack): number {
    if (!stack.wear) return this.give(stack.item, stack.count);
    const at = this.slots.indexOf(null);
    if (at < 0) return stack.count;
    this.slots[at] = { ...stack };
    this.onChange?.();
    return 0;
  }

  select(slot: number) {
    const n = this.bar || this.slots.length;
    this.selected = ((slot % n) + n) % n;
    this.onChange?.();
  }

  /** A stack (or `count` of it) from one slot to another: added to more of the same there (what won't fit stays), else the two swapped. */
  move(from: number, to: number, count?: number) {
    const n = this.slots.length;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n || from === to) return;
    const [a, b] = moveStacks(this.slots[from], this.slots[to], (item) => this.max(item), count);
    this.slots[from] = a;
    this.slots[to] = b;
    this.onChange?.();
  }

  /**
   * The next slot with something in it (`by` of them on, or back for a negative), round the end.
   */
  cycle(by: number) {
    const reach = this.bar || this.slots.length;
    let at = this.selected;
    for (let n = Math.abs(by); n > 0; n--) {
      for (let i = 1; i <= reach; i++) {
        const s = (((at + Math.sign(by) * i) % reach) + reach) % reach;
        if (this.slots[s] || i === reach) {
          at = s;
          break;
        }
      }
    }
    this.select(at);
  }

  clear() {
    this.slots.fill(null);
    this.selected = 0;
    this.states.clear();
    this.onChange?.();
  }
}

/**
 * A stack (or `count` of it) from one place to another, as Minecraft's inventory moves them: onto more of
 * the same (as many as fit; a tool, worn, never stacks), into an empty place, or (all of it) swapped with
 * what's there. Returns what's left in each place.
 */
export function moveStacks(from: ItemStack | null, to: ItemStack | null, most: (item: string) => number, count?: number): [ItemStack | null, ItemStack | null] {
  if (!from) return [from, to];
  const n = Math.max(1, Math.min(from.count, Math.floor(count ?? from.count)));
  const same = to && to.item === from.item && !to.wear && !from.wear;
  if (!to || same) {
    const room = to ? Math.max(0, most(from.item) - to.count) : most(from.item);
    const moved = Math.min(room, n);
    if (moved <= 0) return [from, to];
    const left = from.count - moved;
    return [left > 0 ? { ...from, count: left } : null, to ? { ...to, count: to.count + moved } : { ...from, count: moved }];
  }
  // (Something else there: swapped, but only a whole stack.)
  return n === from.count ? [to, from] : [from, to];
}

class PickupImpl implements Pickup {
  readonly vel: Vec3;
  age = 0;
  settled = false;
  /** Resting on a solid prop: which, and where on it. */
  ride: { id: number; local: Vec3 } | null = null;
  removed = false;
  collectT = -1;
  constructor(
    readonly id: number,
    readonly item: string,
    /** How many (fewer, once some were taken by someone with room for only some). */
    public count: number,
    readonly pos: Vec3,
    readonly despawn: number,
    readonly beam: string | undefined,
    velocity: Vec3 | undefined,
    private onRemove: (p: PickupImpl) => void,
    /** The only player who can take it (their id), if it's theirs. */
    readonly owner: string | null = null,
    /** Seconds before anyone can take it. */
    readonly delay = 0.5,
    /** Who threw it (their id): not pulled back to them until they've been out of its reach. */
    public from: string | null = null,
    /** How worn it is (a tool's uses so far): kept when it's picked up again. */
    readonly wear = 0,
  ) {
    this.vel = { x: velocity?.x ?? 0, y: velocity?.y ?? 0, z: velocity?.z ?? 0 };
  }
  get position(): Vec3 {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }
  get alive(): boolean {
    return !this.removed;
  }
  remove() {
    if (!this.removed) {
      this.removed = true;
      this.onRemove(this);
    }
  }
}

/**
 * Items on the simulation side: definitions, pickups falling, settling, pulling toward the
 * nearest player and being collected. The client draws them from `frame()`.
 */
export class ItemSim implements ItemApi {
  readonly defs = new Map<string, ItemDefinition>();
  private pickups: PickupImpl[] = [];
  private nextId = 1;

  constructor(private s: ItemServices) {}

  define(id: string, def: ItemDefinition) {
    this.defs.set(id, def);
    this.s.content.defineItem(id, def);
  }

  get(id: string): ItemDefinition | undefined {
    return this.defs.get(id);
  }

  kind<K extends ItemKind = ItemKind>(name: string): K | null {
    return this.s.kind(name) as K | null;
  }

  /** Ids of the defined items. */
  ids(): string[] {
    return [...this.defs.keys()];
  }

  atlas(name: string, source: HTMLCanvasElement | OffscreenCanvas | AtlasPixels) {
    this.s.content.defineAtlas(name, source);
  }

  spawnPickup(item: string, at: Vec3, opts: { count?: number; velocity?: Vec3; beam?: string; despawn?: number; for?: Player; delay?: number; from?: Player; wear?: number } = {}): Pickup {
    if (!this.defs.has(item)) throw new Error(`items.spawnPickup: unknown item "${item}"`);
    const p = new PickupImpl(
      this.nextId++,
      item,
      opts.count ?? 1,
      { x: at.x, y: at.y, z: at.z },
      opts.despawn ?? 90,
      opts.beam,
      opts.velocity,
      (x) => this.pickups.splice(this.pickups.indexOf(x), 1),
      opts.for?.id ?? null,
      opts.delay ?? 0.5,
      opts.from?.id ?? null,
      opts.wear ?? 0,
    );
    this.pickups.push(p);
    return p;
  }

  clearPickups() {
    for (const p of [...this.pickups]) p.remove();
  }

  update(dt: number, running: boolean) {
    if (!running) return;
    const ctx = this.s.ctx();
    const players = this.s.players();
    for (const p of [...this.pickups]) {
      p.age += dt;
      if (p.age > p.despawn) {
        p.remove();
        continue;
      }
      // Resting on a solid prop: where it's gone (or falling, once it's gone).
      if (p.settled && p.ride && !this.s.onProp(p.ride.id, p.ride.local, p.pos)) {
        p.ride = null;
        p.settled = false;
      }
      // Fall and settle 0.3 above the ground (or a solid prop's deck, riding it).
      if (!p.settled) {
        const was = p.pos.y;
        p.vel.y -= 22 * dt;
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += p.vel.z * dt;
        p.vel.x *= Math.exp(-2 * dt);
        p.vel.z *= Math.exp(-2 * dt);
        const deck = this.s.propUnder({ x: p.pos.x, y: Math.max(was, p.pos.y), z: p.pos.z }, Math.max(was, p.pos.y) - p.pos.y + 0.3);
        if (deck) {
          p.pos.y = deck.surface + 0.3;
          const local = this.s.propLocal(deck.id, p.pos);
          p.ride = local && { id: deck.id, local };
          p.vel.x = p.vel.y = p.vel.z = 0;
          p.settled = true;
        } else if (this.s.isSolid(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.3), Math.floor(p.pos.z))) {
          p.pos.y = Math.floor(p.pos.y - 0.3) + 1.3;
          p.vel.x = p.vel.y = p.vel.z = 0;
          p.settled = true;
        }
      }
      if (p.age <= p.delay || p.collectT >= 0) continue;
      // Pulled toward the nearest living player in reach (its owner, if it has one here), then
      // collected.
      const owner = p.owner !== null && players.some((pl) => pl.id === p.owner) ? p.owner : null;
      let who: Player | null = null;
      let d = 3.2;
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (const pl of players) {
        if (!pl.alive || pl.spectating || (owner !== null && pl.id !== owner) || (this.s.collects && !this.s.collects(pl))) continue;
        const q = pl.position;
        const ex = q.x - p.pos.x;
        const ey = q.y + 0.9 - p.pos.y;
        const ez = q.z - p.pos.z;
        const e = Math.hypot(ex, ey, ez);
        // Its thrower, until they've stepped out of its reach once.
        if (pl.id === p.from) {
          if (e < 3.2) continue;
          p.from = null;
        }
        if (e < d) {
          d = e;
          who = pl;
          dx = ex;
          dy = ey;
          dz = ez;
        }
      }
      if (!who) continue;
      const step = Math.min(d, dt * 9);
      p.pos.x += (dx / d) * step;
      p.pos.y += (dy / d) * step;
      p.pos.z += (dz / d) * step;
      p.settled = false;
      p.ride = null;
      p.vel.x = p.vel.y = p.vel.z = 0;
      if (d < 1.1) this.collect(p, ctx, who);
    }
  }

  private collect(p: PickupImpl, ctx: GameContext, player: Player) {
    const def = this.defs.get(p.item);
    if (!def) return p.remove();
    // Consumed on touch: the item's `onPickup` does its own thing (and sound).
    if (!def.onPickup?.(ctx, p.count, player)) {
      const left = p.wear ? player.inventory.giveStack({ item: p.item, count: p.count, wear: p.wear }) : player.inventory.give(p.item, p.count);
      if (left === p.count) return; // inventory full: leave it
      this.s.present.audio(player.id).play('pickup');
      const took = p.count - left;
      player.hud.toast(`+${took > 1 ? `${took} ` : ''}${def.name}`);
      // (Room for only some: the rest stays where it lies.)
      if (left > 0) {
        p.count = left;
        this.s.emit('pickup', { player, item: p.item, count: took });
        return;
      }
    }
    this.s.emit('pickup', { player, item: p.item, count: p.count });
    p.remove();
  }

  frame(): PickupFrame[] {
    return this.pickups.map((p) => ({ id: p.id, item: p.item, x: p.pos.x, y: p.pos.y, z: p.pos.z, settled: p.settled, beam: p.beam }));
  }
}
