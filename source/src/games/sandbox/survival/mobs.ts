import { Models, type Behavior, type Entity, type GameContext, type ModelPart, type Player } from '@platform';
import { inEnd } from './end';
import { inNether } from './nether';

/**
 * Minecraft's night: zombies, skeletons, spiders and creepers come out of the dark round anyone playing survival
 * (never near a creative builder or a spectator: they don't notice them), and go for them.
 *
 * - A zombie walks at them and hits (3); a skeleton keeps its distance and shoots arrows (2 to 4); a spider runs
 *   and pounces (2); a creeper creeps up, hisses for a second and a half, and blows up (Minecraft's 3-radius
 *   blast: it breaks blocks).
 * - They spawn after dark, 24 to 44 blocks from a survivor, on the ground under the open sky, up to 10 round each
 *   survivor; never in the Nether or the End.
 * - Come the day, zombies and skeletons out under the sky burn; anything 96 blocks from everyone goes.
 * - Each drops what Minecraft's do (rotten flesh, bones, string, gunpowder).
 *
 * Their skins are painted here in Minecraft's skin layout (no picture files).
 */

type Kind = 'zombie' | 'skeleton' | 'spider' | 'creeper';

const ATLAS = 'survival_mobs';
/** Where each skin is in the atlas. */
const SKIN: Record<Kind, [number, number]> = { zombie: [0, 0], skeleton: [64, 0], creeper: [128, 0], spider: [192, 0] };
/** How likely each is (out of the lot). */
const WEIGHT: Record<Kind, number> = { zombie: 40, skeleton: 30, spider: 20, creeper: 10 };
/** The most round one survivor, how far out they come and go, how often the night tries. */
const CAP = 10;
const NEAR = 24;
const FAR = 44;
const GONE = 96;
const TRY = 1.5;
/** How far they notice a survivor. */
const SIGHT = 32;

// -------------------------------------------------------------------------------------------- skins

