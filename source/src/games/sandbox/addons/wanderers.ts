import { Models, type CharacterLook, type Entity, type GameContext, type ModelSpec, type Player } from '@platform';
import { crowdMotion, type CrowdOptions } from './motion/crowd';

/**
 * Who's shut in somewhere (down a dungeon): for them, being close by isn't enough for one of the crowd to have a body, only being
 * in their view. So the street over a crypt isn't kept walking for someone under it who can't see it. Those down there with them
 * (under cover themselves) are close by as ever; and those up in the open that they can see keep their bodies as anyone in view
 * does. Nobody's made anew for it: a body let go is the same row, walking on on paper, and the same person when they're next seen;
 * let go and brought back a few at a time. A game says who's shut in (`wanderersShutIn`); with nothing said, nobody is.
 */
const shutIn = new WeakMap<GameContext, (p: Player) => boolean>();
export const wanderersShutIn = (game: GameContext, who: (p: Player) => boolean) => void shutIn.set(game, who);
/** Eyes besides the players' own that the crowd's there for (somewhere seen through a portal): a game says where they are, each look. */
const alsoSeen = new WeakMap<GameContext, (p: Player) => { x: number; y: number; z: number }[]>();
export const wanderersAlsoSeen = (game: GameContext, eyes: (p: Player) => { x: number; y: number; z: number }[]) => void alsoSeen.set(game, eyes);

/**
 * How thick the crowd is at a place, 0 to 1 (a game says: fewer where it's dangerous, hardly any where nobody goes). Each of the
 * crowd has a number of their own; they're given a body only where the place's is over it. With nothing said, 1 everywhere.
 */
const thick = new WeakMap<GameContext, (x: number, z: number) => number>();
export const wanderersDensity = (game: GameContext, of: (x: number, z: number) => number) => void thick.set(game, of);
/**
 * The crowd's bodies, for another part of the game that has something for them to do (a fight, a creature to tame): who's about
 * (`rows`, each a row's number; `body`, `rowOf`), one taken in hand (`hold`: the crowd's own walking leaves them be till they're
 * let go), one away from their keyboard or back (`away`), and one gone for a while (`out`: their body goes, and they aren't
 * given another for so many seconds: killed, and come back later).
 */
export interface CrowdLife { rows(): readonly number[]; body(i: number): Entity | null; rowOf(e: Entity): number | undefined; hold(i: number, on: boolean): void; held(i: number): boolean; away(i: number, on: boolean): void; /** Crouched, as a player crouches (seen so on every screen), or up again. */ crouch(i: number, on: boolean): void; out(i: number, seconds: number): void; name(i: number): string }
const lives = new WeakMap<GameContext, CrowdLife>();
export const crowdLife = (game: GameContext): CrowdLife | undefined => lives.get(game);

/** One of the crowd (an entity, by `id`) is away from their keyboard, or back (`on`); or, to someone joining, all who are (`ids`). */
export const AFK_MESSAGE = 'sandbox.crowd.afk';
/** One of the crowd (an entity, by `id`) is crouched, or up again (`on`); or, to someone joining, all who are (`ids`). Each screen draws them so (`client/life.ts`). */
export const CROUCH_MESSAGE = 'sandbox.crowd.crouch';

/**
 * Wanderers: an add-on that peoples a world with a crowd strolling about aimlessly, thousands of
 * them for the cost of the ones in sight.
 *
 * Everyone in the crowd is a row in a handful of flat arrays (where they are, which way they're
 * heading, what they're up to): a walk on paper, moved along twice a second, costing next to
 * nothing each. A row is one person for good: their name, their face and clothes and their height
 * are their row's, so whoever walks out of sight is the one who walks back in.
 *
 * Those a person could see are **loaded**: given a body among the engine's entities, where its
 * physics walks them over the real ground with everything else it steps. That's everyone close by
 * (`near`: but not to someone shut in underground, `wanderersShutIn`), and everyone out to `sight` with a clear line to somebody's eyes. The rest are rows:
 * the ones behind a hill or a wall, and the ones too far off to make out. As people move, bodies
 * left out of sight are **unloaded** back to rows (their walk goes on from where it was), and the
 * ones coming into view are loaded in.
 *
 * The crowd lives on a square of ground that repeats across the world (`area` on a side), so an
 * endless world is peopled as thickly everywhere without anyone to keep track of beyond the one
 * square: wherever a person walks, the same crowd is about.
 *
 * It keeps to itself: it listens to the game's events and its clock, and nothing else knows of it.
 * To take it out, drop it from `addons/index.ts`. In play: `/bots off`, `/bots on`, `/bots 3000`
 * (how many there are), `/bots sight 200` (how far off they're seen) and `/bots live 300` (the
 * most bodies at once).
 */
