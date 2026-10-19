import { Blueprint } from '@platform';

/**
 * Where Sandbox's End is, and its strongholds. The End is the same world west of x −60,000 (the generator makes it:
 * `world.end`), its island round x −100,000, z 0. The overworld's strongholds sit deep underground in rings round
 * the origin, as Minecraft's do (3 between 1,408 and 2,688 blocks out, 6 between 4,480 and 5,760, 10 between
 * 7,552 and 8,832), each a stone-brick room with the End portal's twelve frames round a pool of lava, a few
 * frames already holding an eye.
 *
 * They're placed the same for every world (by a fixed seed, not the world's): the screens and the server both
 * need them before the world's seed is known.
 */
export const END_X = -60_000;
export const END_MIDDLE = -100_000;
/** Where they arrive in the End: on an obsidian platform out from the island (Minecraft's 100, 48, 0). */
export const END_ARRIVAL = { x: END_MIDDLE + 100, y: 49, z: 0 };

export const inEnd = (x: number) => x < END_X;

/** A stronghold's portal room: its middle (the portal's middle cell) and its floor. */
export interface Stronghold {
  x: number;
  y: number;
  z: number;
}

const RINGS = [
  { count: 3, from: 1408, to: 2688 },
  { count: 6, from: 4480, to: 5760 },
  { count: 10, from: 7552, to: 8832 },
];

/** A small repeatable random from a seed (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STRONGHOLDS: Stronghold[] = (() => {
  const r = random(0x5354524f);
  const out: Stronghold[] = [];
  for (const ring of RINGS) {
    const start = r() * Math.PI * 2;
    for (let i = 0; i < ring.count; i++) {
      const a = start + (i / ring.count) * Math.PI * 2 + (r() - 0.5) * 0.3;
      const d = ring.from + r() * (ring.to - ring.from);
      out.push({ x: Math.round(Math.cos(a) * d), y: 20 + Math.floor(r() * 10), z: Math.round(Math.sin(a) * d) });
    }
  }
  return out;
})();

/** The twelve frames round a portal's middle cell, as offsets (x, z): three along each side of its 3 × 3. */
export const FRAME_RING: [number, number][] = [-1, 0, 1].flatMap((i) => [[i, -2], [i, 2], [-2, i], [2, i]] as [number, number][]);

/** A stronghold's portal room as a structure: 15 × 9 × 15 of stone brick (some mossy), hollow; the frames round lava. */
export function strongholdRoom(s: Stronghold): Blueprint {
  const r = random(s.x * 73856093 ^ s.z * 19349663);
  const R = 7;
  // (A blueprint's cells are in world coordinates: (ox, oy, oz) is the room's corner.)
  const [ox, oy, oz] = [s.x - R, s.y - 1, s.z - R];
  const bp = new Blueprint({ x: ox, y: oy, z: oz }, { x: 2 * R + 1, y: 9, z: 2 * R + 1 });
  const at = (x: number, y: number, z: number) => ({ x: ox + x, y: oy + y, z: oz + z });
  bp.fill(at(0, 0, 0), at(2 * R, 8, 2 * R), (x, y, z) => {
    const wall = x === ox || z === oz || x === ox + 2 * R || z === oz + 2 * R || y === oy || y === oy + 8;
    return wall ? (r() < 0.2 ? 'mossy_cobblestone' : 'stone_bricks') : 'air';
  });
  // The floor under the portal: a step of bricks, the lava pool in it.
  bp.fill(at(R - 3, 1, R - 3), at(R + 3, 1, R + 3), 'stone_bricks');
  bp.fill(at(R - 1, 1, R - 1), at(R + 1, 1, R + 1), 'lava');
  // The frames, a few with an eye already (one in ten).
  for (const [dx, dz] of FRAME_RING) bp.set(s.x + dx, s.y + 1, s.z + dz, r() < 0.1 ? 'end_portal_frame_filled' : 'end_portal_frame');
  // Torches on the floor by the walls.
  for (const [x, z] of [[1, R], [2 * R - 1, R], [R, 1], [R, 2 * R - 1]]) bp.set(ox + x, oy + 1, oz + z, 'torch');
  return bp;
}