/** A repeatable hash of a texel, for speckle. */
const speck = (x: number, y: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + k * 69069) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Paint the mobs' skins: each a Minecraft-layout skin, region by region (head, body, arms, legs), speckled. */
function paintSkins(): { width: number; height: number; pixels: Uint8Array } {
  const width = 256, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, c: string, k = 0, vary = 0.12) => {
    const [r, g, b] = hex(c);
    const f = 1 - vary / 2 + speck(x, y, k) * vary;
    const o = (y * width + x) * 4;
    pixels[o] = Math.min(255, r * f);
    pixels[o + 1] = Math.min(255, g * f);
    pixels[o + 2] = Math.min(255, b * f);
    pixels[o + 3] = 255;
  };
  const rect = (ox: number, oy: number, x0: number, y0: number, w: number, h: number, c: string | ((x: number, y: number) => string), k = 0) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(ox + x, oy + y, typeof c === 'string' ? c : c(x, y), k);
  };
  // A humanoid's face on its head's front (8..16, 8..16 of the skin): eyes, and a mouth if asked.
  const face = (ox: number, oy: number, skin: string, eyes: string, mouth?: string) => {
    rect(ox, oy, 8, 8, 8, 8, skin, 1);
    rect(ox, oy, 9, 12, 2, 1, eyes);
    rect(ox, oy, 13, 12, 2, 1, eyes);
    if (mouth) rect(ox, oy, 10, 14, 4, 1, mouth);
  };

  // Zombie: green, a torn blue shirt, purple trousers.
  {
    const [ox, oy] = SKIN.zombie;
    rect(ox, oy, 0, 0, 32, 16, '#4f7f3a', 2);
    face(ox, oy, '#4f7f3a', '#1b2e14', '#2e4a22');
    rect(ox, oy, 16, 16, 24, 16, (x, y) => (y > 27 && speck(x, y, 3) < 0.3 ? '#4f7f3a' : '#2f8fa0'), 4);
    rect(ox, oy, 40, 16, 16, 16, (_x, y) => (y < 20 ? '#2f8fa0' : '#4f7f3a'), 5);
    rect(ox, oy, 0, 16, 16, 16, (_x, y) => (y > 28 ? '#3a3a3a' : '#4a3f8f'), 6);
  }
  // Skeleton: bone white, dark sockets.
  {
    const [ox, oy] = SKIN.skeleton;
    rect(ox, oy, 0, 0, 32, 16, '#c8c8c8', 7);
    face(ox, oy, '#c8c8c8', '#1a1a1a', '#3a3a3a');
    rect(ox, oy, 16, 16, 24, 16, (x, y) => ((y - 16) % 3 === 0 && x > 18 && x < 38 ? '#3c3c3c' : '#bdbdbd'), 8);
    rect(ox, oy, 40, 16, 16, 16, '#c4c4c4', 9);
    rect(ox, oy, 0, 16, 16, 16, '#c4c4c4', 10);
  }
  // Creeper: mottled green all over, the face of black holes.
  {
    const [ox, oy] = SKIN.creeper;
    const mottle = (x: number, y: number) => (speck(x >> 1, y >> 1, 11) < 0.25 ? '#a8e090' : speck(x, y, 12) < 0.3 ? '#3f8f2f' : '#5fbf47');
    rect(ox, oy, 0, 0, 64, 32, mottle, 13);
    rect(ox, oy, 9, 10, 2, 2, '#0a0a0a');
    rect(ox, oy, 13, 10, 2, 2, '#0a0a0a');
    rect(ox, oy, 11, 12, 2, 2, '#0a0a0a');
    rect(ox, oy, 10, 13, 4, 2, '#0a0a0a');
    rect(ox, oy, 10, 15, 1, 1, '#0a0a0a');
    rect(ox, oy, 13, 15, 1, 1, '#0a0a0a');
  }
  // Spider: dark brown-grey, red eyes on its head's front.
  {
    const [ox, oy] = SKIN.spider;
    rect(ox, oy, 0, 0, 64, 32, (x, y) => (speck(x, y, 14) < 0.2 ? '#4a3c34' : '#2e2622'), 15);
    rect(ox, oy, 40, 12, 8, 8, '#2e2622', 16);
    for (const [x, y] of [[41, 14], [43, 13], [44, 13], [46, 14], [42, 16], [45, 16]]) put(ox + x, oy + y, '#d81e1e', 0, 0);
  }
  return { width, height, pixels };
}

/** A creeper: a head on a tall body on four short legs (Minecraft's layout: legs 4×6×4 at the skin's 0,16). */
function creeperModel(o: [number, number]) {
  const add = (uv: [number, number]): [number, number] => [o[0] + uv[0], o[1] + uv[1]];
  const leg = (name: string, x: number, z: number): ModelPart => ({ name, size: [4, 6, 4], uv: add([0, 16]), pivot: [x, 6, z], offset: [-2, -6, -2] });
  const parts: ModelPart[] = [
    { name: 'body', size: [8, 12, 4], uv: add([16, 16]), pivot: [0, 6, 0], offset: [-4, 0, -2] },
    { name: 'head', size: [8, 8, 8], uv: add([0, 0]), pivot: [0, 18, 0], offset: [-4, 0, -4] },
    leg('legR', -2, 4),
    leg('legL', 2, 4),
    leg('armR', -2, -4),
    leg('armL', 2, -4),
  ];
  return { rig: 'humanoid' as const, parts, atlas: ATLAS, scale: 1 };
}

// -------------------------------------------------------------------------------------------- behaviour