export interface WanderersOptions {
  /** Whether they're about from the start (`/bots on` and `/bots off` change it in play). Default true. */
  enabled?: boolean;
  /** How many are in the crowd. Default 2500. */
  count?: number;
  /** The side of the square of ground the crowd lives on, which repeats across the world (blocks). Default 1024. */
  area?: number;
  /** How near a person someone has a body whether or not they're in view (blocks). Default 40. */
  near?: number;
  /** How far off someone in view has a body (blocks): past it they're too far to make out. Default 160. */
  sight?: number;
  /** The most bodies loaded at once (the nearest keep theirs). Default 320. */
  live?: number;
  /** How many different people there are to look like (the platform's characters, made up at random). Default 48. */
  looks?: number;
  /** Bodies to look like instead (a skins add-on's): each row wears one of them. */
  people?: readonly ModelSpec[];
  /**
   * How they behave: `crowd`, as people in a social venue do (standing about in groups, walking now
   * and then to someone or somewhere near: `motion/crowd.ts`), or `wander`, strolling aimlessly
   * (the first way they had, kept to compare). Default `crowd`; `/bots model` changes it in play.
   */
  motion?: MotionName;
  crowd?: CrowdOptions;
  /** How near a person their name shows over their head (blocks). Default 64, as Minecraft has it. */
  nameRange?: number;
  /** Those whose body is fitted for what they wear: which fit a row's is (`of`: a short name, or '' for their look as it is), and each look in a fit (`model`, by the look's number in `people`). */
  fit?: { of(i: number): string; model(k: number, fit: string): ModelSpec };
  /** One of them's been given a body (row `i` of the crowd, the same person each time): for whoever dresses them. */
  onBody?(i: number, body: Entity): void;
  /** What they're called, a row each in order (a list of usernames); past its end, and without one, names are made up. */
  names?: readonly string[];
}

export type MotionName = 'crowd' | 'wander';

export interface Wanderers {
  readonly enabled: boolean;
  /** How many are in the crowd, and how many of them are loaded now. */
  readonly count: number;
  readonly loaded: number;
  setEnabled(on: boolean): void;
  setCount(n: number): void;
  /** How far off someone in view has a body (blocks). */
  setSight(blocks: number): void;
  /** The most bodies loaded at once. */
  setLive(n: number): void;
  /** How they behave (see `WanderersOptions.motion`). */
  readonly motion: MotionName;
  setMotion(name: MotionName): void;
  /** Take the add-on out of the game: its bodies go, its timers and listeners stop. */
  dispose(): void;
}

const MAX_COUNT = 10000;
const MAX_LIVE = 480;
/** How often the loaded are steered, the rest are moved along, and who's loaded is looked at again (seconds). */
const STEER = 0.1;
const DRIFT = 0.5;
const SCAN = 0.5;
/** How many are loaded in one look (their figures are built on each screen as they appear: not all at once). */
const LOADS = 12;
/** How many of those out of view are unloaded in one look: a street let go at once (someone gone down a dungeon) goes a few at a time. */
const UNLOADS = 8;
/** How many rows out of sight are tried for a line of sight in one look (the rest wait their turn). */
const RAYS = 96;
/** How much further off than a distance they were loaded at they're unloaded (so nobody flickers at the edge). */
const SLACK = 16;
/** How long a body stays once it's out of view (seconds): someone passing behind a tree isn't gone. */
const LINGER = 4;
const SPEED = 2.6;
const IDLE = 1;

const SKIN = ['#f1c9a5', '#e0a882', '#c68a5f', '#a86b43', '#7d4a2b', '#5a3420'];
const HAIR = ['#1c1410', '#3b2619', '#6b4423', '#a5682a', '#d8b46a', '#b03a2a', '#8a8f96', '#e8e4dc', '#3f6fb8', '#b84f9a'];
const CLOTH = ['#2a8f8a', '#c23a30', '#2f5fb8', '#e0a030', '#4f9a4a', '#7a4fb0', '#e8e4dc', '#30343c', '#d8688a', '#3d5f8f', '#8a5a34', '#5fb0d8'];
const DARK = ['#222226', '#3d5f8f', '#4a3a2c', '#30343c', '#5a5f66', '#2c3a2a', '#6b4423'];
// (41 by 37: no two rows share a name until there are over 1,500 of them.)
const FIRST = ['Juniper', 'Moss', 'Pebble', 'Bramble', 'Clover', 'Wren', 'Thistle', 'Fennel', 'Sorrel', 'Tansy', 'Rook', 'Hazel', 'Alder', 'Sage', 'Finch', 'Marlow', 'Briar', 'Linden', 'Lark', 'Sedge', 'Rowan', 'Yarrow', 'Birch', 'Heron', 'Nettle', 'Poppy', 'Reed', 'Tarn', 'Vetch', 'Willow', 'Ash', 'Burdock', 'Cress', 'Dove', 'Elm', 'Fern', 'Gorse', 'Ivy', 'Kestrel', 'Laurel', 'Myrtle'];
const LAST = ['Underhill', 'Fairweather', 'Greenway', 'Holloway', 'Longmeadow', 'Marshbank', 'Oakhurst', 'Pennywhistle', 'Quickwater', 'Ridgeback', 'Stonebridge', 'Thornbury', 'Wainwright', 'Yellowfield', 'Ambleside', 'Brookfield', 'Coldharbour', 'Dunmore', 'Eastlake', 'Foxglove', 'Gladwell', 'Hartley', 'Inglewood', 'Kingsley', 'Lockwood', 'Merriweather', 'Northcote', 'Orchard', 'Pinecroft', 'Ravenscroft', 'Sandiford', 'Tidewell', 'Upfold', 'Vance', 'Westbrook', 'Ashdown', 'Blackwood'];

