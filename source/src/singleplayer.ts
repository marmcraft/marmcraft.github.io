import type { ClientCommand, HostBatch, ServerWelcome } from './platform/net/protocol';
import type { Link } from './platform/client/link';
import { GameHost } from './platform/host/game';
import type { SavedPlayer, SavedWorld, Store } from './platform/host/store';
import { loadEngine } from './platform/engine/wasm';
import { games } from './games/server';

/**
 * Singleplayer: MARM's host running in the page itself, no server (after mconline's `LocalLink`). The screen
 * talks to it as it would to a server, through the same messages, stepped 30 times a second here. The world is
 * kept in this browser's localStorage (its edits, its time of day, the game's own data), saved every 10 seconds
 * and when the page goes. This file is the one place the browser's build reaches the host (see
 * scripts/check-boundaries.mjs); it's loaded only when playing alone.
 */

const TICK = 1 / 30;
const SAVE_EVERY = 10;
const KEY = 'marm.single';

/** A store in localStorage: the world, players' places (by name) and the game's data, each under a key of its own. */
class LocalStore implements Store {
  private values: Map<string, unknown>;
  private places: Record<string, SavedPlayer>;
  private dirty = false;

  constructor() {
    this.values = new Map(Object.entries(read<Record<string, unknown>>('data') ?? {}));
    this.places = read<Record<string, SavedPlayer>>('players') ?? {};
  }

  world(): SavedWorld | null {
    const w = read<Omit<SavedWorld, 'edits'> & { edits: string | null }>('world');
    return w ? { ...w, edits: w.edits ? fromBase64(w.edits) : null } : null;
  }

  saveWorld(w: SavedWorld) {
    write('world', { ...w, edits: w.edits ? toBase64(w.edits) : null });
  }

  player(name: string) {
    return this.places[name] ?? null;
  }

  savePlayer(name: string, p: SavedPlayer) {
    this.places[name] = { ...p };
    write('players', this.places);
  }

  forgetPlayer(name: string) {
    delete this.places[name];
    write('players', this.places);
  }

  players() {
    return { ...this.places };
  }

  data() {
    return this.values;
  }

  put() {
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    write('data', Object.fromEntries(this.values));
  }

  close() {
    this.flush();
  }
}

function read<T>(part: string): T | null {
  try {
    const s = localStorage.getItem(`${KEY}.${part}`);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function write(part: string, value: unknown) {
  try {
    localStorage.setItem(`${KEY}.${part}`, JSON.stringify(value));
  } catch (err) {
    // (Full, or no storage: this save is lost; play goes on.)
    console.warn(`Couldn't keep the world's ${part} in this browser`, err);
  }
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The stock host and client messages, carried in the page instead of over a socket. */
class LocalLink implements Link {
  onClose: (() => void) | null = null;
  readonly url = `${location.origin}/singleplayer`;
  readonly welcome: ServerWelcome;
  private handler: ((b: HostBatch) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private input: Extract<ClientCommand, { t: 'input' }> | null = null;
  private sinceSave = 0;

  constructor(private host: GameHost) {
    this.welcome = { t: 'welcome', game: host.def.id, room: 'public', seed: host.seed, player: host.sim.local.id, spawn: host.sim.spawn, tickRate: 30, blocks: host.blocks.keys };
    // (Kept as the page goes.)
    addEventListener('pagehide', () => host.persist());
  }

  get onBatch() {
    return this.handler;
  }

  set onBatch(fn: ((b: HostBatch) => void) | null) {
    this.handler = fn;
    if (fn && !this.timer) {
      this.deliver(0);
      this.timer = setInterval(() => this.deliver(TICK), TICK * 1000);
    }
  }

  private deliver(dt: number) {
    if (this.input) {
      this.host.command(this.host.sim.local.id, this.input);
      this.input = null;
    }
    const b = this.host.step(dt, true).get(this.host.sim.local.id);
    if (b) this.handler?.(structuredClone({ ...b, time: performance.now() / 1000 }));
    this.sinceSave += dt;
    if (this.sinceSave >= SAVE_EVERY) {
      this.sinceSave = 0;
      this.host.persist();
    }
  }

  send(command: ClientCommand) {
    const next = structuredClone(command);
    if (next.t === 'input') {
      // (Several frames' inputs between two steps: every click, key press and wheel turn kept.)
      const old = this.input;
      if (old) {
        next.dt = Math.min(0.1, (old.dt ?? 0) + (next.dt ?? 0));
        next.input.pressed = [...new Set([...old.input.pressed, ...next.input.pressed])];
        next.input.clicked |= old.input.clicked;
        next.input.wheel += old.input.wheel;
        next.input.mouseX += old.input.mouseX;
        next.input.mouseY += old.input.mouseY;
      }
      this.input = next;
      return;
    }
    this.host.command(this.host.sim.local.id, next);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.handler = null;
    this.host.persist();
    this.host.dispose();
  }
}

/** Start MARM's world in this page: the engine, the host (the kept world, or a fresh one), the link to it. */
export async function singleplayer(): Promise<Link> {
  const module = await loadEngine();
  const store = new LocalStore();
  const seed = store.world()?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const host = new GameHost(games[0], { engine: module, seed, store, player: { id: 'p1', name: 'Player' } });
  return new LocalLink(host);
}
