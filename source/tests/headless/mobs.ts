import { check, launch } from './_harness';

/**
 * Sandbox's night (`survival/mobs.ts`): after dark, zombies, skeletons, spiders and creepers come out round a
 * survivor and go for them; a creative builder they leave be (none come for them, and those about ignore them);
 * by day the zombies and skeletons under the sky burn.
 */
export default function mobsTest() {
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const me = g.player;
  h.run(2);
  const KINDS = ['zombie', 'skeleton', 'spider', 'creeper'];
  const count = () => KINDS.reduce((n, k) => n + g.entities.count(k), 0);

  // Creative at night: nothing comes.
  g.commands.run('gamemode creative');
  g.env.time = 0.9;
  g.env.frozen = true;
  const s = g.world.spawn;
  me.teleport({ x: s.x, y: g.world.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1, z: s.z });
  h.run(8);
  check(count() === 0, `creative at night: no mobs (${count()})`);

  // Survival at night: they come, and go for them.
  g.commands.run('gamemode survival');
  h.run(20, { until: () => count() >= 4 });
  const kinds = KINDS.filter((k) => g.entities.count(k) > 0);
  check(count() >= 4, `survival at night: ${count()} came out (${kinds.join(', ')})`);
  const before = me.health;
  // (Keep them alive and let them reach: full health back now and then.)
  let hurt = false;
  h.run(40, {
    until: () => {
      if (me.health < before) hurt = true;
      if (me.health < 8) me.heal(20);
      return hurt;
    },
  });
  check(hurt, `a mob hurt the survivor (health ${me.health})`);

  // Creative again: those about stop going for them.
  g.commands.run('gamemode creative');
  h.run(0.5);
  const health = me.health;
  h.run(6);
  check(me.health >= health, 'creative: unnoticed, unhurt');

  // Day: zombies and skeletons under the sky burn away.
  g.commands.run('gamemode survival');
  g.env.time = 0.5;
  const undead = () => g.entities.count('zombie') + g.entities.count('skeleton');
  const was = undead();
  h.run(15, { until: () => undead() === 0, pilot: () => ({}) });
  check(was > 0 && undead() < was, `by day the undead burn: ${was} then ${undead()}`);
  // By day, cows graze round a survivor.
  h.run(30, { until: () => g.entities.count('cow') > 0 });
  check(g.entities.count('cow') > 0, `cows graze by day (${g.entities.count('cow')})`);

  // A sword hits a zombie in front for Minecraft's damage (a diamond sword's 7), and wears by one.
  for (const k of [...KINDS, 'cow']) for (const m of g.entities.all(k)) m.remove();
  // (Up again and well, on open ground at the spawn, if the night was too much.)
  if (!me.alive) me.revive();
  me.heal(20);
  // (On a stone floor up in the open: no trees in the way.)
  const sp = g.world.spawn;
  const [fx, fz, fy] = [Math.floor(sp.x), Math.floor(sp.z), 150];
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) g.world.setBlock(fx + dx, fy - 1, fz + dz, 'stone');
  me.teleport({ x: fx + 0.5, y: fy, z: fz + 0.5 });
  h.run(0.5);
  me.inventory.set(0, { item: 'diamond_sword', count: 1 });
  me.inventory.select(0);
  // (Two blocks ahead along their look, level.)
  const yaw = me.yaw;
  h.run(0.2, { pilot: () => ({ yaw, pitch: -0.2 }) });
  const p = me.position, l = me.look;
  const d = Math.hypot(l.x, l.z) || 1;
  const z = g.entities.spawn('zombie', { x: p.x + (l.x / d) * 2, y: p.y, z: p.z + (l.z / d) * 2 });
  // (In the world from the next step.)
  h.step(1 / 30, { yaw, pitch: -0.2 });
  const hp = z.health;
  h.step(1 / 30, { yaw, pitch: -0.2, buttons: 1, clicked: 1 });
  h.step(1 / 30, { yaw, pitch: -0.2 });
  check(hp - z.health >= 7 && me.inventory.slots[0]?.wear === 1, `a diamond sword hit: ${hp - z.health} damage, worn ${me.inventory.slots[0]?.wear} `);
  g.commands.run('gamemode creative');
  console.log(`  none for a creative builder; ${kinds.join(', ')} came for a survivor at night and hurt them; ignored in creative; ${was} undead burnt by day to ${undead()}`);
}