export function wanderers(game: GameContext, options: WanderersOptions = {}): Wanderers {
  const rng = game.rng;
  const area = Math.max(128, options.area ?? 1024);
  const near = Math.max(8, Math.min(area / 4, options.near ?? 40));
  const tagged2 = (options.nameRange ?? 64) ** 2;
  const called = options.names ?? [];
  const bodies = options.people?.length ? options.people : null;
  const looks = bodies ? bodies.length : Math.max(1, options.looks ?? 48);
  /** How tall a body is (a box figure in a skin is a little shorter than a character). */
  const tall = bodies ? 1.8 : 1.9;
  let enabled = options.enabled ?? true;
  let budget = Math.max(0, Math.min(MAX_LIVE, options.live ?? 320));
  let sight = 0;
  const setSight = (blocks: number) => (sight = Math.max(near, Math.min(area / 2 - SLACK, blocks)));
  setSight(options.sight ?? 160);

  // Who there is to look like: ordinary people, each a type of entity of its own. A row's is its number's.
  /** The rows whose body is fitted (`options.fit`), and how: each look in each fit that's worn is a type of its own beside the usual one. */
  const fitRows = new Map<number, string>();
  if (options.fit && bodies) for (let i = 0; i < MAX_COUNT; i++) if (options.fit.of(i)) fitRows.set(i, options.fit.of(i));
  const type = (i: number) => (fitRows.has(i) ? `wanderer_${i % looks}_${fitRows.get(i)}` : `wanderer_${i % looks}`);
  const nameOf = (i: number) => called[i] ?? `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
  const sizeOf = (i: number) => 0.92 + ((i * 7919) % 14) / 100;
  for (let k = 0; k < looks; k++) {
    game.entities.define(`wanderer_${k}`, { name: 'Wanderer', model: bodies ? bodies[k] : Models.character(randomLook()), hitbox: { width: 0.6, height: tall }, health: 20, speed: SPEED, invulnerable: true });
    // (And its fitted builds, where someone of that look wears what's cut close.)
    const worn = new Set<string>();
    for (const [i, fit] of fitRows) if (i % looks === k) worn.add(fit);
    for (const fit of worn) game.entities.define(`wanderer_${k}_${fit}`, { name: 'Wanderer', model: options.fit!.model(k, fit), hitbox: { width: 0.6, height: tall }, health: 20, speed: SPEED, invulnerable: true });
  }

  function randomLook(): CharacterLook {
    const top = rng.pick(CLOTH);
    return {
      build: rng.pick(['slim', 'slim', 'broad', 'broad', 'heavy'] as const),
      curvy: rng.chance(0.4),
      skin: rng.pick(SKIN),
      hair: rng.pick(['short', 'crew', 'buzz', 'slick', 'swept', 'long', 'pomp', 'bob', 'pony', 'bun', 'afro', 'mohawk', 'bald'] as const),
      hairColor: rng.pick(HAIR),
      facialHair: rng.chance(0.25) ? rng.pick(['stubble', 'moustache', 'goatee', 'beard'] as const) : 'none',
      face: rng.chance(0.4) ? rng.pick(['lashes', 'lipstick', 'freckles', 'shades', 'specs'] as const) : 'plain',
      top: rng.pick(['tee', 'shirt', 'hoodie', 'sweater', 'suit', 'jacket', 'track', 'camp', 'aloha', 'tank'] as const),
      topColor: top,
      accent: rng.pick(CLOTH.filter((c) => c !== top)),
      bottom: rng.pick(['trousers', 'jeans', 'shorts', 'skirt', 'joggers'] as const),
      bottomColor: rng.pick(DARK),
      shoes: rng.pick(['sneakers', 'shoes', 'boots', 'flats'] as const),
      shoeColor: rng.pick(DARK),
      hat: rng.chance(0.15) ? rng.pick(['fedora', 'cap'] as const) : 'none',
    };
  }

  // The crowd, a row each: where on the square (0..area), the way they're heading (radians about y)
  // and how fast that's drifting, how long what they're doing lasts, how long they've been stuck,
  // and (with a body) how long they've been out of everyone's view.
  let count = 0;
  let px = new Float32Array(0);
  let pz = new Float32Array(0);
  let heading = new Float32Array(0);
  let turn = new Float32Array(0);
  let left = new Float32Array(0);
  let stuck = new Float32Array(0);
  let hidden = new Float32Array(0);
  let flags = new Uint8Array(0);
  /** The body of each one loaded (by row), and the rows that have one. */
  let body: (Entity | null)[] = [];
  let live: number[] = [];
  /** Whose names each person has over their heads on their screen (rows). */
  const tags = new Map<string, { player: Player; rows: Set<number> }>();
  /** Where the rows out of sight are tried from next (see `RAYS`). */
  let cursor = 0;

  const wrap = (v: number) => ((v % area) + area) % area;

  // Those away from their keyboards (their bodies' ids), as every screen's told: they stand stock still there (`client/life.ts`).
  const afkIds = new Set<number>();
  function away(i: number, on: boolean) {
    const e = body[i];
    if (!e) return;
    // (An id comes round again: one who's here is said so only if the last with that id wasn't.)
    if (on ? !afkIds.has(e.id) : afkIds.has(e.id)) game.clients.send('all', AFK_MESSAGE, { id: e.id, on });
    if (on) afkIds.add(e.id);
    else afkIds.delete(e.id);
  }
  game.events.on('playerJoin', ({ player }) => afkIds.size && game.clients.send(player, AFK_MESSAGE, { ids: [...afkIds] }));
  // Those crouched (their bodies' ids), as every screen's told: drawn as a player crouching is.
  const lowIds = new Set<number>();
  function crouch(i: number, on: boolean) {
    const e = body[i];
    if (!e) return;
    if (on === lowIds.has(e.id)) return;
    game.clients.send('all', CROUCH_MESSAGE, { id: e.id, on });
    if (on) lowIds.add(e.id);
    else lowIds.delete(e.id);
  }
  game.events.on('playerJoin', ({ player }) => lowIds.size && game.clients.send(player, CROUCH_MESSAGE, { ids: [...lowIds] }));

  let motion: MotionName = options.motion ?? 'crowd';
  /** Those taken in hand by something else (`CrowdLife.hold`): the crowd's walking has no body for them meanwhile. */
  const heldRows = new Set<number>();
  /** Those gone for a while (`CrowdLife.out`): till when, by the game's clock. */
  const gone = new Map<number, number>();
  const rowById = new Map<number, number>();
  /** A row's own number, 0 to 1: they're about only where the crowd's thicker than it. */
  const share = (i: number) => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
  /**
   * Crouching of their own accord, which is seldom. Down and up over and over, quickly, a few times, at a player who's looking
   * at them from close by (as players do at one another): `bobs`, each how many ups and downs are left and when the next is.
   * And down a while at the edge of a long drop.
   */
  const bobs = new Map<number, { left: number; next: number; down: boolean }>();
  const BOB = { chance: 0.02, near: 7, facing: 0.93, times: [2, 8] as const, beat: [0.11, 0.22] as const };
  const EDGE = { chance: 0.05, drop: 4, ahead: 1.4, stay: [1.5, 4] as const };
  const crowd = crowdMotion(game, { area, speed: SPEED, count: () => count, px: () => px, pz: () => pz, heading: () => heading, body: (i) => (heldRows.has(i) ? null : body[i]), live: () => (heldRows.size ? live.filter((i) => !heldRows.has(i)) : live), ground: (x, z) => ground(x, z), away }, options.crowd);

  function populate(n: number) {
    unloadAll();
    count = Math.max(0, Math.min(MAX_COUNT, Math.floor(n)));
    px = new Float32Array(count);
    pz = new Float32Array(count);
    heading = new Float32Array(count);
    turn = new Float32Array(count);
    left = new Float32Array(count);
    stuck = new Float32Array(count);
    hidden = new Float32Array(count);
    flags = new Uint8Array(count);
    body = new Array<Entity | null>(count).fill(null);
    for (let i = 0; i < count; i++) {
      px[i] = rng.range(0, area);
      pz[i] = rng.range(0, area);
      heading[i] = rng.range(0, Math.PI * 2);
      left[i] = rng.range(0.5, 6);
      flags[i] = rng.chance(0.3) ? IDLE : 0;
    }
    if (motion === 'crowd') crowd.reset();
  }

  const people = () => game.players.filter((p) => !p.bot);

  /** What they do next, when what they were doing is done: mostly walking, with a stop now and then to look about. */
  function decide(i: number) {
    const idle = !(flags[i] & IDLE) && rng.chance(0.4);
    flags[i] = idle ? IDLE : 0;
    left[i] = idle ? rng.range(1, 4) : rng.range(3, 9);
    if (!idle && rng.chance(0.5)) heading[i] += rng.range(-1.6, 1.6);
  }

  /** The way they're heading drifts: a turn rate nudged at random that eases back to straight. */
  function wander(i: number, dt: number) {
    left[i] -= dt;
    if (left[i] <= 0) decide(i);
    turn[i] = (turn[i] + rng.range(-0.9, 0.9) * dt) * (1 - 0.3 * dt);
    heading[i] += turn[i] * dt;
  }

  /** The rows without a body: moved along on paper. */
  function drift() {
    for (let i = 0; i < count; i++) {
      if (body[i]) continue;
      wander(i, DRIFT);
      if (flags[i] & IDLE) continue;
      px[i] = wrap(px[i] + Math.cos(heading[i]) * SPEED * DRIFT);
      pz[i] = wrap(pz[i] + Math.sin(heading[i]) * SPEED * DRIFT);
    }
  }

  /** The loaded: steered over the real ground, and their rows kept to where their bodies are. */
  function steer() {
    const world = game.world;
    for (let n = live.length - 1; n >= 0; n--) {
      const i = live[n];
      const e = body[i]!;
      // Gone some other way (the game restarted, something cleared the entities): a row again.
      if (!e.alive) {
        unload(n);
        continue;
      }
      if (heldRows.has(i)) continue;
      const at = e.position;
      px[i] = wrap(at.x);
      pz[i] = wrap(at.z);
      wander(i, STEER);
      if (flags[i] & IDLE) {
        e.stop();
        stuck[i] = 0;
        continue;
      }
      let dx = Math.cos(heading[i]);
      let dz = Math.sin(heading[i]);
      // A long drop or unloaded ground ahead: turn aside rather than walk off it.
      const ahead = world.surfaceY(at.x + dx * 2.5, at.z + dz * 2.5);
      if (ahead < 0 || at.y - ahead > 5) {
        heading[i] += rng.chance(0.5) ? 1.2 : -1.2;
        turn[i] = 0;
        dx = Math.cos(heading[i]);
        dz = Math.sin(heading[i]);
      }
      // Pushing on and going nowhere: hop it (a ledge too high to step up), and if that fails, another way.
      const v = e.velocity;
      stuck[i] = Math.hypot(v.x, v.z) < 0.5 ? stuck[i] + STEER : 0;
      // (A hop only where there's a step to hop: ground a block up just ahead. Once, as it's first held up;
      // someone in the way, or a wall, is walked round, not jumped at.)
      if (stuck[i] > 0.3 && stuck[i] <= 0.3 + STEER && e.onGround) {
        const rise = world.surfaceY(at.x + dx * 0.9, at.z + dz * 0.9) - at.y;
        if (rise > 0.6 && rise < 1.3) e.jump();
      }
      if (stuck[i] > 1.0) {
        heading[i] += rng.range(1.2, 2.6) * (rng.chance(0.5) ? 1 : -1);
        stuck[i] = 0;
      }
      e.moveDirection(dx, dz);
    }
  }

  /** Ground to stand on in a column (under the trees, not on them); null in water, or where the world isn't loaded. */
  function ground(x: number, z: number): number | null {
    const world = game.world;
    let y = world.surfaceY(x, z);
    if (y < 0) return null;
    for (let tries = 0; tries < 40 && y > 0; tries++, y--) {
      const name = world.blockInfo(world.getBlock(x, y, z))?.name ?? '';
      if (name.includes('water') || name.includes('lava')) return null;
      if (name.includes('leaves') || name.includes('log') || world.collisionHeight(x, y, z) === 0) continue;
      return world.collisionHeight(x, y + 1, z) === 0 && world.collisionHeight(x, y + 2, z) === 0 ? y + 1 : null;
    }
    return null;
  }

  /** Whether anyone has a clear line from their eyes to someone standing there (to their head). */
  function inView(here: readonly Player[], x: number, y: number, z: number): boolean {
    const head = { x, y: y + 1.6, z };
    for (const p of here) if (game.world.lineOfSight(p.eye, head)) return true;
    return false;
  }

  /** A row gets its body, standing at `y`. False when the engine has none to spare (other things live here too). */
  function load(i: number, x: number, y: number, z: number): boolean {
    let e: Entity;
    try {
      e = game.entities.spawn(type(i), { x, y: y + 0.02, z }, { yaw: heading[i] });
    } catch {
      return false;
    }
    e.size = sizeOf(i);
    body[i] = e;
    rowById.set(e.id, i);
    live.push(i);
    stuck[i] = 0;
    hidden[i] = 0;
    if (motion === 'crowd') crowd.loaded(i);
    options.onBody?.(i, e);
    return true;
  }

  function unload(n: number) {
    const i = live[n];
    for (const t of tags.values()) if (t.rows.delete(i)) t.player.hud.marker(`wanderer:${i}`, null);
    const e = body[i];
    if (e) rowById.delete(e.id);
    if (e && lowIds.delete(e.id)) game.clients.send('all', CROUCH_MESSAGE, { id: e.id, on: false });
    bobs.delete(i);
    heldRows.delete(i);
    if (e?.alive) e.remove();
    body[i] = null;
    live.splice(n, 1);
  }

  function unloadAll() {
    for (let n = live.length - 1; n >= 0; n--) unload(n);
  }

  /**
   * Who should have a body. Those with one lose it far from everyone, or after a while out of
   * everyone's view; rows get one close by, or within sight and in view.
   */
  function scan(here: readonly Player[]) {
    const half = area / 2;
    const near2 = near * near;
    const sight2 = sight * sight;
    const xs = here.map((p) => p.position.x);
    const zs = here.map((p) => p.position.z);
    const wx = xs.map(wrap);
    const wz = zs.map(wrap);
    // (Those shut in somewhere: near them counts for nothing, only their view.)
    const who = shutIn.get(game);
    const shut = here.map((p) => !(p as { elsewhere?: boolean }).elsewhere && !!who?.(p));

    // (Farthest first off the end, should there be more than the budget.)
    const dist = new Map<number, number>();
    let let_go = 0;
    const covered = (at: { x: number; y: number; z: number }) => game.world.surfaceY(Math.floor(at.x), Math.floor(at.z)) > at.y + 2.5;
    for (let n = live.length - 1; n >= 0; n--) {
      const i = live[n];
      // Gone some other way (the game restarted, something cleared the entities): a row again.
      if (!body[i]!.alive) {
        unload(n);
        continue;
      }
      const at = body[i]!.position;
      let d = Infinity;
      let open = Infinity;
      let under: boolean | undefined;
      for (let p = 0; p < xs.length; p++) {
        const n = (at.x - xs[p]) ** 2 + (at.z - zs[p]) ** 2;
        d = Math.min(d, n);
        // (Close to someone shut in counts only for one that's down there with them: under cover too.)
        if (!shut[p] || (n <= (near + SLACK) ** 2 && (under ??= covered(at)))) open = Math.min(open, n);
      }
      dist.set(i, d);
      if (open <= (near + SLACK) ** 2) hidden[i] = 0;
      else hidden[i] = inView(here, at.x, at.y, at.z) ? 0 : hidden[i] + SCAN;
      if (d > (sight + SLACK) ** 2 || at.y < -8) unload(n);
      // (Out of view long enough: let go, a few in a look.)
      else if (hidden[i] >= LINGER && let_go < UNLOADS) (unload(n), let_go++);
    }
    if (live.length > budget) {
      live.sort((a, b) => dist.get(a)! - dist.get(b)!);
      while (live.length > budget) unload(live.length - 1);
    }

    const room = Math.min(LOADS, budget - live.length);
    if (room > 0) {
      // Each row's nearest copy of itself to anyone (the square repeats), if that's within sight.
      const close: { i: number; d: number; x: number; z: number }[] = [];
      const off: { i: number; x: number; z: number }[] = [];
      const now = game.clock.total;
      for (let i = 0; i < count; i++) {
        if (body[i]) continue;
        // (Gone a while: not yet.)
        if (gone.size && (gone.get(i) ?? 0) > now) continue;
        let d = Infinity;
        let open = Infinity;
        let x = 0;
        let z = 0;
        for (let p = 0; p < xs.length; p++) {
          let dx = px[i] - wx[p];
          let dz = pz[i] - wz[p];
          if (dx > half) dx -= area;
          else if (dx < -half) dx += area;
          if (dz > half) dz -= area;
          else if (dz < -half) dz += area;
          const n = dx * dx + dz * dz;
          if (n < d) [d, x, z] = [n, xs[p] + dx, zs[p] + dz];
          if (!shut[p] && n < open) open = n;
        }
        if (open < near2) close.push({ i, d, x, z });
        else if (d < sight2) off.push({ i, x, z });
      }
      let loaded = 0;
      close.sort((a, b) => a.d - b.d);
      // (Fewer where the game says the crowd's thin: each only where it's thicker than their own number.)
      const thin = thick.get(game);
      for (const w of close) {
        if (loaded >= room) break;
        if (thin && share(w.i) >= thin(w.x, w.z)) continue;
        const y = ground(Math.floor(w.x), Math.floor(w.z));
        if (y === null) continue;
        if (!load(w.i, w.x, y, w.z)) return;
        loaded++;
      }
      // Further off, only those in view; a share of them each look, taking turns.
      for (let k = 0; k < Math.min(RAYS, off.length) && loaded < room; k++) {
        const w = off[(cursor + k) % off.length];
        if (thin && share(w.i) >= thin(w.x, w.z)) continue;
        const y = ground(Math.floor(w.x), Math.floor(w.z));
        if (y === null || !inView(here, w.x, y, w.z)) continue;
        if (!load(w.i, w.x, y, w.z)) return;
        loaded++;
      }
      cursor += RAYS;
    }
    name(here);
  }

  /** Names over the heads of those close to each person, on that person's screen. */
  function name(here: readonly Player[]) {
    for (const [id, t] of tags) {
      if (here.includes(t.player)) continue;
      tags.delete(id);
    }
    for (const p of here) {
      // (An eye with no body has no screen to put names on.)
      if ((p as { elsewhere?: boolean }).elsewhere) continue;
      let t = tags.get(p.id);
      if (!t) tags.set(p.id, (t = { player: p, rows: new Set() }));
      // (And from wherever else they're looking: close to that eye is close to them.)
      const far = alsoSeen.get(game)?.(p) ?? [];
      for (const i of live) {
        const e = body[i]!;
        let d = (e.position.x - p.position.x) ** 2 + (e.position.z - p.position.z) ** 2;
        for (const f of far) d = Math.min(d, (e.position.x - f.x) ** 2 + (e.position.z - f.z) ** 2);
        // (Shown a little further than they first appear at, so they don't flicker at the edge.)
        if (d < tagged2 && !t.rows.has(i)) {
          t.rows.add(i);
          p.hud.marker(`wanderer:${i}`, e, { label: nameOf(i), style: 'nametag', reach: Math.sqrt(tagged2 * 1.3), offset: { x: 0, y: (tall + 0.2) * sizeOf(i) + 0.2, z: 0 } });
        } else if (d > tagged2 * 1.3 && t.rows.delete(i)) p.hud.marker(`wanderer:${i}`, null);
      }
    }
  }

  populate(options.count ?? 2500);

  /** Nobody's here, or it's off: nobody's loaded, and the crowd stands still. */
  const active = () => {
    const here = enabled ? people() : [];
    if (!here.length && live.length) unloadAll();
    return here;
  };
  const stops = [
    game.clock.every(STEER, () => active().length && (motion === 'crowd' ? crowd.tick() : steer())),
    game.clock.every(DRIFT, () => motion === 'wander' && active().length && drift()),
    game.clock.every(SCAN, () => {
      const here = active();
      // (And from wherever else they're looking: an eye with no body, there as a player is for this.)
      const more = here.flatMap((p) => alsoSeen.get(game)?.(p) ?? []).map((e) => ({ position: { x: e.x, y: e.y - 1.62, z: e.z }, eye: e, elsewhere: true }) as unknown as Player);
      if (here.length) scan(more.length ? [...here, ...more] : here);
    }),
  ];

  const api: Wanderers = {
    get enabled() {
      return enabled;
    },
    get count() {
      return count;
    },
    get loaded() {
      return live.length;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) unloadAll();
    },
    setCount(n) {
      populate(n);
    },
    setSight(blocks) {
      setSight(blocks);
    },
    setLive(n) {
      budget = Math.max(0, Math.min(MAX_LIVE, Math.floor(n)));
    },
    get motion() {
      return motion;
    },
    setMotion(name) {
      if (name === motion) return;
      motion = name;
      // (Everyone starts the new way from where they are; a body walking at someone's pace is its own again.)
      if (name === 'crowd') crowd.reset();
      for (const i of live) {
        body[i]!.lookAt(null);
        body[i]!.setSpeed(1);
        if (name === 'crowd') crowd.loaded(i);
      }
    },
    dispose() {
      for (const stop of stops) stop();
      unloadAll();
    },
  };

  const usage = `on | off | <0-${MAX_COUNT}> | sight <blocks> | live <0-${MAX_LIVE}> | model <crowd|wander> | gestures <on|off> | followers <on|off> | afk <on|off> | stats | age <minutes>`;
  stops.push(game.clock.every(0.1, () => {
    if (!enabled || !live.length) return;
    const now = game.clock.total;
    for (const [i, b] of bobs) {
      if (!body[i]?.alive || heldRows.has(i)) {
        bobs.delete(i);
        continue;
      }
      if (now < b.next) continue;
      if (b.left <= 0) {
        crouch(i, false);
        bobs.delete(i);
        continue;
      }
      b.down = !b.down;
      crouch(i, b.down);
      if (!b.down) b.left--;
      b.next = now + (b.left < 0 ? 0 : rng.range(BOB.beat[0], BOB.beat[1]));
    }
    // (Now and then: someone a player's looking at from close by.)
    for (const p of game.players) {
      if (p.bot || !p.alive || !rng.chance(BOB.chance * 0.1)) continue;
      const look = p.look;
      let best = -1;
      let most = BOB.facing;
      for (const i of live) {
        const e = body[i]!;
        if (heldRows.has(i) || bobs.has(i) || !e.alive) continue;
        const [dx, dy, dz] = [e.position.x - p.eye.x, e.position.y + 1.3 - p.eye.y, e.position.z - p.eye.z];
        const d = Math.hypot(dx, dy, dz);
        if (d > BOB.near || d < 0.8) continue;
        const facing = (dx * look.x + dy * look.y + dz * look.z) / d;
        if (facing > most) [best, most] = [i, facing];
      }
      if (best >= 0) bobs.set(best, { left: Math.round(rng.range(BOB.times[0], BOB.times[1])), next: now + rng.range(0.2, 0.9), down: false });
    }
    // (And at the edge of a long drop: down a while. A few looked at each time.)
    for (let n = 0; n < 6; n++) {
      const i = live[Math.floor(rng.range(0, live.length))];
      const e = i === undefined ? null : body[i];
      if (!e?.alive || heldRows.has(i) || bobs.has(i) || !e.onGround || !rng.chance(EDGE.chance)) continue;
      const v = e.velocity;
      const sp = Math.hypot(v.x, v.z);
      const ways = sp > 0.3 ? [[v.x / sp, v.z / sp]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const at = e.position;
      const edge = ways.some(([wx, wz]) => {
        const ground = game.world.surfaceY(Math.floor(at.x + wx * EDGE.ahead), Math.floor(at.z + wz * EDGE.ahead));
        return ground >= 0 && at.y - 1 - ground >= EDGE.drop;
      });
      if (!edge) continue;
      crouch(i, true);
      bobs.set(i, { left: -1, next: now + rng.range(EDGE.stay[0], EDGE.stay[1]), down: true });
    }
  }));

  lives.set(game, {
    rows: () => live,
    body: (i) => body[i] ?? null,
    rowOf: (e) => rowById.get(e.id),
    hold(i, on) {
      if (on && body[i]) heldRows.add(i);
      else if (heldRows.delete(i) && body[i]?.alive) {
        // (Let go: their row's where their body is, and the crowd's walking has them again.)
        px[i] = wrap(body[i]!.position.x);
        pz[i] = wrap(body[i]!.position.z);
        body[i]!.setSpeed(1);
        if (motion === 'crowd') crowd.loaded(i);
      }
    },
    held: (i) => heldRows.has(i),
    away,
    crouch,
    out(i, seconds) {
      gone.set(i, game.clock.total + seconds);
      const n = live.indexOf(i);
      if (n >= 0) unload(n);
    },
    name: nameOf,
  });

  game.commands.register('bots', {
    help: 'The wandering crowd: on, off, how many, how far off they show, or how many bodies at once',
    usage,
    run(args) {
      const a = (args[0] ?? '').toLowerCase();
      const n = /^\d+$/.test(args[1] ?? '') ? Number(args[1]) : null;
      if (a === 'on' || a === 'off') api.setEnabled(a === 'on');
      else if (/^\d+$/.test(a)) {
        api.setCount(Number(a));
        api.setEnabled(count > 0);
      } else if (a === 'sight' && n !== null) api.setSight(n);
      else if (a === 'live' && n !== null) api.setLive(n);
      else if (a === 'model' && (args[1] === 'crowd' || args[1] === 'wander')) api.setMotion(args[1]);
      else if (a === 'gestures' && (args[1] === 'on' || args[1] === 'off')) {
        crowd.gestures = args[1] === 'on';
        return `Gestures ${args[1]}.`;
      } else if (a === 'followers' && (args[1] === 'on' || args[1] === 'off')) {
        crowd.followers = args[1] === 'on';
        return `Following friends ${args[1]}.`;
      } else if (a === 'afk' && (args[1] === 'on' || args[1] === 'off')) {
        crowd.afk = args[1] === 'on';
        return `Going away from the keyboard ${args[1]}.`;
      } else if (a === 'age') {
        if (motion !== 'crowd') return 'Ageing is for the crowd model (/bots model crowd).';
        const minutes = Math.max(1, Math.min(120, Number(args[1]) || 30));
        crowd.age(minutes * 60);
        return `The crowd is ${minutes} minutes older. (/bots stats)`;
      } else if (a === 'stats') {
        if (motion !== 'crowd') return 'Stats are for the crowd model (/bots model crowd).';
        const s = crowd.stats();
        return `Crowd: ${(s.moving * 100).toFixed(1)}% walking, ${(s.following * 100).toFixed(1)}% going along with a friend, ${(s.away * 100).toFixed(1)}% away from their keyboards, ${(s.alone * 100).toFixed(1)}% with nobody by them, the biggest gathering ${s.largest}, ${(s.tight * 100).toFixed(1)}% in someone's space, ${(s.split * 100).toFixed(1)}% of those in view in company across a ledge, ${s.departuresPerHour.toFixed(1)} walks an hour each; of those walking: ${['shuffling', 'strolling', 'walking', 'jogging', 'sprinting', 'sprint-jumping'].map((name, k) => `${(s.gaits[k] * 100).toFixed(0)}% ${name}`).join(', ')}`;
      }
      else if (a) return `Usage: /bots ${usage}`;
      return enabled ? `Wandering crowd: on (${count} about; ${live.length} in view, of at most ${budget}, out to ${sight} blocks; model ${motion})` : 'Wandering crowd: off';
    },
    complete: () => ['on', 'off', 'sight', 'live', 'model', 'gestures', 'followers', 'afk', 'stats', 'age'],
  });

  return api;
}
