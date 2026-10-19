import type { GameContext, Player } from '@platform';
import { NETHER_LAVA, NETHER_TOP, across, inNether } from './nether';

/**
 * Nether portals, Minecraft's (Mineclonia's) way (`research/mineclonia-spec.md`, Nether portal):
 *
 * - Flint and steel struck inside an obsidian frame (standing, along x or z) lights it: the frame's inside (at
 *   least 2 wide and 3 high, at most 21 by 21, every edge obsidian) fills with portal.
 * - Breaking any of the frame (or setting anything in the portal) puts the whole portal out.
 * - Standing in one for 3 seconds (half a second in creative) takes them to the other world, at an eighth (or
 *   eight times) the distance from the middle: into a portal already there (within 16 blocks in the Nether, 128
 *   in the overworld), else into a new one built where they arrive (an obsidian frame on a ledge, room cleared).
 *   They then have 4 seconds before a portal takes them again.
 *
 * The portals are kept with the world (`game.store`), to find them again.
 */

/** A portal's lowest, westmost (or northmost) inside cell, and which way it runs. */
interface Portal {
  x: number;
  y: number;
  z: number;
  /** Along x (it faces north and south), or along z. */
  axis: 'x' | 'z';
}

const KEPT = 'survival:portals';
const WAIT = { survival: 3, creative: 0.5 };
const COOLDOWN = 4;
/** How far a portal arriving looks for one already there. */
const FIND = { nether: 16, overworld: 128 };
/** The biggest inside a frame may have (Minecraft's 21 × 21). */
const MOST = 21 * 21;

export interface Portals {
  /** Strike flint and steel at a block face (the cell in front of it): true if a portal lit. */
  light(x: number, y: number, z: number): boolean;
  update(dt: number): void;
}

