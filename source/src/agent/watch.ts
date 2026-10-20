import { receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import type { Player } from '../platform/api/types';
import type { Headless } from '../platform/host/headless';
import { decode, encode } from '../platform/net/codec';
import { quantize } from '../platform/net/delta';
import type { ClientCommand, HostBatch, ServerWelcome, WireBatch } from '../platform/net/protocol';
import type { SimFrame } from '../platform/sim/sim';
import type { MarmEnv } from './env';

/**
 * Watch mode: an episode shown on MARM's real client, for videos and screenshots of the agent at work. The
 * environment runs headless in a worker thread (scripts/agent-env.mjs --watch), stepping as an action says and
 * blocking while it does; the page's socket is the main thread's, relayed here as messages. A page connects as a
 * game server's client would (welcome, catch-up batch, a batch each step), joins on Play as a spectator (unseen by
 * the world's creatures, unhurt, nothing to build) and is moved each tick to a camera behind the agent. While
 * someone watches, the world runs at `speed` times real time (else as fast as it can, as in evaluation).
 *
 * A watcher is another player in the world, so a watched episode isn't one of the evaluation's: it's for showing.
 * Each reset is a new world: the pages watching are let go (their Reconnect brings them into the next).
 */

/** From the main thread: a page's socket opened, said something, closed. */
export type ToWorker = { t: 'connect'; c: string } | { t: 'command'; c: string; text: string } | { t: 'disconnect'; c: string };
/** To the main thread: something for a page's socket, or close it. */
export type ToMain = { t: 'send'; c: string; text: string } | { t: 'close'; c: string; reason: string };

const DT = 1 / 30;
/** The camera: this far behind the agent and above its feet, turning after it slowly. */
const BACK = 6;
const UP = 3.5;
const TURN = 0.04;

interface Watcher {
  id: string;
  had?: SimFrame;
  player?: Player;
}

export class Watch {
  private h: Headless | null = null;
  private watchers = new Map<string, Watcher>();
  private wall0 = 0;
  private sim0 = 0;
  private camYaw: number | null = null;
  private camY: number | null = null;
  private camPitch: number | null = null;
  private sleeper = new Int32Array(new SharedArrayBuffer(4));

  constructor(
    private port: MessagePort,
    private speed = 1,
    /** `eyes`: through the agent's eyes, where it looks (the default); `chase`: behind and above it. */
    private camera: 'eyes' | 'chase' = 'eyes',
  ) {
    port.on('message', (m: ToWorker) => this.receive(m));
    // Between actions (the agent thinking) the episode's clock stands still, but pages still need batches: steps
    // of no time, the world as it is (its columns, what's on screen), the camera on the agent.
    setInterval(() => {
      if (!this.h || !this.watchers.size) return;
      try {
        this.h.step(0);
      } catch (err) {
        console.error(err);
      }
      this.follow();
    }, 100);
  }

  /** How many pages are watching (joined, on the camera). */
  get watching(): number {
    return [...this.watchers.values()].filter((w) => w.player).length;
  }

  attach(env: MarmEnv) {
    env.hooks.reset = (h) => this.reset(h);
    env.hooks.tick = (h) => this.tick(h);
  }

  private post(m: ToMain) {
    this.port.postMessage(m);
  }

  private reset(h: Headless) {
    for (const c of this.watchers.keys()) this.post({ t: 'close', c, reason: 'a new episode' });
    this.watchers.clear();
    this.h = h;
    this.camYaw = null;
    this.camY = null;
    this.camPitch = null;
    h.host.onStep = (batches) => this.out(batches);
  }

  private receive(m: ToWorker) {
    const h = this.h;
    if (m.t === 'connect') {
      if (!h) return this.post({ t: 'close', c: m.c, reason: 'no episode yet: reset first' });
      const { id, batch } = h.host.connect();
      const sp = h.host.sim.spawn;
      const welcome: ServerWelcome = { t: 'welcome', game: 'sandbox', room: 'public', seed: h.host.seed, player: null, spawn: { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw }, tickRate: 1 / DT };
      if (h.host.blocks.keys.length) welcome.blocks = h.host.blocks.keys;
      this.post({ t: 'send', c: m.c, text: encode(welcome) });
      const frame = batch.frame ? quantize(batch.frame) : undefined;
      this.watchers.set(m.c, { id, had: frame });
      this.post({ t: 'send', c: m.c, text: encode({ events: batch.events, f: frame, time: h.time } satisfies WireBatch) });
      return;
    }
    const w = this.watchers.get(m.c);
    if (!w || !h) return;
    if (m.t === 'disconnect') {
      this.watchers.delete(m.c);
      h.host.disconnect(w.id);
      return;
    }
    const cmd = decode<ClientCommand>(m.text);
    if (cmd.t !== 'start' || w.player) return void h.host.command(w.id, cmd);
    // Play: in the world, as a spectator on the camera (whoever's new among the players is them).
    const before = new Set(h.ctx.players.map((p) => p.id));
    h.host.command(w.id, cmd);
    const p = h.ctx.players.find((q) => !before.has(q.id));
    if (!p) return;
    w.player = p;
    // (On their own handle: `/gamemode spectator <name>` reads only a name's first word, and "Player 2" is the agent's.)
    p.spectate(true);
    p.setCreative(true);
    p.build = false;
    this.follow();
  }

  /** Each step's batches, to the pages: the frame as a patch on the one each has. */
  private out(batches: Map<string, HostBatch>) {
    const h = this.h;
    if (!h) return;
    const frames = h.host.frames;
    for (const [c, w] of this.watchers) {
      const b = batches.get(w.id);
      if (!b) continue;
      let f: unknown;
      if (b.frame) {
        f = frames.patchFor(w.had);
        w.had = frames.current!;
      }
      this.post({ t: 'send', c, text: encode({ events: b.events, f, time: h.time } satisfies WireBatch) });
    }
  }

  /** After each tick of an action: what the pages said, the camera, and (watched) the pace. */
  private tick(h: Headless) {
    for (let m = receiveMessageOnPort(this.port); m; m = receiveMessageOnPort(this.port)) this.receive(m.message as ToWorker);
    if (!this.watching) return;
    this.follow();
    const now = performance.now();
    let due = this.wall0 + ((h.time - this.sim0) / this.speed) * 1000;
    // (Back from a pause, the agent thinking: on from now, not hurrying to catch up.)
    if (now - due > 250) {
      this.wall0 = now;
      this.sim0 = h.time;
      due = now;
    }
    if (due > now) Atomics.wait(this.sleeper, 0, 0, due - now);
  }

  /** The watchers' camera: the agent's eyes, or behind the agent and above, looking at it, turning after it slowly; out of the ground. */
  private follow() {
    const h = this.h;
    if (!h) return;
    const me = h.me.api;
    const a = me.position;
    const yaw = h.me.yaw;
    if (this.camera === 'eyes') {
      // (Its turns eased a little: it snaps round to aim, which would cut.)
      if (this.camYaw === null) this.camYaw = yaw;
      const d = Math.atan2(Math.sin(yaw - this.camYaw), Math.cos(yaw - this.camYaw));
      this.camYaw += d * 0.35;
      this.camPitch = this.camPitch === null ? h.me.pitch : this.camPitch + (h.me.pitch - this.camPitch) * 0.35;
      // (Just in front of its face: from inside its head, its own body shows as a dark band along the bottom.)
      const at = { x: a.x - Math.sin(this.camYaw) * 0.45, y: a.y, z: a.z - Math.cos(this.camYaw) * 0.45 };
      for (const v of this.watchers.values()) v.player?.teleport(at, this.camYaw, this.camPitch);
      return;
    }
    if (this.camYaw === null) this.camYaw = yaw;
    let d = yaw - this.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += d * TURN;
    const w = h.ctx.world;
    const clear = (x: number, y: number, z: number) => w.blockName(w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))) === 'air';
    const eye = { x: a.x, y: a.y + 1.6, z: a.z };
    const at = { x: a.x + Math.sin(this.camYaw) * BACK, y: a.y + UP, z: a.z + Math.cos(this.camYaw) * BACK };
    // Up out of the trees and hills: till the camera's in the air and sees the agent's head, nothing between.
    const sees = (y: number) => {
      if (!clear(at.x, y + 1.6, at.z)) return false;
      const n = 16;
      for (let i = 1; i < n - 2; i++) {
        const t = i / n;
        if (!clear(at.x + (eye.x - at.x) * t, y + 1.6 + (eye.y - y - 1.6) * t, at.z + (eye.z - at.z) * t)) return false;
      }
      return true;
    };
    // (Room round the lens too: no leaf filling the screen.)
    const roomy = (y: number) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (!clear(at.x + dx, y + 1.6 + dy, at.z + dz)) return false;
      return true;
    };
    let rise = 0;
    while (rise < 14 && !(roomy(at.y + rise) && sees(at.y + rise))) rise++;
    // (The agent under a canopy: from just over it, then.)
    if (rise >= 14) for (rise = 0; rise < 20 && !roomy(at.y + rise); rise++);
    // (Up at once, down gently: no dipping into a tree a moment.)
    const want = at.y + rise;
    this.camY = this.camY === null || want > this.camY ? want : this.camY + (want - this.camY) * 0.05;
    at.y = this.camY;
    const back = Math.hypot(at.x - eye.x, at.z - eye.z);
    const pitch = -Math.atan2(at.y + 1.6 - eye.y, back);
    for (const v of this.watchers.values()) v.player?.teleport(at, this.camYaw, pitch);
  }
}
