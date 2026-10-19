import { NETHER_MIDDLE } from '../../src/games/sandbox/survival/nether';
import { check, launch } from './_harness';

/**
 * Sandbox's Nether (`survival/nether.ts`, `portals.ts`, the engine's Nether generator): its ground (bedrock floor
 * and roof, netherrack, the lava sea, glowstone, soul sand, quartz); an obsidian frame lit with flint and steel;
 * three seconds in the portal to the Nether, at an eighth the distance, into a portal built there; back through
 * it to the first; and the portal going out when its frame's broken.
 */
export default function netherTest() {
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

  // ---------------------------------------------------------------- the frame, lit
  g.commands.run('gamemode survival');
  h.run(0.2);
  const s = w.spawn;
  const X = Math.floor(s.x) + 800, Z = Math.floor(s.z) + 400, Y = 150;
  me.teleport({ x: X + 0.5, y: Y + 2, z: Z + 0.5 });
  h.run(3, { until: () => loaded(X, Y, Z) && loaded(X + 20, Y, Z + 20) });
  for (let x = X - 3; x <= X + 4; x++) for (let z = Z - 3; z <= Z + 3; z++) {
    w.setBlock(x, Y - 1, z, 'stone');
    for (let y = Y; y < Y + 6; y++) w.setBlock(x, y, z, 'air');
  }
  // A frame along x: 4 wide, 5 high, its inside 2 × 3 from (X, Y).
  for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 3; dy++) if (dx === -1 || dx === 2 || dy === -1 || dy === 3) w.setBlock(X + dx, Y + dy, Z, 'obsidian');
  me.inventory.set(0, { item: 'flint_and_steel', count: 1 });
  me.inventory.select(0);
  // Stood inside it, looking down at its bottom: struck.
  const down = { pitch: -(Math.PI / 2 - 0.01) };
  me.teleport({ x: X + 0.5, y: Y, z: Z + 0.5 }, 0, down.pitch);
  h.run(0.2, { pilot: () => down });
  h.step(1 / 30, { ...down, clicked: 4, buttons: 4 });
  h.step(1 / 30, down);
  const lit = [0, 1].every((dx) => [0, 1, 2].every((dy) => name(X + dx, Y + dy, Z) === 'nether_portal'));
  check(lit && me.inventory.slots[0]?.wear === 1, `flint and steel lit the frame: ${name(X, Y, Z)}, ${name(X + 1, Y + 2, Z)}`);

  // ---------------------------------------------------------------- through to the Nether
  const before = { x: me.position.x, z: me.position.z };
  const took = h.run(30, { pilot: () => ({ pitch: 0 }), until: () => me.position.x > 60000 && !me.frozen && me.alive });
  const p = me.position;
  const want = { x: NETHER_MIDDLE + before.x / 8, z: before.z / 8 };
  check(p.x > 60000 && Math.abs(p.x - want.x) < 16 && Math.abs(p.z - want.z) < 16, `in the Nether after ${took.toFixed(1)} s at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), an eighth of (${before.x.toFixed(0)}, ${before.z.toFixed(0)})`);
  const at = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  check(name(at.x, at.y, at.z) === 'nether_portal', `standing in a portal built for them: ${name(at.x, at.y, at.z)}`);
  check(p.y > 31 && p.y < 122, `between the lava sea and the roof: y ${p.y.toFixed(1)}`);
  // The Nether's ground round about.
  const counts = new Map<string, number>();
  for (let x = at.x - 24; x <= at.x + 24; x += 2) for (let z = at.z - 24; z <= at.z + 24; z += 2) for (let y = 0; y < 128; y++) {
    const n = name(x, y, z);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const c = (n: string) => counts.get(n) ?? 0;
  check(name(at.x + 5, 0, at.z) === 'bedrock' && name(at.x + 5, 127, at.z) === 'bedrock', 'a bedrock floor and roof');
  check(c('netherrack') > 20000 && c('lava') > 100 && c('glowstone') > 0 && c('soul_sand') > 0 && c('nether_quartz_ore') > 0 && c('grass_block') === 0, `Nether ground: ${['netherrack', 'lava', 'air', 'glowstone', 'soul_sand', 'nether_quartz_ore'].map((n) => `${n} ${c(n)}`).join(', ')}`);

  // Staying in it: not straight back (stepped out of first).
  h.run(5, { pilot: () => ({ pitch: 0 }) });
  check(me.position.x > 60000, 'not taken straight back');
  // Out, a moment, and in again: back to the first portal.
  me.teleport({ x: at.x + 0.5, y: at.y, z: at.z + 2.5 });
  h.run(5);
  me.teleport({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  const back = h.run(30, { until: () => me.position.x < 60000 && !me.frozen });
  check(Math.abs(me.position.x - (X + 1)) < 2 && Math.abs(me.position.z - (Z + 0.5)) < 2, `back through it (${back.toFixed(1)} s) to the first portal: (${me.position.x.toFixed(1)}, ${me.position.z.toFixed(1)})`);

  // Its frame broken: out it goes.
  w.setBlock(X - 1, Y + 1, Z, 'air');
  h.run(0.2);
  check(name(X, Y, Z) === 'air' && name(X + 1, Y + 2, Z) === 'air', `frame broken, the portal's out: ${name(X, Y, Z)}`);
  console.log(`  lit a 2 × 3 frame; to the Nether in ${took.toFixed(1)} s, into a portal built there; Nether ground ${c('netherrack')} netherrack, ${c('lava')} lava, ${c('glowstone')} glowstone, ${c('soul_sand')} soul sand, ${c('nether_quartz_ore')} quartz; back to the first portal; out when its frame broke`);
}
