import type { GameContext, Player, Vec3 } from '@platform';
import { END_ARRIVAL, FRAME_RING, STRONGHOLDS, inEnd } from './end';

/**
 * The End's portal and the way there and back (Mineclonia's, `research/mineclonia-spec.md`, End):
 *
 * - An eye of ender put in an empty frame stays there; when all twelve frames round a 3 × 3 hold one, the 3 × 3
 *   opens into the End portal.
 * - Thrown (used at anything else), an eye flies off toward the nearest stronghold, rising, then drops after a
 *   couple of seconds where it got to (one in five shatters instead).
 * - Stepping into the End portal takes them to the End at once, onto an obsidian platform out from the island
 *   (made afresh each time). The portal in the island's middle takes them back to the world's spawn.
 * - Falling out of the End (to the world's bottom: nothing there but the void) kills.
 */

const COOLDOWN = 4;
/** How long a thrown eye flies, how fast, and how far up it rises. */
const FLIGHT = { time: 2, speed: 12, rise: 3 };
const SHATTER = 0.2;
/** The world's bottom (bodies stop at y 0): in the End, nothing's there but the void. */
const VOID = 1;

export interface EndPortal {
  /** An eye of ender used: put in a frame, or thrown. True if it was used up (or thrown). */
  useEye(player: Player): boolean;
  update(dt: number): void;
}

export function endPortal(game: GameContext): EndPortal {
  const { world } = game;
  const name = (x: number, y: number, z: number) => world.blockName(world.getBlock(x, y, z));
  const loaded = (x: number, y: number, z: number) => {
    const id = world.getBlock(x, y, z);
    return id >= 0 && id !== 65535;
  };

  /** A frame filled at (x, y, z): if a whole ring of them is round a 3 × 3 now, it opens. */
  function opens(x: number, y: number, z: number): boolean {
    for (const [ox, oz] of FRAME_RING) {
      const cx = x - ox, cz = z - oz;
      if (!FRAME_RING.every(([dx, dz]) => name(cx + dx, y, cz + dz) === 'end_portal_frame_filled')) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) world.setBlock(cx + dx, y, cz + dz, 'end_portal');
      game.fx.burst({ x: cx + 0.5, y: y + 1, z: cz + 0.5 }, { color: '#9ff0d8', count: 40, speed: 3, glow: 1, size: 0.12 });
      return true;
    }
    return false;
  }

  /** The nearest stronghold, across the ground. */
  const nearest = (p: Vec3) => STRONGHOLDS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));

  /** An eye flying off toward the nearest stronghold: a trail of green sparks, then it drops (or shatters). */
  function fly(player: Player) {
    const from = player.eye;
    const s = nearest(from);
    const dx = s.x + 0.5 - from.x, dz = s.z + 0.5 - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const reach = Math.min(d, FLIGHT.speed * FLIGHT.time);
    const at = (t: number): Vec3 => {
      const f = Math.min(1, t / FLIGHT.time);
      return { x: from.x + (dx / d) * reach * f, y: from.y + FLIGHT.rise * Math.min(1, f * 2), z: from.z + (dz / d) * reach * f };
    };
    for (let t = 0; t <= FLIGHT.time; t += 0.1) {
      game.clock.after(t, () => game.fx.burst(at(t), { color: '#6fe0a0', count: 3, speed: 0.3, glow: 0.8, size: 0.1 }));
    }
    game.clock.after(FLIGHT.time, () => {
      const end = at(FLIGHT.time);
      if (Math.random() < SHATTER) game.fx.burst(end, { color: '#2fae6e', count: 14, speed: 2, size: 0.1 });
      else game.items.spawnPickup('eye_of_ender', end, { velocity: { x: 0, y: 0, z: 0 } });
    });
  }

  function useEye(player: Player): boolean {
    const held = player.inventory.held;
    if (held?.item !== 'eye_of_ender') return false;
    const hit = world.raycast(player.eye, player.look, 4.6);
    if (hit && name(hit.x, hit.y, hit.z) === 'end_portal_frame') {
      world.setBlock(hit.x, hit.y, hit.z, 'end_portal_frame_filled');
      player.inventory.take('eye_of_ender', 1);
      opens(hit.x, hit.y, hit.z);
      return true;
    }
    // (Into a frame with one already, or at nothing: it's thrown.)
    if (hit && name(hit.x, hit.y, hit.z) === 'end_portal_frame_filled') return true;
    player.inventory.take('eye_of_ender', 1);
    player.viewModel.play('swing');
    fly(player);
    return true;
  }

  // ------------------------------------------------------------------------------------------ the journey
  const cooldown = new Map<string, number>();
  /** Those on their way: frozen where they're going until it's there. */
  const going = new Map<string, { to: Vec3; end: boolean; waited: number }>();

  function leave(player: Player) {
    const end = !inEnd(player.position.x);
    const to = end ? END_ARRIVAL : { x: game.world.spawn.x, y: game.world.spawn.y, z: game.world.spawn.z };
    going.set(player.id, { to, end, waited: 0 });
    player.teleport({ x: to.x + 0.5, y: to.y, z: to.z + 0.5 }, end ? -Math.PI / 2 : player.yaw);
    player.freeze(true);
  }

  function arrive(player: Player, g: { to: Vec3; end: boolean }) {
    const { x, y, z } = g.to;
    if (g.end) {
      // A platform of obsidian, 5 × 5, with room over it (Minecraft's).
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          world.setBlock(x + dx, y - 1, z + dz, 'obsidian');
          for (let dy = 0; dy <= 2; dy++) world.setBlock(x + dx, y + dy, z + dz, 'air');
        }
      }
      player.teleport({ x: x + 0.5, y, z: z + 0.5 }, -Math.PI / 2);
    } else {
      player.teleport({ x: x + 0.5, y: Math.max(y, world.surfaceY(Math.floor(x), Math.floor(z)) + 1), z: z + 0.5 });
    }
    player.freeze(false);
    cooldown.set(player.id, COOLDOWN);
  }

  return {
    useEye,
    update(dt) {
      for (const player of game.players) {
        if (player.bot) continue;
        const id = player.id;
        const g = going.get(id);
        if (g) {
          g.waited += dt;
          if (loaded(g.to.x, Math.max(g.to.y, 1), g.to.z) || g.waited > 20) {
            going.delete(id);
            arrive(player, g);
          }
          continue;
        }
        const p = player.position;
        // Fallen out of the End: dead.
        if (inEnd(p.x) && p.y < VOID && player.alive) player.damage(1000, { cause: 'world', knockback: 0 });
        const left = (cooldown.get(id) ?? 0) - dt;
        if (left > 0) {
          cooldown.set(id, left);
          continue;
        }
        cooldown.delete(id);
        if (player.alive && name(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === 'end_portal') leave(player);
      }
    },
  };
}