export function mobs(game: GameContext, survives: (p: Player) => boolean) {
  game.items.atlas(ATLAS, paintSkins());

  /** The survivor a mob goes for: the nearest playing survival within sight, alive, in the same world. */
  const prey = (self: Entity): Player | null => {
    let best: Player | null = null;
    let d = SIGHT;
    for (const p of game.players) {
      if (p.bot || !p.alive || !survives(p)) continue;
      const e = self.distanceTo(p);
      if (e < d) {
        d = e;
        best = p;
      }
    }
    return best;
  };

  /** Nobody to go for: stand about. */
  const idle = (self: Entity) => {
    self.stop();
    self.lookAt(null);
  };

  const zombie: Behavior = (self, _g, dt) => {
    const s = self.data as { cd?: number };
    s.cd = Math.max(0, (s.cd ?? 0) - dt);
    const t = prey(self);
    if (!t) return idle(self);
    self.moveTo(t);
    self.lookAt(t);
    if (self.distanceTo(t) < 1.6 && s.cd <= 0 && self.canSee(t)) {
      s.cd = 1;
      self.animate('attack');
      t.damage(3, { source: self, knockback: 1, cause: 'melee' });
    }
  };

  const skeleton: Behavior = (self, g, dt) => {
    const s = self.data as { cd?: number; draw?: number; strafe?: number; flip?: number };
    s.cd = (s.cd ?? 1.5) - dt;
    s.flip = (s.flip ?? 0) - dt;
    if (s.flip <= 0) {
      s.strafe = g.rng.chance(0.5) ? 1 : -1;
      s.flip = g.rng.range(1.5, 3.5);
    }
    const t = prey(self);
    if (!t) return idle(self);
    const d = self.distanceTo(t);
    if (d > 16 || !self.canSee(t)) {
      s.draw = undefined;
      self.moveTo(t);
      self.lookAt(null);
      return;
    }
    self.lookAt(t);
    const e = self.position, p = t.position;
    const l = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    const [nx, nz] = [(e.x - p.x) / l, (e.z - p.z) / l];
    const away = d < 6 ? 1 : d > 11 ? -1 : 0;
    const st = (s.strafe ?? 1) * 0.6;
    self.moveDirection(nx * away - nz * st, nz * away + nx * st);
    if (s.draw !== undefined) {
      s.draw -= dt;
      if (s.draw > 0) return;
      s.draw = undefined;
      s.cd = g.rng.range(1.6, 2.4);
      self.animate('attack');
      self.shoot({ sprite: 'arrow', speed: 26, gravity: 12, damage: 2 + Math.floor(g.rng.next() * 3), knockback: 0.6 }, t, { lead: 0.3, spread: 0.04 });
    } else if (s.cd <= 0) {
      s.draw = 0.6;
      self.animate('raise');
    }
  };

  const spider: Behavior = (self, _g, dt) => {
    const s = self.data as { cd?: number; hit?: number };
    s.cd = Math.max(0, (s.cd ?? 1) - dt);
    s.hit = Math.max(0, (s.hit ?? 0) - dt);
    const t = prey(self);
    if (!t) return idle(self);
    const d = self.distanceTo(t);
    self.moveTo(t);
    self.lookAt(t);
    if (self.onGround && d > 2.5 && d < 6 && s.cd <= 0 && self.canSee(t)) {
      const e = self.position, p = t.position;
      const l = Math.hypot(p.x - e.x, p.z - e.z) || 1;
      self.impulse(((p.x - e.x) / l) * 7, 5, ((p.z - e.z) / l) * 7);
      s.cd = 2.5;
    }
    if (d < 1.4 && s.hit <= 0) {
      s.hit = 1;
      self.animate('attack');
      t.damage(2, { source: self, knockback: 0.8, cause: 'melee' });
    }
  };

  const creeper: Behavior = (self, g, dt) => {
    const s = self.data as { fuse?: number };
    const t = prey(self);
    if (s.fuse !== undefined) {
      // Hissing: it stands and swells; out of reach, it calms down.
      self.stop();
      s.fuse -= dt;
      if (!t || self.distanceTo(t) > 7) {
        s.fuse = undefined;
        self.glow(null);
        return;
      }
      self.glow(Math.floor(s.fuse * 6) % 2 ? '#ffffff' : null);
      if (s.fuse <= 0) {
        const at = self.position;
        self.remove();
        g.world.explode({ x: at.x, y: at.y + 0.5, z: at.z }, 3, { damage: [22, 2], reach: 7, knockback: 1.4 });
      }
      return;
    }
    if (!t) return idle(self);
    self.moveTo(t);
    self.lookAt(t);
    if (self.distanceTo(t) < 3 && self.canSee(t)) {
      s.fuse = 1.5;
      g.audio.play('fuse', { at: self.position });
    }
  };

  const humanoid = (k: 'zombie' | 'skeleton') => ({ ...Models.humanoid({ skin: SKIN[k], atlas: ATLAS, build: k === 'skeleton' ? ('thin' as const) : ('normal' as const) }), limbs: 'solid' as const });
  game.entities.define('zombie', { name: 'Zombie', model: humanoid('zombie'), hitbox: { width: 0.6, height: 1.95 }, health: 20, speed: 2.3, ai: zombie, drops: [{ item: 'rotten_flesh', chance: 0.8, count: 1 }, { item: 'iron_ingot', chance: 0.025 }] });
  game.entities.define('skeleton', { name: 'Skeleton', model: humanoid('skeleton'), hitbox: { width: 0.6, height: 1.99 }, health: 20, speed: 2.5, ai: skeleton, drops: [{ item: 'bone', chance: 0.8, count: 1 }] });
  game.entities.define('spider', { name: 'Spider', model: Models.spider({ skin: SKIN.spider, atlas: ATLAS }), hitbox: { width: 1.4, height: 0.9 }, health: 16, speed: 3.2, ai: spider, drops: [{ item: 'string', chance: 0.8, count: 1 }] });
  game.entities.define('creeper', { name: 'Creeper', model: creeperModel(SKIN.creeper), hitbox: { width: 0.6, height: 1.7 }, health: 20, speed: 2.3, ai: creeper, drops: [{ item: 'gunpowder', chance: 0.8, count: 1 }] });
  const KINDS = Object.keys(WEIGHT) as Kind[];
  const total = KINDS.reduce((n, k) => n + WEIGHT[k], 0);
  const pick = () => {
    let r = game.rng.next() * total;
    for (const k of KINDS) if ((r -= WEIGHT[k]) < 0) return k;
    return 'zombie';
  };

  // -------------------------------------------------------------------------------------------- night and day
  const night = () => game.env.time < 0.23 || game.env.time > 0.77;
  const mine = () => KINDS.flatMap((k) => game.entities.all(k));
  /** Out under the sky (nothing over it but air): the sun reaches it. */
  const open = (at: { x: number; y: number; z: number }) => game.world.surfaceY(Math.floor(at.x), Math.floor(at.z)) < at.y + 1;

  let tryIn = TRY;
  let burnIn = 0.5;
  function update(dt: number) {
    const survivors = game.players.filter((p) => !p.bot && p.alive && survives(p) && !inNether(p.position.x) && !inEnd(p.position.x));
    const all = mine();
    // Too far from everyone (the crowd of bots aside): gone.
    for (const m of all) {
      const near = game.players.some((p) => !p.bot && Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z) < GONE);
      if (!near) m.remove();
    }
    // Daylight: zombies and skeletons under the open sky burn.
    burnIn -= dt;
    if (burnIn <= 0) {
      burnIn = 0.5;
      if (!night()) for (const m of all) if ((m.type === 'zombie' || m.type === 'skeleton') && m.alive && open(m.position)) m.damage(1, { cause: 'fire', knockback: 0 });
    }
    // After dark, more come out round each survivor.
    tryIn -= dt;
    if (tryIn > 0 || !night()) return;
    tryIn = TRY;
    for (const p of survivors) {
      const round = all.filter((m) => Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z) < FAR + 8).length;
      if (round >= CAP) continue;
      const a = game.rng.next() * Math.PI * 2;
      const r = NEAR + game.rng.next() * (FAR - NEAR);
      const x = Math.floor(p.position.x + Math.cos(a) * r);
      const z = Math.floor(p.position.z + Math.sin(a) * r);
      const y = game.world.surfaceY(x, z);
      if (y < 1) continue;
      const ground = game.world.blockInfo(game.world.getBlock(x, y, z));
      // (On solid ground, not on water, lava or a tree's leaves.)
      if (!ground || !ground.solid || ground.liquid || ground.name.endsWith('_leaves')) continue;
      game.entities.spawn(pick(), { x: x + 0.5, y: y + 1, z: z + 0.5 }, { yaw: game.rng.next() * Math.PI * 2 });
    }
  }
  return { update };
}
