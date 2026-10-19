import { check, launch } from './_harness';

/**
 * Sandbox's water and lava (`survival/liquids.ts`): flowing out from a source a level a block (water seven blocks,
 * lava three), drying up when the source goes, falling down an edge, infinite water between two sources, lava
 * meeting water (obsidian, cobblestone, stone), and buckets taking and pouring sources.
 */
export default function liquidsTest() {
  const h = launch('sandbox', { seed: 4 });
  const g = h.ctx;
  const w = g.world;
  const me = g.player;
  h.run(2);
  const s = w.spawn;
  const X = Math.floor(s.x), Z = Math.floor(s.z);
  // A stone floor up in the air, clear above it, to pour on.
  const Y = 180;
  const floor = (x0: number, z0: number, x1: number, z1: number, y = Y - 1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) w.setBlock(x, y, z, 'stone');
  };
  const name = (x: number, y: number, z: number) => w.blockName(w.getBlock(x, y, z));
  const level = (x: number, y: number, z: number) => {
    const info = w.blockInfo(w.getBlock(x, y, z))!;
    return info.name === 'air' ? 0 : info.state.falling ? 'fall' : info.state.level ? Number(info.state.level) : info.name === 'water' || info.name === 'lava' ? 8 : -1;
  };
  // (Stand somewhere nearby, out of the way.)
  me.teleport({ x: X + 0.5, y: Y + 10, z: Z + 0.5 });

  // ---------------------------------------------------------------- water flows seven blocks
  floor(X - 10, Z - 10, X + 10, Z + 10);
  w.setBlock(X, Y, Z, 'water');
  h.run(4);
  const run = [1, 2, 3, 7, 8].map((d) => level(X + d, Y, Z));
  check(run[0] === 7 && run[1] === 6 && run[2] === 5 && run[3] === 1 && run[4] === 0, `water out from a source: levels ${run} at 1, 2, 3, 7, 8 blocks`);
  check(level(X + 2, Y, Z + 2) === 4, `diagonally, 4 blocks by the way round: ${level(X + 2, Y, Z + 2)}`);
  // The source taken: it dries up.
  w.setBlock(X, Y, Z, 'air');
  h.run(4);
  check([1, 3, 6].every((d) => level(X + d, Y, Z) === 0), `dried up: ${[1, 3, 6].map((d) => level(X + d, Y, Z))}`);

  // ---------------------------------------------------------------- off an edge: it falls
  const Y2 = Y + 20;
  floor(X - 2, Z - 2, X + 1, Z + 2, Y2 - 1);
  w.setBlock(X, Y2, Z, 'water');
  h.run(3);
  check(level(X + 2, Y2, Z) === 6 && level(X + 2, Y2 - 1, Z) === 'fall' && level(X + 2, Y2 - 5, Z) === 'fall', `over the edge it falls: ${level(X + 2, Y2, Z)} then ${level(X + 2, Y2 - 1, Z)}, ${level(X + 2, Y2 - 5, Z)}`);
  w.setBlock(X, Y2, Z, 'air');
  h.run(6);

  // ---------------------------------------------------------------- infinite water
  const Y3 = Y + 40;
  floor(X - 3, Z - 3, X + 3, Z + 3, Y3 - 1);
  for (let x = X - 3; x <= X + 3; x++) for (const z of [Z - 1, Z + 1]) w.setBlock(x, Y3, z, 'stone');
  w.setBlock(X - 3, Y3, Z, 'stone');
  w.setBlock(X + 3, Y3, Z, 'stone');
  w.setBlock(X - 1, Y3, Z, 'water');
  w.setBlock(X + 1, Y3, Z, 'water');
  h.run(1);
  check(level(X, Y3, Z) === 8, `between two sources, a source: ${level(X, Y3, Z)}`);
  // Taken with a bucket, it comes back.
  g.commands.run('gamemode survival');
  h.run(0.2);
  me.inventory.set(0, { item: 'bucket', count: 2 });
  me.inventory.select(0);
  me.teleport({ x: X + 0.5, y: Y3 + 1, z: Z + 0.5 }, 0, -(Math.PI / 2 - 0.01));
  const down = { pitch: -(Math.PI / 2 - 0.01) };
  h.run(0.3, { pilot: () => down });
  h.run(0.2, { pilot: () => ({ ...down, clicked: 4, buttons: 4 }), until: () => me.inventory.count('water_bucket') > 0 });
  h.run(0.2, { pilot: () => down });
  check(me.inventory.count('water_bucket') === 1 && me.inventory.count('bucket') === 1, `a bucket filled (${me.inventory.count('water_bucket')} full, ${me.inventory.count('bucket')} empty)`);
  h.run(1, { pilot: () => down });
  check(level(X, Y3, Z) === 8, `infinite: the source came back (${level(X, Y3, Z)})`);

  // ---------------------------------------------------------------- pouring, and lava meeting water
  const Y4 = Y + 50;
  floor(X - 8, Z - 8, X + 8, Z + 8, Y4 - 1);
  // Lava first: three blocks out.
  w.setBlock(X, Y4, Z, 'lava');
  h.run(9);
  check(level(X + 1, Y4, Z) === 6 && level(X + 3, Y4, Z) === 2 && level(X + 4, Y4, Z) === 0, `lava out from a source: ${[1, 2, 3, 4].map((d) => level(X + d, Y4, Z))}`);
  // Water poured from the bucket four blocks off: it meets the flowing lava (cobblestone) and the source (obsidian).
  me.inventory.set(1, { item: 'water_bucket', count: 1 });
  me.inventory.select(1);
  me.teleport({ x: X - 4 + 0.5, y: Y4 + 1, z: Z + 0.5 }, 0, -(Math.PI / 2 - 0.01));
  h.run(0.3, { pilot: () => down });
  // (Standing on the floor at X − 4: pour onto the block they stand on's top, beside them, by looking at the floor ahead.)
  me.teleport({ x: X - 4 + 0.5, y: Y4 + 2, z: Z + 0.5 }, 0, -(Math.PI / 2 - 0.01));
  w.setBlock(X - 4, Y4, Z, 'stone');
  h.run(0.3, { pilot: () => down });
  h.run(0.2, { pilot: () => ({ ...down, clicked: 4, buttons: 4 }), until: () => me.inventory.count('bucket') > 1 || me.inventory.count('water_bucket') === 0 });
  h.run(0.2, { pilot: () => down });
  check(name(X - 4, Y4 + 1, Z) === 'water' && me.inventory.count('water_bucket') === 0, `poured: ${name(X - 4, Y4 + 1, Z)} on the block`);
  // (Then water on the floor beside the lava.)
  w.setBlock(X - 4, Y4 + 1, Z, 'air');
  w.setBlock(X - 4, Y4, Z, 'water');
  h.run(6);
  const turned = [-3, -2, -1].map((d) => name(X + d, Y4, Z));
  check(turned[0] === 'cobblestone' && name(X, Y4, Z) === 'lava', `flowing lava met water: cobblestone, the rest stands: ${turned} then ${name(X, Y4, Z)}`);
  // A lava source with water poured over it: obsidian.
  // (Off to one side, at the first floor's height: the world's top is near.)
  const X5 = X + 30, Y5 = Y;
  floor(X5 - 2, Z - 2, X5 + 2, Z + 2, Y5 - 1);
  w.setBlock(X5, Y5, Z, 'lava');
  h.run(0.5);
  w.setBlock(X5, Y5 + 1, Z, 'water');
  h.run(2);
  check(name(X5, Y5, Z) === 'obsidian', `water over a lava source: ${name(X5, Y5, Z)}`);
  // Lava over water: the water turns to stone.
  const X6 = X - 30, Y6 = Y;
  floor(X6 - 2, Z - 2, X6 + 2, Z + 2, Y6 - 1);
  w.setBlock(X6, Y6, Z, 'water');
  h.run(0.5);
  w.setBlock(X6, Y6 + 1, Z, 'lava');
  h.run(3);
  check(name(X6, Y6, Z) === 'stone', `lava over water: ${name(X6, Y6, Z)}`);
  console.log(`  water ran ${run.join(', ')} out and dried up; fell off an edge; infinite water between two sources (a bucket took it, it came back); lava three blocks; where they met on the floor: ${turned.join(", ")}, source ${name(X, Y4, Z)}; obsidian under water, stone under lava`);
}