export function portals(game: GameContext, creative: (p: Player) => boolean): Portals {
  const { world } = game;
  const name = (x: number, y: number, z: number) => world.blockName(world.getBlock(x, y, z));
  const loaded = (x: number, y: number, z: number) => {
    const id = world.getBlock(x, y, z);
    return id >= 0 && id !== 65535;
  };
  const known: Portal[] = game.store.get<Portal[]>(KEPT) ?? [];
  const keep = () => game.store.set(KEPT, known);

  /** The inside of a frame around (x, y, z) in a plane, if it's a whole obsidian frame of the right size. */
  function frame(x: number, y: number, z: number, axis: 'x' | 'z'): [number, number, number][] | null {
    const inside: [number, number, number][] = [];
    const seen = new Set<string>();
    const todo: [number, number, number][] = [[x, y, z]];
    while (todo.length) {
      const [cx, cy, cz] = todo.pop()!;
      const k = `${cx},${cy},${cz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const here = name(cx, cy, cz);
      if (here === 'obsidian') continue;
      // (Inside may be air, or anything that breaks at a touch.)
      const info = world.blockInfo(world.getBlock(cx, cy, cz));
      if (!info || !(here === 'air' || (info.plant && !info.liquid))) return null;
      inside.push([cx, cy, cz]);
      if (inside.length > MOST) return null;
      const [dx, dz] = axis === 'x' ? [1, 0] : [0, 1];
      todo.push([cx + dx, cy, cz + dz], [cx - dx, cy, cz - dz], [cx, cy + 1, cz], [cx, cy - 1, cz]);
    }
    const along = inside.map(([px, , pz]) => (axis === 'x' ? px : pz));
    const ys = inside.map(([, py]) => py);
    const wide = Math.max(...along) - Math.min(...along) + 1;
    const high = Math.max(...ys) - Math.min(...ys) + 1;
    return wide >= 2 && high >= 3 ? inside : null;
  }

  const portalId = (axis: 'x' | 'z') => world.blockId(`nether_portal[facing=${axis === 'x' ? 'north' : 'east'}]`);

  function fill(inside: [number, number, number][], axis: 'x' | 'z') {
    const id = portalId(axis);
    for (const [x, y, z] of inside) world.setBlock(x, y, z, id);
    const [x, y, z] = inside.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && (axis === 'x' ? b[0] < a[0] : b[2] < a[2])) ? b : a));
    known.push({ x, y, z, axis });
    keep();
  }

  /** A portal cell changed or its frame broke: the portal it's part of goes out. */
  function putOut(x: number, y: number, z: number) {
    const todo: [number, number, number][] = [[x, y, z]];
    const seen = new Set<string>();
    while (todo.length) {
      const [cx, cy, cz] = todo.pop()!;
      const k = `${cx},${cy},${cz}`;
      if (seen.has(k) || name(cx, cy, cz) !== 'nether_portal') continue;
      seen.add(k);
      world.setBlock(cx, cy, cz, 'air');
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) todo.push([cx + dx, cy + dy, cz + dz]);
    }
    for (let i = known.length - 1; i >= 0; i--) if (name(known[i].x, known[i].y, known[i].z) !== 'nether_portal' && loaded(known[i].x, known[i].y, known[i].z)) known.splice(i, 1);
    keep();
  }

  // A portal cell taken, or its frame broken (a change in its plane, beside it): out it goes. (Something set in
  // front of or behind it leaves it be.)
  let busy = false;
  game.events.on('blockChange', ({ x, y, z, block }) => {
    if (busy || block === 'nether_portal') return;
    for (const [a, b, c] of [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]]) {
      if (name(a, b, c) !== 'nether_portal') continue;
      const facing = world.blockInfo(world.getBlock(a, b, c))?.state.facing;
      const axis = facing === 'north' || facing === 'south' ? 'x' : 'z';
      if (axis === 'x' ? c !== z : a !== x) continue;
      busy = true;
      putOut(a, b, c);
      busy = false;
      return;
    }
  });

  // ------------------------------------------------------------------------------------------ the journey
  /** Each player's time in a portal, and their cooldown after one. */
  const inPortal = new Map<string, number>();
  const cooldown = new Map<string, number>();
  /** Those on their way: frozen where they're going until it's there, then into its portal. */
  const going = new Map<string, { x: number; y: number; z: number; nether: boolean; portal: Portal | null; waited: number }>();

  /** The nearest kept portal to a place, within reach, in the same world. */
  function nearest(x: number, z: number, nether: boolean): Portal | null {
    const reach = nether ? FIND.nether : FIND.overworld;
    let best: Portal | null = null;
    let d = Infinity;
    for (const p of known) {
      if (inNether(p.x) !== nether) continue;
      const e = Math.max(Math.abs(p.x - x), Math.abs(p.z - z));
      if (e <= reach && e < d) {
        best = p;
        d = e;
      }
    }
    return best;
  }

  function leave(player: Player) {
    const p = player.position;
    const to = across(p.x, p.y, p.z);
    const portal = nearest(to.x, to.z, to.nether);
    const at = portal ?? { x: to.x, y: to.nether ? Math.min(Math.max(Math.floor(p.y), NETHER_LAVA + 4), NETHER_TOP - 12) : 100, z: to.z };
    going.set(player.id, { x: at.x, y: at.y, z: at.z, nether: to.nether, portal, waited: 0 });
    player.teleport({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, player.yaw);
    player.freeze(true);
  }

  /** Where they've gone is there: into the portal there, or one built for them. */
  function arrive(player: Player, g: { x: number; y: number; z: number; nether: boolean; portal: Portal | null }) {
    let p = g.portal && name(g.portal.x, g.portal.y, g.portal.z) === 'nether_portal' ? g.portal : null;
    if (!p) p = build(g.x, g.y, g.z, g.nether);
    player.freeze(false);
    const [ox, oz] = p.axis === 'x' ? [1, 0.5] : [0.5, 1];
    player.teleport({ x: p.x + ox, y: p.y, z: p.z + oz }, p.axis === 'x' ? 0 : Math.PI / 2);
    cooldown.set(player.id, COOLDOWN);
    inPortal.delete(player.id);
  }

  /** Somewhere to stand near (x, z): a floor with room over it (2 wide, 4 high); else (x, y, z) as it is. */
  function ground(x: number, y: number, z: number, nether: boolean): { x: number; y: number; z: number } {
    const top = nether ? NETHER_TOP - 6 : 250;
    const low = nether ? NETHER_LAVA + 2 : 2;
    const solid = (a: number, b: number, c: number) => {
      const i = world.blockInfo(world.getBlock(a, b, c));
      return !!i && i.solid && !i.liquid;
    };
    const room = (a: number, b: number, c: number) => {
      for (let dy = 0; dy < 4; dy++) for (let dx = -1; dx <= 2; dx++) if (name(a + dx, b + dy, c) !== 'air') return false;
      return solid(a, b - 1, c) && solid(a + 1, b - 1, c);
    };
    for (let r = 0; r <= 12; r += 3) {
      for (const [dx, dz] of r ? [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]] : [[0, 0]]) {
        const cx = x + dx, cz = z + dz;
        if (!loaded(cx, low, cz)) continue;
        if (!nether) {
          const s = world.surfaceY(cx, cz) + 1;
          if (s > low && s < top && room(cx, s, cz)) return { x: cx, y: s, z: cz };
          continue;
        }
        for (let d = 0; d < top - low; d++) {
          for (const cy of [y - d, y + d]) if (cy >= low && cy <= top && room(cx, cy, cz)) return { x: cx, y: cy, z: cz };
        }
      }
    }
    return { x, y: nether ? Math.min(Math.max(y, NETHER_LAVA + 6), top) : Math.max(world.surfaceY(x, z) + 1, low), z };
  }

  /** A new portal: an obsidian frame 4 wide and 5 high along x, its 2 × 3 inside lit, a ledge either side, room cleared. */
  function build(x: number, y: number, z: number, nether: boolean): Portal {
    const at = ground(x, y, z, nether);
    busy = true;
    for (let dx = -1; dx <= 2; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 0; dy <= 3; dy++) world.setBlock(at.x + dx, at.y + dy, at.z + dz, 'air');
        // (The ledge: obsidian under the frame and both sides of it.)
        if (dx >= 0 && dx <= 1) world.setBlock(at.x + dx, at.y - 1, at.z + dz, 'obsidian');
      }
      for (let dy = -1; dy <= 3; dy++) if (dx === -1 || dx === 2 || dy === -1 || dy === 3) world.setBlock(at.x + dx, at.y + dy, at.z, 'obsidian');
    }
    const inside: [number, number, number][] = [];
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) inside.push([at.x + dx, at.y + dy, at.z]);
    fill(inside, 'x');
    busy = false;
    return known[known.length - 1];
  }

  return {
    light(x, y, z) {
      for (const axis of ['x', 'z'] as const) {
        const inside = frame(x, y, z, axis);
        if (inside) {
          busy = true;
          fill(inside, axis);
          busy = false;
          return true;
        }
      }
      return false;
    },
    update(dt) {
      for (const player of game.players) {
        // (The crowd of bots stays in the overworld.)
        if (player.bot) continue;
        const id = player.id;
        const g = going.get(id);
        if (g) {
          g.waited += dt;
          // (Ready when the ground round where they're going has come.)
          const ready = [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].every(([dx, dz]) => loaded(g.x + dx, Math.max(g.y, 1), g.z + dz));
          if (ready || g.waited > 20) {
            going.delete(id);
            arrive(player, g);
          }
          continue;
        }
        const left = (cooldown.get(id) ?? 0) - dt;
        if (left > 0) cooldown.set(id, left);
        else cooldown.delete(id);
        const p = player.position;
        const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
        const inside = player.alive && (name(fx, fy, fz) === 'nether_portal' || name(fx, fy + 1, fz) === 'nether_portal');
        if (!inside) {
          inPortal.delete(id);
          continue;
        }
        // (Arrived through one: they must step out of it before it takes them again.)
        if (left > 0) {
          cooldown.set(id, COOLDOWN);
          continue;
        }
        const t = (inPortal.get(id) ?? 0) + dt;
        inPortal.set(id, t);
        if (t >= (creative(player) ? WAIT.creative : WAIT.survival)) {
          inPortal.delete(id);
          leave(player);
        }
      }
    },
  };
}
