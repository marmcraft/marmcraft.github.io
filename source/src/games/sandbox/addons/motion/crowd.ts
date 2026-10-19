import type { Entity, GameContext } from '@platform';
import { gestures } from './gestures';
import { X06 } from './x06.data';

/**
 * How a crowd behaves, after the X06 structured simulator (fitted to people in a social VR venue,
 * in its variant for a world it hasn't seen: the "ring" rule for places). People mostly stand
 * about, in ones and twos and little groups; now and then one sets off, to someone or to a spot a
 * few steps away, and stands again. Three small fitted pieces decide it:
 *
 * - **Stay or go**, each second someone stands still: a logistic on how long they've stood, who's
 *   by them and how well they know them, who has just left them or joined them or started to walk,
 *   and how restless they've been; shifted by the kind of person they are (settlers to movers).
 * - **To whom or where.** About half of walks are to a person: one of those around, by how near
 *   they are, how well known, how lately seen, whether they're alone or walking. The rest are to a
 *   place: how far is drawn from the lengths of real walks, the direction is any (in a world of
 *   open ground, every distance has somewhere to go, which is what the ring rule asks).
 * - **How fast**: by the walk and the person (`pick`): a stroll, a walk, a jog, a sprint, a sprint with a
 *   jump at every step; a shuffle on the spot slower than any. The
 *   simulator draws a real walk's speed along its way instead (pauses and all: a slow 0.4 metres a
 *   second, mostly), which `observedSpeeds` brings back.
 *
 * It's cheap on purpose: each row is looked at once a second (a tenth of the rows every tenth of
 * a second), the ones standing by a few arithmetic steps over their near neighbours (a grid of
 * cells finds those), and a walk is one instruction to the engine ("go there, at this speed"),
 * which carries it out with everything else it moves. Nothing is steered step by step.
 *
 * And one piece that isn't fitted, on top (`followers`): some people go where their friends go.
 * When someone standing in company sets off, those by them who are the following kind, and know
 * them well enough, come along a moment later and keep after them all the way: a step or two
 * behind and to one side, at their pace (quicker to catch up, slower when they're on their heels),
 * wherever the walk turns out to go. Those by a follower may follow them in turn, so a whole knot
 * of people can string out behind one; and with company, a walk is often a longer one, an outing.
 * Most walks are still someone's own.
 *
 * And a few people are away from their keyboards (`afk`): for minutes at a time they stand exactly
 * as they were, going nowhere, doing nothing, looking at nobody.
 *
 * Two things a body does on its way that the engine's bodies don't do of themselves. A **ladder**:
 * held up below somewhere higher they're making for, they look about for a ladder (or a vine) that
 * goes up, walk to its foot, climb it, and go on from its top. And **water**: in it, they swim
 * (up to the surface, and along it), and come out over a bank or onto a slab laid over the water
 * with a kick, as a player does; they aren't held to be stuck while they're wet. Where the way out
 * is too high for that (a quay, a pool's wall) they look for a ladder there too, one that comes
 * down to the water or stops a little over it, and climb out by it.
 *
 * Where it parts from the simulator: there's no map of routes (a walk is a straight line over the
 * ground), no ties from earlier visits (everyone starts a stranger), the size of the crowd is taken
 * as the venue's usual, and "left" and "arrived" are kept as events rather than read back from
 * where everyone was five and ten seconds ago.
 */
export interface CrowdRows {
  /** The side of the square the crowd lives on (it repeats). */
  readonly area: number;
  /** A body's own walking speed (what a speed of 1 is to the engine). */
  readonly speed: number;
  count(): number;
  px(): Float32Array;
  pz(): Float32Array;
  heading(): Float32Array;
  body(i: number): Entity | null;
  live(): readonly number[];
  /** Ground to stand on at a place in the world, or null (water, nothing loaded). */
  ground(x: number, z: number): number | null;
  /** A row with a body has gone away from its keyboard, or come back (and each row given a body is said either way). */
  away?(i: number, on: boolean): void;
}

export interface CrowdOptions {
  /** A share of extra settlers, for a calmer place (0 to 1). Default 0: the venue's own mix. */
  settlers?: number;
  /** Walking speeds times this. Default 1. */
  pace?: number;
  /** Walk at the speeds observed in the venue (slow), rather than a body's ordinary pace. Default false. */
  observedSpeeds?: boolean;
  /** The small things people do standing about (`motion/gestures.ts`). Default true. */
  gestures?: boolean;
  /**
   * How much readier to set off someone is with nobody by them (added to the stay-or-go logit: 0 is
   * the venue's own, where people alone mostly stand; 2.2 is about nine times as ready), and they
   * go somewhere when they do (not a shuffle on the spot). People in company are as the venue has
   * them. Default 2.2.
   */
  restless?: number;
  /**
   * How much of the venue's leaning toward walking to a person someone on their own keeps (0 to 1):
   * low, and those alone mostly stroll from place to place, joining a group only now and then; 1,
   * and they seek company as the venue's people do (and soon nobody's alone). Default 0.2.
   */
  roam?: number;
  /**
   * Whether some go along with a friend who sets off (and the share of people who're the kind to:
   * true is `FOLLOWERS`). Default true.
   */
  followers?: boolean | number;
  /**
   * Whether a few are away from their keyboards for long stretches (and the share of people who're
   * given to it: true is `AFK`). Default true.
   */
  afk?: boolean | number;
  /** Seconds of standing and walking played out before anyone looks, so groups are there already. Default 300. */
  warm?: number;
}

export interface CrowdMotion {
  /** The rows are new (their number changed): everyone starts again. */
  reset(): void;
  /** A tenth of a second has gone by. */
  tick(): void;
  /** A row was given a body, or lost it. */
  loaded(i: number): void;
  unloaded(i: number): void;
  /** The small things people do standing about, on or off. */
  gestures: boolean;
  /** Going along with a friend who sets off, on or off. */
  followers: boolean;
  /** Standing away from the keyboard for long stretches, on or off. */
  afk: boolean;
  /** How the crowd is doing, for a look at it: the share walking, the share with nobody by them, walks an hour each. */
  /** (`tight`: the share standing inside someone's personal space. `split`: of those in view standing by someone, the share more than a block above or below them.) */
  /** Played on by that many seconds at once, on paper (to see where a long day leaves the crowd). */
  age(seconds: number): void;
  stats(): { moving: number; following: number; away: number; alone: number; tight: number; split: number; largest: number; departuresPerHour: number; gaits: number[] };
}

