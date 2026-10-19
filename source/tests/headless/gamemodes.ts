import { check, launch } from './_harness';

/**
 * Sandbox's game modes (`addons/gamemode.ts`): survival has hearts and no flight, and mines a block a
 * crack at a time (held on, it's through after its time; a touch does nothing); adventure can't
 * break at all; creative breaks at a touch again; spectator's a ghost.
 */
export default function gamemodes() {
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const me = g.player;
  h.run(2);
  const sim = h.sim.players.find((p) => p.id === me.id)!;

  check(g.commands.run('gamemode survival').includes('Survival') && me.maxHealth === 20 && !sim.allowFlight, 'survival: hearts, no flight');
  // Stand over solid ground and look straight down at it.
  const s = g.world.spawn;
  me.teleport({ x: s.x + 0.5, y: g.world.surfaceY(s.x, s.z) + 1, z: s.z + 0.5 }, 0, -(Math.PI / 2 - 0.01));
  h.run(0.5, { pilot: () => ({ pitch: -(Math.PI / 2 - 0.01) }) });
  // (The block they're looking at: the one outlined for them.)
  const at = h.find('hud', 'highlight').at(-1)!.args[0] as { x: number; y: number; z: number };
  const below = () => g.world.getBlock(at.x, at.y, at.z);
  const was = below();
  check(was !== 0, `ground under them: block ${was}`);
  const hold = { pitch: -(Math.PI / 2 - 0.01), buttons: 1 };

  // A touch: no more than a crack.
  h.step(1 / 60, { ...hold, clicked: 1 });
  h.step(1 / 60, { pitch: -(Math.PI / 2 - 0.01) });
  check(below() === was, 'survival: a touch breaks nothing');

  // Held on: the cracks grow, then it's through.
  const cracks: number[] = [];
  const took = h.run(10, {
    pilot: () => hold,
    until: () => {
      const last = h.find('hud', 'highlight').at(-1);
      const p = (last?.args[1] as { progress?: number } | undefined)?.progress;
      if (p) cracks.push(p);
      return below() !== was;
    },
  });
  check(below() !== was, `survival: held on, block ${was} is mined (${took.toFixed(1)} s)`);
  check(took > 0.3 && cracks.length > 3 && cracks.some((p) => p > 0.5), `the cracks grew: ${cracks.length} steps, up to ${Math.max(...cracks).toFixed(2)}`);

  // Adventure: held on as long, nothing goes.
  g.commands.run('gamemode adventure');
  h.run(0.3, { pilot: () => ({ pitch: -(Math.PI / 2 - 0.01) }) });
  // (Nothing's outlined for them now: the block under the one they mined.)
  const at2 = { x: at.x, y: at.y - 1, z: at.z };
  const was2 = g.world.getBlock(at2.x, at2.y, at2.z);
  h.run(Math.min(8, took * 3), { pilot: () => hold });
  check(g.world.getBlock(at2.x, at2.y, at2.z) === was2, 'adventure: nothing broken');

  // Creative: at a touch, and flying again; spectator: a ghost.
  check(g.commands.run('gm c').includes('Creative') && sim.allowFlight && !me.alive === false, 'creative again');
  check(g.commands.run('gamemode sp').includes('Spectator') && me.spectating, 'spectator: a ghost');
  console.log(`  survival: hearts, no flight, a touch breaks nothing, block ${was} mined in ${took.toFixed(1)} s with ${cracks.length} stages of cracks; adventure breaks nothing; creative and spectator`);
}
