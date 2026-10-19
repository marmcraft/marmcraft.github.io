import { END_ARRIVAL, END_MIDDLE, FRAME_RING, STRONGHOLDS } from '../../src/games/sandbox/survival/end';
import { check, launch } from './_harness';

/**
 * Sandbox's End (`survival/end.ts`, `endportal.ts`, the engine's End generator): a stronghold's portal room deep
 * underground, an eye of ender thrown toward it, the twelfth eye opening the portal, through it onto the obsidian
 * platform, the island (end stone, ten obsidian pillars, the exit portal), back to the spawn, and the void.
 */
export default function endTest() {
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const w = g.world;
  const me = g.player;
  h.run(2);
  const name = (x: number, y: number, z: number) => w.blockName(w.getBlock(x, y, z));
  const loaded = (x: number, y: number, z: number) => {
    const id = w.getBlock(x, y, z);
    return id >= 0 && id !== 65535;
  };
  g.commands.run('gamemode survival');
  h.run(0.2);

  // ---------------------------------------------------------------- an eye thrown toward the nearest stronghold
  const s0 = STRONGHOLDS.reduce((a, b) => (Math.hypot(b.x, b.z) < Math.hypot(a.x, a.z) ? b : a));
  me.inventory.set(0, { item: 'eye_of_ender', count: 13 });
  me.inventory.select(0);
  const start = { ...me.position };
  h.run(0.2, { pilot: () => ({ pitch: 1.2 }) });
  h.step(1 / 30, { pitch: 1.2, clicked: 4, buttons: 4 });
  h.run(2.5, { pilot: () => ({ pitch: 1.2 }) });
  const bursts = h.find('fx', 'burst').map((c) => c.args[0] as { x: number; z: number });
  const last = bursts.at(-1);
  const closer = !!last && Math.hypot(s0.x - last.x, s0.z - last.z) < Math.hypot(s0.x - start.x, s0.z - start.z) - 15;
  check(me.inventory.count('eye_of_ender') === 12 && closer, `an eye thrown flew toward the stronghold at (${s0.x}, ${s0.z}): ${last ? `${last.x.toFixed(0)}, ${last.z.toFixed(0)}` : 'no trail'}`);

  // ---------------------------------------------------------------- the stronghold's room
  const s = s0;
  me.teleport({ x: s.x + 0.5, y: s.y + 3, z: s.z + 3.5 });
  me.freeze(true);
  h.run(10, { until: () => loaded(s.x, s.y, s.z) && loaded(s.x + 8, s.y, s.z + 8) && loaded(s.x - 8, s.y, s.z - 8) });
  const fy = s.y + 1;
  const frames = FRAME_RING.map(([dx, dz]) => name(s.x + dx, fy, s.z + dz));
  check(frames.every((n) => n.startsWith('end_portal_frame')) && name(s.x, s.y, s.z) === 'lava' && name(s.x + 7, s.y + 2, s.z) === 'stone_bricks' || name(s.x + 7, s.y + 2, s.z) === 'mossy_cobblestone', `a stronghold's portal room: frames ${new Set(frames)}, ${name(s.x, s.y, s.z)} under, walls ${name(s.x + 7, s.y + 2, s.z)}`);
  me.freeze(false);

  // ---------------------------------------------------------------- twelve eyes: the portal opens
  const [lx, lz] = FRAME_RING[0];
  for (const [dx, dz] of FRAME_RING.slice(1)) w.setBlock(s.x + dx, fy, s.z + dz, 'end_portal_frame_filled');
  w.setBlock(s.x + lx, fy, s.z + lz, 'end_portal_frame');
  const down = { pitch: -(Math.PI / 2 - 0.01) };
  me.teleport({ x: s.x + lx + 0.5, y: fy + 0.82, z: s.z + lz + 0.5 }, 0, down.pitch);
  h.run(0.3, { pilot: () => down });
  h.step(1 / 30, { ...down, clicked: 4, buttons: 4 });
  h.step(1 / 30, down);
  const open = [-1, 0, 1].every((dx) => [-1, 0, 1].every((dz) => name(s.x + dx, fy, s.z + dz) === 'end_portal'));
  check(open && name(s.x + lx, fy, s.z + lz) === 'end_portal_frame_filled' && me.inventory.count('eye_of_ender') === 11, `the twelfth eye: the portal's open (${name(s.x, fy, s.z)})`);

  // ---------------------------------------------------------------- to the End
  me.teleport({ x: s.x + 0.5, y: fy + 0.2, z: s.z + 0.5 });
  const took = h.run(30, { until: () => me.position.x < -60000 && !me.frozen });
  const p = me.position;
  check(Math.abs(p.x - (END_ARRIVAL.x + 0.5)) < 1 && Math.abs(p.z - (END_ARRIVAL.z + 0.5)) < 1 && name(END_ARRIVAL.x, END_ARRIVAL.y - 1, END_ARRIVAL.z) === 'obsidian', `in the End after ${took.toFixed(1)} s on its obsidian platform at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
  h.run(1);
  check(me.alive && Math.abs(me.position.y - END_ARRIVAL.y) < 1, `standing on it: y ${me.position.y.toFixed(2)}`);

  // The island: end stone round the middle, ten pillars, the exit portal.
  me.teleport({ x: END_MIDDLE + 20.5, y: 80, z: 0.5 });
  me.freeze(true);
  h.run(10, { until: () => loaded(END_MIDDLE, 60, 0) && loaded(END_MIDDLE + 45, 60, 45) && loaded(END_MIDDLE - 45, 60, -45) });
  let stone = 0, obsidian = 0, portal: { x: number; y: number; z: number } | null = null;
  for (let x = END_MIDDLE - 48; x <= END_MIDDLE + 48; x += 2) for (let z = -48; z <= 48; z += 2) for (let y = 20; y < 110; y++) {
    const n = name(x, y, z);
    if (n === 'end_stone') stone++;
    else if (n === 'obsidian') obsidian++;
    else if (n === 'end_portal' && !portal) portal = { x, y, z };
  }
  let pillars = 0;
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    if (name(END_MIDDLE + Math.round(42 * Math.cos(a)), 75, Math.round(42 * Math.sin(a))) === 'obsidian') pillars++;
  }
  check(stone > 20000 && pillars === 10 && !!portal && loaded(END_MIDDLE + 125, 60, 0) && name(END_MIDDLE + 125, 60, 0) === 'air', `the island: ${stone} end stone, ${pillars} pillars (${obsidian} obsidian), the exit portal at ${portal ? `(${portal.x}, ${portal.y}, ${portal.z})` : 'nowhere'}, the void beyond`);
  me.freeze(false);

  // Through the exit portal: back to the spawn.
  me.teleport({ x: portal!.x + 0.5, y: portal!.y + 0.2, z: portal!.z + 0.5 });
  const back = h.run(30, { until: () => me.position.x > -60000 && !me.frozen });
  const sp = w.spawn;
  check(Math.hypot(me.position.x - sp.x, me.position.z - sp.z) < 2, `back through the exit portal (${back.toFixed(1)} s) to the spawn`);

  // The void: falling out of the End kills.
  me.teleport({ x: END_MIDDLE + 400.5, y: 20, z: 0.5 });
  h.run(15, { until: () => !me.alive });
  check(!me.alive, `fell out of the End: dead (at y ${me.position.y.toFixed(1)}, ${loaded(END_MIDDLE + 400, 10, 0) ? 'loaded' : 'not loaded'})`);
  console.log(`  an eye flew toward (${s.x}, ${s.z}); its room's twelve frames round lava; the twelfth eye opened the portal; to the End in ${took.toFixed(1)} s onto the platform; ${stone} end stone, 10 pillars, the exit portal back to the spawn; the void kills`);
}