const CELL = 4;
/** How near is "with" someone, and how far is "gone from" them (metres), as the simulator has them. */
const CLOSE = 2;
/** Nobody stands nearer anyone than this (blocks): personal space. */
const SPACE = 1.15;
/** How near someone they've walked up to they stop, at least: talking distance (inside `CLOSE`, so they're together). */
const TALK = 1.25;
const GONE = 3;
/** How far above or below each other people who are together stand, at most (blocks): a step, not a ledge. */
const STEP = 1;
/** How far around someone a walk to a person looks for one. */
const REACH = 22;
const MAX_CANDIDATES = 48;
/** How many stand together before it's a crowd: nobody new walks up to more than this, and those in one are readier to go. */
const FULL = 7;
/** The share of people who're the kind to go along with a friend, by default. */
const FOLLOWERS = 0.68;
/** Of those after someone who jumps at every step, how many do the same; and how often (each look, a second or two) a follower wanders wide of the line for a while. */
const HOPS_TOO = 0.25;
const STRAYS = 0.07;
/** A walk shorter than this (blocks) is nobody's to follow: they've only stepped aside. */
const WORTH = 3;
/** How often a walk to nowhere in particular, with someone coming along, is made a long one. */
const OUTING = 0.6;
/** Seconds stood together by which a follower knows someone as well as they need to. */
const FAMILIAR = 30;
/** How near someone setting off a follower has to be standing to go with them. */
const BESIDE = 2.6;
/** The share of people given to leaving their keyboards, by default; and how long they're gone (seconds). */
const AFK = 0.05;
const AWAY = [120, 1500];
/** Seconds of pushing on and going nowhere before a walk is given up. */
const STUCK = 2.5;
/** How far off a ladder is looked for (blocks, each way), how much higher its top has to be to be worth it, and how long a climb may take (seconds). */
const LADDER_NEAR = 6;
const LADDER_WORTH = 1.2;
const CLIMB_TIME = 20;
/** Seconds stepping off a ladder's top onto what it leads to. */
const STEP_OFF = 0.7;
/** Comings and goings remembered for each row. */
const EVENTS = 6;
/** The size of crowd the hazard is told (the venue's usual: its feature at its mean). */
const USUAL_CROWD = Math.expm1(X06.hazard.mu[4]);
const PAIRS = 16384;

const enum Gait {
  Shuffle,
  Stroll,
  Walk,
  Jog,
  Sprint,
  SprintJump,
}
/** Each gait's speed, over a body's ordinary walking pace. */
const PACE = [0.42, 0.6, 1, 1.35, 1.75, 1.95];

