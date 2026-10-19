import type { Entity, GameContext, Player } from '@platform';

/**
 * The things people standing about do with their whole bodies, for the crowd's bodies: they turn
 * to face whoever they're with (or a player who's come right up, or just another way), take a
 * step, hop, throw up their arms, take a swing at the air. Any of them can go together: a step
 * while the arms are up, a hop and a swing.
 *
 * The finer things (the head turning, nods, breathing, a hand moving as if talking) aren't here:
 * each screen works those out for itself, every frame, so they're smooth (`client/life.ts`).
 *
 * Only bodies do any of this (the ones in someone's view), and only while they stand. Each has the
 * time it's next looked at (every few seconds); what it does then is a few draws and a look at
 * who's within a couple of metres. Facing someone is one instruction to the engine, which keeps
 * them faced from then on. A step, and arms held up, end by a short list worked through every
 * tenth of a second.
 */
export interface GestureRows {
  body(i: number): Entity | null;
  live(): readonly number[];
  /** Whether a row is standing (not on a walk). */
  standing(i: number): boolean;
  /** Each row within `r` metres of one: `fn(j)`. */
  around(i: number, r: number, fn: (j: number) => void): void;
}

export interface Gestures {
  /** A tenth of a second has gone by (`t`: the crowd's clock, in seconds). */
  tick(t: number): void;
  /** A row is off on a walk (or lost its body): whatever it was doing is dropped. */
  cancel(i: number): void;
  /** The rows are new. */
  reset(count: number): void;
  enabled: boolean;
}

/** Something to end (a step to stop, arms to lower, another hop to take): when, and what. */
interface Ending {
  i: number;
  at: number;
  end: (e: Entity) => void;
}

/** How near a player is noticed, and how near one is turned to. */
const NOTICE = 9;
const UP_CLOSE = 3.5;

export function gestures(game: GameContext, rows: GestureRows): Gestures {
  const rng = game.rng;
  let nextAt = new Float32Array(0);
  let faced = new Uint8Array(0);
  let endings: Ending[] = [];
  let ticks = 0;
  let enabled = true;

  /** What someone standing does next. */
  function choose(i: number, e: Entity, t: number) {
    const at = e.position;
    // Who they're with, and the nearest player (if one's near enough to notice).
    const group: number[] = [];
    rows.around(i, 2.6, (j) => rows.body(j) && group.push(j));
    let player: Player | null = null;
    let near = NOTICE;
    for (const p of game.players) {
      if (p.bot || p.spectating) continue;
      const d = Math.hypot(p.position.x - at.x, p.position.y - at.y, p.position.z - at.z);
      if (d < near) [player, near] = [p, d];
    }
    const company = group.length > 0 || near < UP_CLOSE;
    nextAt[i] = t + (company ? rng.range(2.5, 6) : rng.range(4, 10));
    const later = (seconds: number, end: (e: Entity) => void) => endings.push({ i, at: t + seconds, end });

    // Whom they face: it changes now and then, not every time (people settle toward someone).
    if (!faced[i] || rng.next() < 0.35) {
      faced[i] = 1;
      if (player && near < UP_CLOSE && rng.next() < 0.6) e.lookAt(player);
      else if (group.length) e.lookAt(rows.body(group[rng.int(0, group.length - 1)]));
      else {
        const a = rng.range(0, Math.PI * 2);
        e.lookAt({ x: at.x + Math.cos(a) * 8, y: at.y + 1.6, z: at.z + Math.sin(a) * 8 });
      }
    }
    // And, each on its own chance (so any of them together): a step, a hop or two, arms up, a swing.
    if (rng.next() < 0.14) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.25, 0.6);
      e.setSpeed(0.4);
      e.moveTo({ x: at.x + Math.cos(a) * d, y: at.y, z: at.z + Math.sin(a) * d });
      later(rng.range(0.5, 0.9), (b) => (b.stop(), b.setSpeed(1)));
    }
    if (rng.next() < (company ? 0.07 : 0.03)) {
      if (e.onGround) e.jump();
      if (rng.next() < 0.4) later(0.6, (b) => b.onGround && b.jump());
    }
    if (rng.next() < (company ? 0.06 : 0.02)) {
      e.animate('raise');
      later(rng.range(0.8, 1.8), (b) => b.animate('none'));
    }
    if (company && rng.next() < 0.06) e.animate('attack');
  }

  function cancel(i: number) {
    faced[i] = 0;
    if (!endings.some((d) => d.i === i)) return;
    endings = endings.filter((d) => d.i !== i);
    rows.body(i)?.animate('none');
  }

  return {
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      enabled = on;
      if (on) return;
      // Off: everyone drops what they were doing, and faces the way they were going.
      for (const i of rows.live()) {
        cancel(i);
        const e = rows.body(i);
        if (e && rows.standing(i)) {
          e.lookAt(null);
          e.stop();
          e.setSpeed(1);
        }
      }
    },
    reset(count) {
      nextAt = new Float32Array(count);
      faced = new Uint8Array(count);
      endings = [];
    },
    cancel,
    tick(t) {
      if (!enabled) return;
      for (let k = endings.length - 1; k >= 0; k--) {
        const d = endings[k];
        if (t < d.at) continue;
        endings.splice(k, 1);
        const e = rows.body(d.i);
        if (e && e.alive && rows.standing(d.i)) d.end(e);
      }
      if (ticks++ % 5) return;
      for (const i of rows.live()) {
        if (t < nextAt[i] || !rows.standing(i)) continue;
        const e = rows.body(i);
        if (e && e.alive) choose(i, e, t);
      }
    },
  };
}
