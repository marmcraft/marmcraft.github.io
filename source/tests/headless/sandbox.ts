import { check, launch } from './_harness';

/**
 * Sandbox's achievements: a first block placed (a right click), one of its own from the block
 * picker, flying high (and a fall from as high isn't flying), a block up in the sky, a thousand
 * blocks placed, and far from the spawn.
 */
export default function sandbox() {
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const me = g.player;
  h.run(2);

  // In creative, the hotbar starts empty: an empty hand places nothing. Then grass, a whole stack from the creative
  // inventory, in the first slot (Sandbox plays by items in every mode).
  g.commands.run('gamemode creative');
  h.run(0.2);
  const place = () => {
    h.run(0.2, { pilot: () => ({ pitch: -0.5 }) });
    h.step(1 / 60, { pitch: -0.5, buttons: 4, clicked: 4 });
    h.run(0.4);
  };
  const slots = me.inventory.slots;
  check(slots.length === 36 && slots.every((s) => !s), 'the hotbar starts empty');
  place();
  check(!me.achieved('first_block'), 'nothing placed from an empty hand');
  h.send({ t: 'creativeGive', player: me.id, item: 'grass_block', slot: 0 });
  h.step(1 / 60, {});
  check(me.inventory.slots[0]?.count === 64, `a whole stack of grass (${me.inventory.slots[0]?.count})`);
  place();
  check(me.achieved('first_block') && !me.achieved('picker') && me.inventory.slots[0]?.count === 64, 'Groundbreaker, for the first block (creative keeps its stack)');
  h.send({ t: 'creativeGive', player: me.id, item: 'crate', slot: 0 });
  h.step(1 / 60, { yaw: me.yaw + 1 });
  place();
  check(me.achieved('picker'), 'Fresh from the Picker, for a crate');
  h.send({ t: 'creativeGive', player: me.id, item: 'diamond_sword', slot: 1 });
  h.step(1 / 60, {});
  check(me.inventory.slots[1]?.item === 'diamond_sword' && me.inventory.slots[1]?.count === 1, 'and items: a diamond sword');

  // Dropped from high up: a fall, not flying.
  const { x, y, z } = me.position;
  me.teleport({ x, y: y + 60, z });
  h.run(4);
  check(me.onGround && !me.achieved('flight'), `a fall isn't flying: ${JSON.stringify(me.position)}`);
  // Double-tap Space to fly, then hold it to climb.
  h.step(1 / 60, { pressed: ['Space'], down: ['Space'] });
  h.run(0.1);
  h.step(1 / 60, { pressed: ['Space'], down: ['Space'] });
  const climbed = h.run(20, { pilot: () => ({ down: ['Space'] }), until: () => me.achieved('flight') });
  check(me.achieved('flight'), `Take Flight: ${(me.position.y - y).toFixed(0)} blocks up after ${climbed.toFixed(1)} s`);

  check(g.world.placeBlock(Math.floor(x), 210, Math.floor(z), 'stone', { by: me }) && me.achieved('sky_high'), 'Cloud Builder, for a block at 210');
  check(!me.achieved('master_builder'), 'not a thousand yet');
  me.store.set('placed', 998);
  g.world.placeBlock(Math.floor(x), 211, Math.floor(z), 'stone', { by: me });
  check(me.store.get('placed') === 999 && !me.achieved('master_builder'), 'the 999th');
  g.world.placeBlock(Math.floor(x), 212, Math.floor(z), 'stone', { by: me });
  check(me.achieved('master_builder'), 'Master Builder, for the thousandth');

  check(!me.achieved('wanderer'), 'not far yet');
  const s = g.world.spawn;
  me.teleport({ x: s.x + 1001, y: 200, z: s.z });
  h.run(0.2);
  check(me.achieved('wanderer'), 'Far and Away, 1,000 blocks out');
  console.log(`  a block, a crate from the picker, flew ${(climbed).toFixed(1)} s to earn Take Flight (not for a fall), a block at 210, the thousandth block, 1,000 blocks out`);
}