export function crowdMotion(game: GameContext, rows: CrowdRows, options: CrowdOptions = {}): CrowdMotion {
  const rng = game.rng;
  const { hazard, who, ring, speed } = X06;
  const area = rows.area;
  const G = Math.ceil(area / CELL);
  const pace = options.pace ?? 1;
  const settlers = Math.max(0, Math.min(1, options.settlers ?? 0));
  const restless = options.restless ?? 2.2;
  const roam = Math.max(0, Math.min(1, options.roam ?? 0.2));

  const share = options.followers === false ? 0 : typeof options.followers === 'number' ? Math.max(0, Math.min(1, options.followers)) : FOLLOWERS;
  let following = share > 0;
  const given = options.afk === false ? 0 : typeof options.afk === 'number' ? Math.max(0, Math.min(1, options.afk)) : AFK;
  let idling = given > 0;

  let n = 0;
  let px = rows.px();
  let pz = rows.pz();
  let t = 0;
  let ticks = 0;
  let departures = 0;
  let since = 0;
  // Each row: walking or not, since when they've stood, when this visit began and how long it runs,
  // walks this visit, where a walk is going and how fast and when it gives up, the kind of person.
  let walking = new Uint8Array(0);
  let stillSince = new Float32Array(0);
  let firstSeen = new Float32Array(0);
  let visit = new Float32Array(0);
  let deps = new Uint16Array(0);
  let tx = new Float32Array(0);
  let tz = new Float32Array(0);
  let spd = new Float32Array(0);
  let cap = new Float32Array(0);
  let klass = new Float32Array(0);
  let friend = new Int32Array(0);
  let stuck = new Float32Array(0);
  /** When each one's visit began: who they stood with before it is nobody they know. */
  let born = new Float32Array(0);
  /** Steps back for room since the last real walk. */
  let shy = new Uint8Array(0);
  // How each one's walk is taken, how lively each is (0 to 1), and the rows sprinting with a jump at every step.
  let gait = new Uint8Array(0);
  let lively = new Float32Array(0);
  let hoppers: number[] = [];
  // How much of a follower each is (0: not one; 1: devoted), whom each is going along with just now
  // (or -1), when they'll set off after them (0: off already), whether they've had to look for them
  // again, and the rows doing any of it.
  let follow = new Float32Array(0);
  let lead = new Int32Array(0);
  let after = new Float32Array(0);
  let sought = new Uint8Array(0);
  let tails: number[] = [];
  // Where each keeps to, after the one they follow: that far behind them, and that far to their side.
  let back = new Float32Array(0);
  let side = new Float32Array(0);
  /** When each follower next looks where the one ahead has got to. */
  let look = new Float32Array(0);
  /** Till when each follower is off the line (wandered wide of the one ahead; 0: keeping their place), and the place they go back to. */
  let stray = new Float32Array(0);
  let keep = new Float32Array(0);
  // Ladders: each one's part in a climb (0: none; 1: on their way to its foot; 2: on it; 3: stepping off its top, that way: `offX`, `offZ`), the ladder's
  // column and how high it goes (where their feet come off it), when they took to it, and those on one.
  let climb = new Uint8Array(0);
  let ladderX = new Float64Array(0);
  let ladderZ = new Float64Array(0);
  let ladderTop = new Float32Array(0);
  let climbT = new Float32Array(0);
  let offX = new Float32Array(0);
  let offZ = new Float32Array(0);
  let climbers: number[] = [];
  // Water: who's in it (as last looked: twice a second), and the list of them.
  let wetAt = new Uint8Array(0);
  let wet: number[] = [];
  /** Seconds each has been in water and getting nowhere (up against a bank or a wall too high to kick out over). */
  let soak = new Float32Array(0);
  /** The way each last walked into something they couldn't get by (a heading; NaN: none): they don't try it again next. */
  let wall = new Float32Array(0);
  // How given each is to leaving their keyboard (the chance of it, each second they stand; 0: never), and until when they're away now (0: they're here).
  let prone = new Float32Array(0);
  let afk = new Float32Array(0);
  // Who lately left each row's side, and who lately came to it (when, and who).
  let leftT = new Float32Array(0);
  let leftJ = new Int32Array(0);
  let cameT = new Float32Array(0);
  let cameJ = new Int32Array(0);
  let leftAt = new Uint8Array(0);
  let cameAt = new Uint8Array(0);
  // The grid of cells: each cell's first row, each row's next in its cell.
  const head = new Int32Array(G * G);
  let next = new Int32Array(0);
  let cellOf = new Int32Array(0);
  /** Seconds each pair has spent together, and when they last were. */
  const together = new Map<number, number>();
  const lastClose = new Map<number, number>();
  const F = new Float32Array(hazard.w.length);

  const wrap = (v: number) => ((v % area) + area) % area;
  /** The short way from one place on the square to another (it repeats). */
  const span = (d: number) => (d > area / 2 ? d - area : d < -area / 2 ? d + area : d);
  const pair = (a: number, b: number) => (a < b ? a * PAIRS + b : b * PAIRS + a);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  const z = (k: number, v: number, mu: readonly number[], sd: readonly number[]) => Math.max(-8, Math.min(8, (v - mu[k]) / sd[k]));
  const small = gestures(game, { body: rows.body, live: rows.live, standing: (i) => !walking[i] && !(afk[i] > 0), around: (i, r, fn) => around(i, r, fn) });
  small.enabled = options.gestures ?? true;

  function place(i: number) {
    const c = Math.min(G - 1, Math.floor(px[i] / CELL)) + Math.min(G - 1, Math.floor(pz[i] / CELL)) * G;
    if (c === cellOf[i]) return;
    const old = cellOf[i];
    if (old >= 0) {
      if (head[old] === i) head[old] = next[i];
      else for (let j = head[old]; j >= 0; j = next[j]) if (next[j] === i) {
        next[j] = next[i];
        break;
      }
    }
    next[i] = head[c];
    head[c] = i;
    cellOf[i] = c;
  }

  /** Each row within `r` of a row (not itself): `fn(j, distance)`. */
  function around(i: number, r: number, fn: (j: number, d: number) => void) {
    const reach = Math.ceil(r / CELL);
    const cx = Math.min(G - 1, Math.floor(px[i] / CELL));
    const cz = Math.min(G - 1, Math.floor(pz[i] / CELL));
    const r2 = r * r;
    for (let dz = -reach; dz <= reach; dz++) {
      const row = ((cz + dz + G) % G) * G;
      for (let dx = -reach; dx <= reach; dx++) {
        for (let j = head[row + ((cx + dx + G) % G)]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const ex = span(px[j] - px[i]);
          const ez = span(pz[j] - pz[i]);
          const d2 = ex * ex + ez * ez;
          if (d2 <= r2) fn(j, Math.sqrt(d2));
        }
      }
    }
  }

  /** Seconds two have stood together this visit of theirs (a pair from before either's visit began: none). */
  const tied = (i: number, j: number): number => {
    const key = pair(i, j);
    const seen = lastClose.get(key);
    return seen === undefined || seen < born[i] || seen < born[j] ? 0 : (together.get(key) ?? 0);
  };

  const note = (times: Float32Array, whom: Int32Array, at: Uint8Array, i: number, j: number) => {
    const k = i * EVENTS + at[i];
    times[k] = t;
    whom[k] = j;
    at[i] = (at[i] + 1) % EVENTS;
  };

  function reset() {
    n = rows.count();
    px = rows.px();
    pz = rows.pz();
    walking = new Uint8Array(n);
    stillSince = new Float32Array(n);
    firstSeen = new Float32Array(n);
    visit = new Float32Array(n);
    deps = new Uint16Array(n);
    tx = new Float32Array(n);
    tz = new Float32Array(n);
    spd = new Float32Array(n);
    cap = new Float32Array(n);
    klass = new Float32Array(n);
    friend = new Int32Array(n).fill(-1);
    stuck = new Float32Array(n);
    born = new Float32Array(n).fill(t);
    shy = new Uint8Array(n);
    gait = new Uint8Array(n);
    lively = new Float32Array(n);
    hoppers = [];
    follow = new Float32Array(n);
    lead = new Int32Array(n).fill(-1);
    after = new Float32Array(n);
    sought = new Uint8Array(n);
    tails = [];
    back = new Float32Array(n);
    side = new Float32Array(n);
    look = new Float32Array(n);
    stray = new Float32Array(n);
    keep = new Float32Array(n);
    wall = new Float32Array(n).fill(NaN);
    climb = new Uint8Array(n);
    ladderX = new Float64Array(n);
    ladderZ = new Float64Array(n);
    ladderTop = new Float32Array(n);
    climbT = new Float32Array(n);
    offX = new Float32Array(n);
    offZ = new Float32Array(n);
    climbers = [];
    wetAt = new Uint8Array(n);
    wet = [];
    soak = new Float32Array(n);
    prone = new Float32Array(n);
    afk = new Float32Array(n);
    leftT = new Float32Array(n * EVENTS).fill(-1e6);
    leftJ = new Int32Array(n * EVENTS);
    cameT = new Float32Array(n * EVENTS).fill(-1e6);
    cameJ = new Int32Array(n * EVENTS);
    leftAt = new Uint8Array(n);
    cameAt = new Uint8Array(n);
    next = new Int32Array(n).fill(-1);
    cellOf = new Int32Array(n).fill(-1);
    head.fill(-1);
    together.clear();
    lastClose.clear();
    small.reset(n);
    const share = hazard.classShare.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      // The kind of person: one of the venue's kinds by its share, or one of the extra settlers.
      let pick = rng.next() * share;
      let k = 0;
      while (k < hazard.classShare.length - 1 && pick > hazard.classShare[k]) pick -= hazard.classShare[k++];
      klass[i] = rng.next() < settlers ? -3 : hazard.classShift[k];
      // (Liveliness: their own, and more for the venue's movers than its settlers.)
      lively[i] = Math.max(0, Math.min(1, rng.next() * 0.75 + (k / Math.max(1, hazard.classShare.length - 1)) * 0.35 - (klass[i] <= -3 ? 0.3 : 0)));
      // (Whether they're one to go along with a friend, and how readily: a few hardly ever, a few every time.)
      follow[i] = rng.next() < share ? rng.range(0.3, 1) : 0;
      // (And whether they're given to walking away from their keyboard: a few of them away already.)
      prone[i] = rng.next() < given ? rng.range(0.0003, 0.0012) : 0;
      if (prone[i] > 0 && rng.next() < 0.3) afk[i] = t + (options.warm ?? 300) + rng.range(AWAY[0], AWAY[1]);
      visit[i] = rng.range(1200, 5400);
      firstSeen[i] = t - rng.range(0, visit[i]);
      stillSince[i] = t - rng.range(0, 60);
      place(i);
    }
    // Played out for a while before anyone looks: the groups are there to be found.
    for (let s = Math.max(0, options.warm ?? 300); s > 0; s--) {
      t += 1;
      trail();
      for (let i = 0; i < n; i++) second(i);
    }
    departures = 0;
    since = t;
  }

  /**
   * How a walk is taken: a shuffle where they stand, a stroll, a walk, a jog, a sprint, or a sprint
   * with a jump at every step (the way players cover ground). It goes by the walk and by the
   * person: a few steps are never run; a long way is run more than a short one; a walk to someone
   * is brisker than one to nowhere in particular; someone roaming alone covers ground; and each
   * has a liveliness of their own (the venue's movers more than its settlers), so the same walk
   * is one person's amble and another's dash.
   */
  function pick(i: number, far: number, toSomeone: boolean, roaming: boolean): Gait {
    if (far < 1.5) return Gait.Shuffle;
    const e = lively[i];
    const long = far > 20 ? 1 : far > 9 ? 0.45 : far > 4 ? 0.12 : 0;
    const stroll = (0.5 - 0.4 * e) * (toSomeone ? 0.4 : 1) * (1 - long * 0.7);
    const walk = 0.5;
    const jog = (0.12 + 0.3 * e) * (toSomeone ? 1.6 : 1) * (0.6 + long);
    const sprint = long * (0.25 + 1.1 * e) * (roaming ? 1.4 : 1);
    const leap = far > 12 ? sprint * 0.7 * e : 0;
    let r = rng.next() * (stroll + walk + jog + sprint + leap);
    if ((r -= stroll) < 0) return Gait.Stroll;
    if ((r -= walk) < 0) return Gait.Walk;
    if ((r -= jog) < 0) return Gait.Jog;
    return r - sprint < 0 ? Gait.Sprint : Gait.SprintJump;
  }

  /** A walk begins for a body: the engine is told where and how fast, and takes it from there. */
  function start(i: number, e: Entity) {
    const at = e.position;
    small.cancel(i);
    e.lookAt(null);
    e.setSpeed(Math.max(0.05, spd[i] / rows.speed));
    e.moveTo({ x: at.x + span(tx[i] - wrap(at.x)), y: at.y, z: at.z + span(tz[i] - wrap(at.z)) });
    stuck[i] = 0;
  }

  /** A walk is over (there, or given up): they stand, and whoever's by them has someone new. */
  function arrive(i: number) {
    walking[i] = 0;
    climb[i] = 0;
    stillSince[i] = t;
    around(i, CLOSE, (j) => {
      note(cameT, cameJ, cameAt, j, i);
      note(cameT, cameJ, cameAt, i, j);
    });
    const e = rows.body(i);
    if (e) {
      e.stop();
      // (Turned to whoever they came to.)
      const to = friend[i] >= 0 ? rows.body(friend[i]) : null;
      e.setSpeed(1);
      if (to) e.lookAt(to);
    }
    room(i);
  }

  /**
   * Personal space: stopped closer to anyone standing than people stand, they take a step back from
   * them (from all of them, the nearest most). A few goes at most, in a crowd too tight to find room.
   */
  function room(i: number) {
    if (shy[i] >= 3) return;
    let ax = 0;
    let az = 0;
    let nearest = SPACE;
    around(i, SPACE, (j, d) => {
      if (walking[j]) return;
      const w = (SPACE - d) / SPACE;
      // (On the very same spot: any way out.)
      const a = d < 0.01 ? rng.range(0, Math.PI * 2) : 0;
      ax += (d < 0.01 ? Math.cos(a) : -span(px[j] - px[i]) / d) * w;
      az += (d < 0.01 ? Math.sin(a) : -span(pz[j] - pz[i]) / d) * w;
      if (d < nearest) nearest = d;
    });
    if (nearest >= SPACE) return;
    const l = Math.hypot(ax, az);
    const a = l < 0.01 ? rng.range(0, Math.PI * 2) : Math.atan2(az, ax);
    const step = SPACE - nearest + rng.range(0.15, 0.45);
    shy[i]++;
    const facing = rows.heading()[i];
    go(i, Math.cos(a) * step, Math.sin(a) * step, false);
    // (Backing off, not turning away.)
    rows.heading()[i] = facing;
  }

  function depart(i: number) {
    deps[i]++;
    departures++;
    around(i, CLOSE, (j) => note(leftT, leftJ, leftAt, j, i));
    let ex = 0;
    let ez = 0;
    friend[i] = -1;
    // To a person, about half the time, if anyone's about: one of them by the fitted preferences.
    // (Someone on their own and restless is out for a walk more than looking for company: `roam`.)
    let lone = restless > 0;
    if (lone) around(i, CLOSE, () => (lone = false));
    if (rng.next() < who.share * (lone ? roam : 1)) {
      const cand: number[] = [];
      const util: number[] = [];
      let top = -Infinity;
      around(i, REACH, (j, d) => {
        if (cand.length >= MAX_CANDIDATES) return;
        const ts = tied(i, j);
        const seen = ts > 0 ? lastClose.get(pair(i, j)) : undefined;
        const ago = seen === undefined ? 1e4 : Math.min(1e4, t - seen);
        let group = 0;
        around(j, CLOSE, () => group++);
        // (A crowd already: nobody else squeezes in.)
        if (group >= FULL) return;
        const moving = walking[j] ? 1.4 : 0;
        const age = t - firstSeen[j];
        const x = [Math.log1p(d), d / 10, 0, Math.log1p(ts), 0, ts > 0 ? 1 : 0, 0, Math.log1p(ago), ago < 60 ? 1 : 0, d < CLOSE ? 1 : 0, Math.log1p(group), group === 0 ? 1 : 0, moving, moving > 0.5 ? 1 : 0, Math.log1p(age), age < 30 ? 1 : 0];
        let u = 0;
        for (let k = 0; k < x.length; k++) u += who.w[k] * z(k, x[k], who.mu, who.sd);
        cand.push(j);
        util.push(u);
        if (u > top) top = u;
      });
      if (cand.length) {
        let total = 0;
        for (let k = 0; k < util.length; k++) total += util[k] = Math.exp(util[k] - top);
        let pick = rng.next() * total;
        let k = 0;
        while (k < cand.length - 1 && pick > util[k]) pick -= util[k++];
        const j = cand[k];
        // (Beside them, on the side come from.)
        const bx = span(px[i] - px[j]);
        const bz = span(pz[i] - pz[j]);
        const off = rng.range(TALK, TALK + 0.7);
        const mine = rows.body(i);
        const theirs = rows.body(j);
        let a = Math.atan2(bz, bx);
        // (On their level, give or take a block: nobody keeps company up a cliff from them. A few
        // sides of them are tried for such a spot; with none, it's a walk somewhere instead.)
        for (let tries = 0; tries < 5; tries++, a = rng.range(0, Math.PI * 2)) {
          ex = span(px[j] - px[i]) + Math.cos(a) * off;
          ez = span(pz[j] - pz[i]) + Math.sin(a) * off;
          if (!mine || !theirs) friend[i] = j;
          else {
            const y = rows.ground(Math.floor(mine.position.x + ex), Math.floor(mine.position.z + ez));
            if (y !== null && Math.abs(y - theirs.position.y) <= STEP) friend[i] = j;
          }
          if (friend[i] >= 0) break;
        }
      }
    }
    // To a place otherwise: how far by the lengths of real walks, any direction; a shuffle where they stand, often.
    if (friend[i] < 0) {
      const e = rows.body(i);
      const company = !lone;
      for (let tries = 0; tries < 4; tries++) {
        let pick = rng.next();
        let b = 0;
        while (b < ring.p.length - 1 && pick > ring.p[b]) pick -= ring.p[b++];
        // (Someone on their own and restless goes somewhere: not a shuffle on the spot.)
        if (b === 0 && !company && restless > 0 && tries < 3) continue;
        if (b === 0) {
          ex = normal() * 0.6;
          ez = normal() * 0.6;
        } else {
          const d = rng.range(ring.edges[b], b + 1 < ring.edges.length ? ring.edges[b + 1] : ring.edges[b] * 1.4);
          let a = rng.range(0, Math.PI * 2);
          // (Not the way they last couldn't get by: the other way, about.)
          if (wall[i] === wall[i] && Math.cos(a - wall[i]) > 0.1) a = wall[i] + Math.PI + rng.range(-1.2, 1.2);
          ex = Math.cos(a) * d + normal() * 0.35;
          ez = Math.sin(a) * d + normal() * 0.35;
        }
        // (Someone with a body goes where there's ground to stand on.)
        if (!e || rows.ground(Math.floor(e.position.x + ex), Math.floor(e.position.z + ez)) !== null) break;
        ex = ez = 0;
      }
    }
    shy[i] = 0;
    // Whoever's coming along; and with company for it, a walk to nowhere in particular is as often as
    // not a proper outing: a good way off (where there's ground to stand on), all of them together.
    const coming = lone ? 0 : company(i, Math.hypot(ex, ez));
    if (coming && friend[i] < 0 && rng.next() < OUTING) {
      const e = rows.body(i);
      const a = Math.atan2(ez, ex);
      for (let tries = 0; tries < 4; tries++) {
        const d = rng.range(12, 42);
        const b = a + (tries ? rng.range(-1, 1) : 0);
        if (e && rows.ground(Math.floor(e.position.x + Math.cos(b) * d), Math.floor(e.position.z + Math.sin(b) * d)) === null) continue;
        ex = Math.cos(b) * d;
        ez = Math.sin(b) * d;
        break;
      }
    }
    go(i, ex, ez, lone);
  }

  /**
   * Someone's set off from company: those by them who're the kind to follow, and know them, make up
   * their minds to come too (the readier the better they know them; a devoted friend of long
   * standing, every time), and are after them in a moment: the keener, the sooner.
   */
  function company(i: number, far: number): number {
    if (!following || far < WORTH) return 0;
    let coming = 0;
    around(i, BESIDE, (j) => {
      if (walking[j] || follow[j] <= 0 || lead[j] >= 0 || afk[j] > 0) return;
      const known = Math.min(1, tied(i, j) / FAMILIAR);
      if (rng.next() >= follow[j] * (0.55 + 0.6 * known)) return;
      lead[j] = i;
      after[j] = t + rng.range(0.3, 1.5) * (1.35 - follow[j]);
      sought[j] = 0;
      back[j] = rng.range(0.6, 3.4);
      side[j] = rng.range(-2.6, 2.6);
      look[j] = 0;
      stray[j] = 0;
      tails.push(j);
      coming++;
    });
    return coming;
  }

  /** Off after the one they follow: to beside where that one's going (or is, if they've stopped), at their pace and a little over. */
  function tail(j: number, l: number) {
    deps[j]++;
    departures++;
    around(j, CLOSE, (k) => k !== l && note(leftT, leftJ, leftAt, k, j));
    friend[j] = l;
    shy[j] = 0;
    const a = rng.range(0, Math.PI * 2);
    const off = rng.range(TALK, TALK + 0.9);
    const gx = walking[l] ? tx[l] : px[l];
    const gz = walking[l] ? tz[l] : pz[l];
    go(j, span(gx - px[j]) + Math.cos(a) * off, span(gz - pz[j]) + Math.sin(a) * off, false, l);
    // (And whoever's by them, and follows them, is off after them in turn.)
    company(j, WORTH);
  }

  /** Whether someone's on the heels of one who's still walking (their walk isn't over where they've got to: it's over when the other's is). */
  const chasing = (j: number) => lead[j] >= 0 && after[j] === 0 && walking[lead[j]] === 1;

  /** A walk is turned to somewhere else as it goes (a follower's, after the one ahead). */
  function aim(j: number, gx: number, gz: number) {
    tx[j] = wrap(gx);
    tz[j] = wrap(gz);
    const ex = span(tx[j] - px[j]);
    const ez = span(tz[j] - pz[j]);
    if (Math.hypot(ex, ez) > 0.3) rows.heading()[j] = Math.atan2(ez, ex);
    const e = rows.body(j);
    if (!e) return;
    const at = e.position;
    e.setSpeed(Math.max(0.05, spd[j] / rows.speed));
    e.moveTo({ x: at.x + span(tx[j] - wrap(at.x)), y: at.y, z: at.z + span(tz[j] - wrap(at.z)) });
  }

  /** Still after them: to their own place behind the one ahead, where that one is now; quicker with ground to make up, easing off at their heels. */
  function chase(j: number, l: number) {
    cap[j] = Math.max(cap[j], t + 30);
    // (On a ladder, or on their way to one: that first.)
    if (climb[j]) return;
    // (Each looks again in their own time, a second or two: between looks they keep the line they took, so no two take quite the same way.)
    if (t < look[j]) return;
    look[j] = t + rng.range(0.7, 1.9);
    // Nobody keeps a place exactly: it shifts a little with every look, and now and then someone wanders well wide of the
    // line (something caught their eye), goes on like that a few seconds, and comes back to where they were.
    if (stray[j] > 0) {
      if (t >= stray[j]) {
        stray[j] = 0;
        side[j] = keep[j];
      }
    } else if (rng.next() < STRAYS) {
      keep[j] = side[j];
      stray[j] = t + rng.range(2.5, 6);
      side[j] = (rng.next() < 0.5 ? -1 : 1) * rng.range(4, 8);
      back[j] = Math.max(0.6, Math.min(5, back[j] + rng.range(-1, 2)));
    } else {
      side[j] = Math.max(-3.4, Math.min(3.4, side[j] + rng.range(-0.6, 0.6)));
      back[j] = Math.max(0.6, Math.min(4.2, back[j] + rng.range(-0.5, 0.5)));
    }
    const h = rows.heading()[l];
    const hx = Math.cos(h);
    const hz = Math.sin(h);
    // Where they make for: their own place by the one ahead, and on from it the way that one's going (a
    // couple of seconds' worth: they head for where the other will be, by their own line, not along their tracks).
    const on = Math.min(spd[l] * 2, Math.hypot(span(tx[l] - px[l]), span(tz[l] - pz[l])));
    let ex = span(px[l] - px[j]) + hx * (on - back[j]) - hz * side[j];
    let ez = span(pz[l] - pz[j]) + hz * (on - back[j]) + hx * side[j];
    // How far behind their place they are, along the way the other's going (less than nothing: level with it, or ahead).
    const behind = (ex - hx * on) * hx + (ez - hz * on) * hz;
    // (Never back the way they came: come up level or gone ahead, they keep on the other's way, easing off, and the other comes by.)
    if (ex * hx + ez * hz < 0.5) {
      ex = hx * 3;
      ez = hz * 3;
    }
    spd[j] = spd[l] * (behind > 6 ? 1.35 : behind > 2.2 ? 1.18 : behind < 0.3 ? 0.72 : 1);
    aim(j, px[j] + ex, pz[j] + ez);
  }

  /** Those going along with someone, twice a second: the ones due to set off do; and one whose friend has stopped short of where they were going looks for them there, once. */
  function trail() {
    for (let k = tails.length - 1; k >= 0; k--) {
      const j = tails[k];
      const l = lead[j];
      let done = l < 0 || !following;
      if (!done && after[j] > 0) {
        // (Gone off on their own account meanwhile: never mind.)
        if (walking[j]) done = true;
        else if (t < after[j]) continue;
        else {
          after[j] = 0;
          tail(j, l);
          continue;
        }
      } else if (!done) {
        if (!walking[j]) done = true;
        else if (walking[l]) chase(j, l);
        else if (!sought[j] && !climb[j]) {
          // (They've stopped: up to them, to stand by them.)
          sought[j] = 1;
          const a = Math.atan2(span(pz[j] - pz[l]), span(px[j] - px[l])) + rng.range(-0.7, 0.7);
          const off = rng.range(TALK, TALK + 0.7);
          const far = Math.hypot(span(px[l] - px[j]), span(pz[l] - pz[j]));
          // (By them already: that'll do, where they are. No shuffling round to a spot behind.)
          if (far < off + 0.9) aim(j, px[j], pz[j]);
          else aim(j, px[l] + Math.cos(a) * off, pz[l] + Math.sin(a) * off);
        }
      }
      if (done) {
        lead[j] = -1;
        after[j] = 0;
        tails.splice(k, 1);
      }
    }
  }

  /**
   * A visit is over: they go, and someone new comes (the same face, a stranger again). Out of
   * sight, that's somewhere else on the square at once; in sight, a long walk off the way they
   * face, and whoever they knew is forgotten either way.
   */
  function leave(i: number) {
    friend[i] = -1;
    shy[i] = 0;
    stillSince[i] = t;
    if (!rows.body(i)) {
      around(i, CLOSE, (j) => note(leftT, leftJ, leftAt, j, i));
      px[i] = rng.range(0, area);
      pz[i] = rng.range(0, area);
      place(i);
      return;
    }
    departures++;
    around(i, CLOSE, (j) => note(leftT, leftJ, leftAt, j, i));
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(45, 90);
    go(i, Math.cos(a) * d, Math.sin(a) * d, true);
  }

  /** Off they go, that far from where they are (`like`: as that one's going, whom they follow). */
  function go(i: number, ex: number, ez: number, lone: boolean, like = -1) {
    const far = Math.hypot(ex, ez);
    tx[i] = wrap(px[i] + ex);
    tz[i] = wrap(pz[i] + ez);
    // (A body's ordinary pace, give or take; a shuffle where they stand, slower. Or as observed: see the top.)
    // (After someone: as fast as they go, but in their own way. One who goes jumping at every step isn't copied in it by all who follow: most just run.)
    gait[i] = like >= 0 ? (gait[like] === Gait.SprintJump && rng.next() >= HOPS_TOO ? Gait.Sprint : gait[like]) : options.observedSpeeds ? Gait.Walk : pick(i, far, friend[i] >= 0, lone);
    // (After someone: their pace and a little over, to come up with them.)
    spd[i] = like >= 0 && spd[like] > 0 ? spd[like] * rng.range(1.03, 1.16) : (options.observedSpeeds ? speed[rng.int(0, speed.length - 1)] : rows.speed * PACE[gait[i]] * rng.range(0.92, 1.08)) * pace;
    if (gait[i] === Gait.SprintJump) hoppers.push(i);
    cap[i] = t + 60 + 2 * far;
    walking[i] = 1;
    if (far > 0.05) rows.heading()[i] = Math.atan2(ez, ex);
    const e = rows.body(i);
    if (e) start(i, e);
  }

  /**
   * Standing by someone who's well above or below them (more than a block: up a ledge, down a
   * hole), they aren't together: they move off, along their own level where there's a way. Of
   * the two, one goes (either might, any second). True if they went.
   */
  function apart(i: number): boolean {
    const e = rows.body(i);
    if (!e) return false;
    const y = e.position.y;
    let ax = 0;
    let az = 0;
    let nearest = CLOSE;
    around(i, CLOSE, (j, d) => {
      const o = walking[j] ? null : rows.body(j);
      if (!o || Math.abs(o.position.y - y) <= STEP + 0.25) return;
      ax -= span(px[j] - px[i]) / (d || 1);
      az -= span(pz[j] - pz[i]) / (d || 1);
      if (d < nearest) nearest = d;
    });
    if (nearest >= CLOSE || rng.next() < 0.5) return false;
    const away = Math.hypot(ax, az) < 0.01 ? rng.range(0, Math.PI * 2) : Math.atan2(az, ax);
    const far = GONE - nearest + rng.range(0.5, 1.5);
    for (let tries = 0; tries < 5; tries++) {
      const a = away + (tries ? rng.range(-1.4, 1.4) : 0);
      const g = rows.ground(Math.floor(e.position.x + Math.cos(a) * far), Math.floor(e.position.z + Math.sin(a) * far));
      if (g === null || Math.abs(g - y) > STEP) continue;
      friend[i] = -1;
      go(i, Math.cos(a) * far, Math.sin(a) * far, false);
      return true;
    }
    return false;
  }

  /** A row's second: a step of its walk (on paper, without a body), or whether it stays or goes. */
  function second(i: number) {
    if (walking[i]) {
      if (rows.body(i)) return;
      const ex = span(tx[i] - px[i]);
      const ez = span(tz[i] - pz[i]);
      const d = Math.hypot(ex, ez);
      if (d <= spd[i] && chasing(i)) {
        px[i] = tx[i];
        pz[i] = tz[i];
        place(i);
      } else if (d <= spd[i] || t > cap[i]) {
        if (d <= spd[i]) {
          px[i] = tx[i];
          pz[i] = tz[i];
        }
        place(i);
        arrive(i);
      } else {
        px[i] = wrap(px[i] + (ex / d) * spd[i]);
        pz[i] = wrap(pz[i] + (ez / d) * spd[i]);
        place(i);
      }
      return;
    }
    // (About to go after a friend: nothing else to decide.)
    if (after[i] > 0) return;
    // (Away from their keyboard: nothing at all, till they're back.)
    if (afk[i] > 0) {
      if (t < afk[i] && idling) return;
      afk[i] = 0;
      stillSince[i] = t;
      rows.away?.(i, false);
    } else if (idling && prone[i] > 0 && rng.next() < prone[i]) {
      afk[i] = t + rng.range(AWAY[0], AWAY[1]);
      small.cancel(i);
      const e = rows.body(i);
      if (e) {
        e.stop();
        e.setSpeed(1);
        e.lookAt(null);
      }
      rows.away?.(i, true);
      return;
    }
    if (apart(i)) return;
    // Who's by them, how well known; the two of them a second longer together.
    let group = 0;
    let known = 0;
    around(i, CLOSE, (j) => {
      group++;
      const key = pair(i, j);
      let ts = tied(i, j);
      if (i < j || walking[j]) {
        together.set(key, ++ts);
        lastClose.set(key, t);
      }
      const tie = Math.log1p(ts);
      if (tie > known) known = tie;
    });
    // Who's lately gone from their side (and is well away now), who's lately come, who's just set off.
    let left5 = 0, left10 = 0, tieLeft5 = 0, tieLeft10 = 0, came5 = 0, came10 = 0, tieCame5 = 0, tieCame10 = 0, off = 0, tieOff = 0;
    for (let k = i * EVENTS; k < (i + 1) * EVENTS; k++) {
      const gone = t - leftT[k];
      if (gone <= 10) {
        const j = leftJ[k];
        const d = Math.hypot(span(px[j] - px[i]), span(pz[j] - pz[i]));
        const tie = Math.log1p(tied(i, j));
        if (d > GONE) {
          left10++;
          if (tie > tieLeft10) tieLeft10 = tie;
          if (gone <= 5) {
            left5++;
            if (tie > tieLeft5) tieLeft5 = tie;
          }
        }
        if (gone <= 3 && walking[j] && d < GONE) {
          off++;
          if (tie > tieOff) tieOff = tie;
        }
      }
      const here = t - cameT[k];
      if (here <= 10) {
        const j = cameJ[k];
        if (Math.hypot(span(px[j] - px[i]), span(pz[j] - pz[i])) < CLOSE) {
          const tie = Math.log1p(tied(i, j));
          came10++;
          if (tie > tieCame10) tieCame10 = tie;
          if (here <= 5) {
            came5++;
            if (tie > tieCame5) tieCame5 = tie;
          }
        }
      }
    }
    // A visit runs its length, and another begins (as someone new to the place would be).
    let tin = t - firstSeen[i];
    if (tin > visit[i]) {
      firstSeen[i] = t;
      born[i] = t;
      visit[i] = rng.range(1200, 5400);
      deps[i] = 0;
      leave(i);
      return;
    }
    const dwell = t - stillSince[i];
    const ld = Math.log1p(dwell);
    F[0] = ld;
    F[1] = ld * ld;
    F[2] = dwell < 5 ? 1 : 0;
    F[3] = Math.log1p(tin);
    F[4] = Math.log1p(USUAL_CROWD);
    F[5] = Math.log1p(group);
    F[6] = group === 0 ? 1 : 0;
    F[7] = known;
    F[8] = 0;
    F[9] = Math.log1p(left5);
    F[10] = tieLeft5;
    F[11] = Math.log1p(left10);
    F[12] = tieLeft10;
    F[13] = Math.log1p(came5);
    F[14] = tieCame5;
    F[15] = Math.log1p(came10);
    F[16] = tieCame10;
    F[17] = Math.log1p(off);
    F[18] = tieOff;
    F[19] = Math.log1p(deps[i]) - Math.log1p(tin / 60);
    F[20] = 0;
    F[21] = 0;
    // (On their own, they're readier to be off: see `restless`.)
    // (And in a crowd, readier with every one too many: crowds thin, they don't pile up.)
    let logit = hazard.b + klass[i] + (group === 0 ? restless : 0) + Math.max(0, group - FULL) * 0.7;
    for (let k = 0; k < F.length; k++) logit += hazard.w[k] * z(k, F[k], hazard.mu, hazard.sd);
    if (rng.next() < 1 / (1 + Math.exp(-logit))) depart(i);
  }

  const world = (game as { world?: GameContext['world'] }).world;
  const info = (x: number, y: number, z: number) => (world ? world.blockInfo(world.getBlock(x, y, z)) : null);
  const liquid = (x: number, y: number, z: number) => !!info(x, y, z)?.liquid;
  const rungs = (x: number, y: number, z: number) => !!info(x, y, z)?.climbable;

  /**
   * Held up, and where they're going is higher than where they are: a ladder near that goes up
   * enough (the nearest), and they're off to its foot. False with none (or nowhere higher to go).
   */
  function ladder(i: number, e: Entity): boolean {
    if (!world) return false;
    const at = e.position;
    // How high they're going: whoever they're walking to, or the ground where the walk ends.
    const to = friend[i] >= 0 ? rows.body(friend[i]) : null;
    const goal = to ? to.position.y : rows.ground(Math.floor(at.x + span(tx[i] - wrap(at.x))), Math.floor(at.z + span(tz[i] - wrap(at.z))));
    if (goal === null || goal < at.y + LADDER_WORTH) return false;
    const fx = Math.floor(at.x);
    const fy = Math.floor(at.y + 0.3);
    const fz = Math.floor(at.z);
    let best = Infinity;
    for (let dz = -LADDER_NEAR; dz <= LADDER_NEAR; dz++) {
      for (let dx = -LADDER_NEAR; dx <= LADDER_NEAR; dx++) {
        const d = Math.hypot(dx, dz);
        if (d >= best) continue;
        // (From the water, one whose foot is over it too: a rung or two above the surface is in reach of a kick.)
        for (let y = fy; y <= fy + (wetAt[i] ? 3 : 1); y++) {
          if (!rungs(fx + dx, y, fz + dz)) continue;
          let top = y + 1;
          while (top < y + 48 && rungs(fx + dx, top, fz + dz)) top++;
          // (Not one that stops short of anywhere, or well short of where they're going.)
          if (top < at.y + LADDER_WORTH || top < goal - 3) break;
          best = d;
          ladderX[i] = fx + dx + 0.5;
          ladderZ[i] = fz + dz + 0.5;
          ladderTop[i] = top;
          break;
        }
      }
    }
    if (best === Infinity) return false;
    climb[i] = 1;
    stuck[i] = 0;
    soak[i] = 0;
    cap[i] = Math.max(cap[i], t + 40);
    e.moveTo({ x: ladderX[i], y: at.y, z: ladderZ[i] });
    return true;
  }

  /** Those on a ladder, every tenth of a second: up it, keeping to it; and at its top, on with their walk. */
  function climbing() {
    for (let k = climbers.length - 1; k >= 0; k--) {
      const i = climbers[k];
      const e = rows.body(i);
      const on = !!e && e.alive && walking[i] === 1 && climb[i] >= 2;
      if (on && climb[i] === 2 && t - climbT[i] < CLIMB_TIME) {
        const at = e.position;
        // (Up, till their feet are clear of what it leads to.)
        if (at.y < ladderTop[i] + 0.5) {
          e.fly(Math.max(-0.4, Math.min(0.4, ladderX[i] - at.x)), 0.85, Math.max(-0.4, Math.min(0.4, ladderZ[i] - at.z)));
          continue;
        }
        // Then off it, onto the ledge it leads to: whichever side has footing at its top (or, with none to be found, the way they're going).
        const x = Math.floor(ladderX[i]);
        const z = Math.floor(ladderZ[i]);
        const top = Math.round(ladderTop[i]);
        let ox = span(tx[i] - px[i]);
        let oz = span(tz[i] - pz[i]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const under = info(x + dx, top - 1, z + dz);
          if (!under?.solid || under.climbable || info(x + dx, top, z + dz)?.solid) continue;
          [ox, oz] = [dx, dz];
          break;
        }
        const l = Math.hypot(ox, oz) || 1;
        offX[i] = ox / l;
        offZ[i] = oz / l;
        climb[i] = 3;
        climbT[i] = t;
      }
      if (on && climb[i] === 3 && t - climbT[i] < STEP_OFF) {
        e.fly(offX[i], 0, offZ[i]);
        continue;
      }
      climbers.splice(k, 1);
      if (!on) {
        if (climb[i] >= 2) climb[i] = 0;
        continue;
      }
      // (Off the top: the walk they were on, from here.)
      climb[i] = 0;
      stuck[i] = 0;
      look[i] = 0;
      start(i, e);
    }
  }

  /** Those in water, every tenth of a second: a kick up while they're under, or held up by a bank (which takes them out over it, or onto a slab laid over the water). */
  function swimming() {
    for (let k = wet.length - 1; k >= 0; k--) {
      const i = wet[k];
      const e = rows.body(i);
      // (On a ladder out of it: the climb has them.)
      if (climb[i] >= 2) continue;
      if (!e || !e.alive || !walking[i] || !wetAt[i]) {
        wet.splice(k, 1);
        wetAt[i] = 0;
        continue;
      }
      const at = e.position;
      const v = e.velocity;
      if (liquid(Math.floor(at.x), Math.floor(at.y + 1.1), Math.floor(at.z)) || Math.hypot(v.x, v.z) < Math.max(0.4, spd[i] * 0.4)) e.jump();
    }
  }

  /** The bodies, twice a second: where they've got to, and whether a walk is there, stuck or out of time. */
  function bodies() {
    for (const i of rows.live()) {
      const e = rows.body(i);
      if (!e || !e.alive) continue;
      const at = e.position;
      px[i] = wrap(at.x);
      pz[i] = wrap(at.z);
      place(i);
      if (!walking[i]) continue;
      const d = Math.hypot(span(tx[i] - px[i]), span(tz[i] - pz[i]));
      const v = e.velocity;
      // (Pushing on and going nowhere: a ledge to hop; and if that's no use, here will do.)
      // (At the heels of someone still walking, they're where they mean to be: not stuck, and not there yet.)
      const heel = chasing(i);
      // (In water they swim: `swimming`. Nobody's stuck who's wet; the walk's own time runs out if it's no use.)
      const inWater = liquid(Math.floor(at.x), Math.floor(at.y + 0.3), Math.floor(at.z));
      if (inWater && !wetAt[i]) wet.push(i);
      wetAt[i] = inWater ? 1 : 0;
      // (On a ladder: `climbing` has them.)
      if (climb[i] >= 2) continue;
      // (In water and getting nowhere: a wall they can't kick out over. A second of it, and every couple after, they look for a ladder out.)
      soak[i] = inWater && Math.hypot(v.x, v.z) < 0.4 ? soak[i] + 0.5 : 0;
      if (!climb[i] && soak[i] >= 1 && soak[i] % 2 === 1 && ladder(i, e)) continue;
      stuck[i] = !inWater && !(heel && d < 0.9) && Math.hypot(v.x, v.z) < Math.min(0.15, spd[i] * 0.5) ? stuck[i] + 0.5 : 0;
      if (climb[i] === 1) {
        // To a ladder's foot: there (or up against it), they take to it.
        if (Math.hypot(ladderX[i] - at.x, ladderZ[i] - at.z) < 0.75 || stuck[i] >= 1 || soak[i] >= 1) {
          climb[i] = 2;
          climbT[i] = t;
          stuck[i] = 0;
          soak[i] = 0;
          e.setSpeed(1);
          climbers.push(i);
        } else if (t > cap[i]) arrive(i);
        continue;
      }
      // (A ledge to hop: one try; then a ladder, if it's up they're going and there's one; another try; then it's no way, and they leave it, and don't go that way next.)
      if ((stuck[i] === 0.5 || stuck[i] === 1.5) && e.onGround) e.jump();
      if (stuck[i] === 1 && ladder(i, e)) continue;
      const blocked = stuck[i] >= STUCK;
      if (blocked) wall[i] = Math.atan2(span(tz[i] - pz[i]), span(tx[i] - px[i]));
      else if (d < 0.6 && !heel) wall[i] = NaN;
      if ((d < 0.6 && !heel) || t > cap[i] || blocked) arrive(i);
    }
  }

  return {
    reset,
    tick() {
      if (n !== rows.count()) reset();
      t += 0.1;
      small.tick(t);
      // Those sprinting with a jump at every step: off the ground again as they land.
      for (let k = hoppers.length - 1; k >= 0; k--) {
        const i = hoppers[k];
        if (!walking[i] || gait[i] !== Gait.SprintJump) {
          hoppers.splice(k, 1);
          continue;
        }
        const e = rows.body(i);
        // (Not on the spot: held up, or at someone's heels with no ground to cover, they keep their feet.)
        // (Nor in the water: there it's the swim that has them, and a sprint's hop is no part of that.)
        if (e && e.alive && e.onGround && !wetAt[i] && stuck[i] === 0 && Math.hypot(e.velocity.x, e.velocity.z) > 0.5 && !liquid(Math.floor(e.position.x), Math.floor(e.position.y + 0.3), Math.floor(e.position.z))) e.jump();
      }
      const phase = ticks++ % 10;
      if (climbers.length) climbing();
      if (wet.length) swimming();
      if (phase % 5 === 0) {
        bodies();
        trail();
      }
      for (let i = phase; i < n; i += 10) second(i);
      // (Pairs who haven't met in half an hour are strangers again: the books stay small.)
      if (ticks % 6000 === 0) {
        for (const [key, at] of lastClose) {
          // (Or one of them has been and gone since.)
          const a = Math.floor(key / PAIRS);
          if (t - at > 1800 || at < born[a] || at < born[key - a * PAIRS]) (lastClose.delete(key), together.delete(key));
        }
      }
    },
    loaded(i) {
      const e = rows.body(i);
      if (!e) return;
      if (walking[i]) start(i, e);
      else e.stop();
      rows.away?.(i, afk[i] > 0);
    },
    unloaded(i) {
      small.cancel(i);
      climb[i] = 0;
      wetAt[i] = 0;
    },
    get gestures() {
      return small.enabled;
    },
    set gestures(on: boolean) {
      small.enabled = on;
    },
    get followers() {
      return following;
    },
    set followers(on: boolean) {
      following = on;
    },
    get afk() {
      return idling;
    },
    set afk(on: boolean) {
      // (Off: whoever's away is back the next time they're looked at.)
      idling = on;
    },
    age(seconds) {
      for (let s = Math.max(0, Math.floor(seconds)); s > 0; s--) {
        t += 1;
        bodies();
        trail();
        for (let i = 0; i < n; i++) second(i);
      }
    },
    stats() {
      let moving = 0;
      let alone = 0;
      let tight = 0;
      let largest = 0;
      let split = 0;
      let grouped = 0;
      let away = 0;
      for (let i = 0; i < n; i++) if (afk[i] > 0) away++;
      const gaits = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        moving += walking[i];
        if (walking[i]) gaits[gait[i]]++;
        let any = false;
        around(i, CLOSE, () => (any = true));
        if (!any) alone++;
        let by = 1;
        around(i, CLOSE, () => by++);
        if (by > largest) largest = by;
        let squeezed = false;
        if (!walking[i]) around(i, SPACE - 0.15, (j) => (squeezed ||= !walking[j]));
        if (squeezed) tight++;
        const e = walking[i] ? null : rows.body(i);
        if (e) {
          let by = false;
          let off = false;
          around(i, CLOSE, (j) => {
            const o = walking[j] ? null : rows.body(j);
            if (!o) return;
            by = true;
            off ||= Math.abs(o.position.y - e.position.y) > STEP + 0.25;
          });
          if (by) grouped++;
          if (off) split++;
        }
      }
      return { moving: n ? moving / n : 0, following: n ? tails.length / n : 0, away: n ? away / n : 0, alone: n ? alone / n : 0, tight: n ? tight / n : 0, largest, split: grouped ? split / grouped : 0, departuresPerHour: n && t > since ? (departures / n) * (3600 / (t - since)) : 0, gaits: gaits.map((g) => (moving ? g / moving : 0)) };
    },
  };
}
