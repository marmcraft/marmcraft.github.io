import type { Action, MarmEnv } from './env';

/**
 * A scripted expert: a hand-written plan for each task, using only the environment's actions (no model). It shows
 * every task instance can be done (solvability, for the environment's validation) and gives an upper reference for
 * the agent's scores. It reads only what the agent could (its own position and inventory, what's in sight).
 */

type Act = (a: Action) => { ok: boolean; message: string };

const feet = (env: MarmEnv) => {
  const p = env.player.position;
  return { x: Math.floor(p.x), y: Math.floor(p.y + 0.05), z: Math.floor(p.z) };
};
const carried = (env: MarmEnv, item: string) => env.player.inventory.slots.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
const planksOf = (env: MarmEnv) => (env.player.inventory.slots.find((s) => s?.item.endsWith('_log'))?.item ?? 'oak_log').replace('_log', '_planks');

/** An empty cell beside the agent, on solid ground, to put a block in (two cells off: never where the body is). */
function beside(env: MarmEnv) {
  const f = feet(env);
  const w = env.ctx.world;
  for (const r of [2, 3]) {
    for (const dy of [0, -1, 1]) {
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, 1], [-r, -1], [1, r], [-1, -r]]) {
        const c = { x: f.x + dx, y: f.y + dy, z: f.z + dz };
        if (w.blockName(w.getBlock(c.x, c.y, c.z)) === 'air' && w.blockInfo(w.getBlock(c.x, c.y - 1, c.z))?.solid) return c;
      }
    }
  }
  return { x: f.x + 2, y: f.y, z: f.z };
}

/** Whether a block's in sight (what the agent's observation lists). */
const inSight = (env: MarmEnv, block: string) => env.observe().data.blocks.some((b) => b.block === block);

function woodenPickaxe(env: MarmEnv, act: Act) {
  for (let i = 0; i < 3 && carried(env, planksOf(env).replace('_planks', '_log')) < 3; i++) act({ type: 'mine', block: 'log', count: 3 });
  act({ type: 'craft', item: planksOf(env), count: 12 });
  act({ type: 'craft', item: 'crafting_table' });
  const t = beside(env);
  act({ type: 'place', item: 'crafting_table', ...t });
  act({ type: 'craft', item: 'stick', count: 4 });
  act({ type: 'craft', item: 'wooden_pickaxe' });
  return t;
}

export const PLANS: Record<string, (env: MarmEnv, act: Act) => void> = {
  collect_logs: (env, act) => {
    for (let i = 0; i < 4 && env.grade().success === false; i++) act({ type: 'mine', block: 'log', count: 4 });
  },
  crafting_table: (env, act) => {
    act({ type: 'mine', block: 'log', count: 1 });
    act({ type: 'craft', item: planksOf(env), count: 4 });
    act({ type: 'craft', item: 'crafting_table' });
  },
  wooden_pickaxe: (env, act) => void woodenPickaxe(env, act),
  stone_pickaxe: (env, act) => {
    const table = woodenPickaxe(env, act);
    act({ type: 'equip', item: 'wooden_pickaxe' });
    // Stone already in sight (a hillside, a cliff): mined where it shows. Then (short of three) a staircase from
    // beside the table, the way down from there.
    const start = feet(env);
    if (inSight(env, 'stone')) act({ type: 'mine', block: 'stone', count: 3 });
    if (carried(env, 'cobblestone') < 3) act({ type: 'move_to', ...start });
    // A staircase down, away from the table, three blocks a step (the body walks in at its old height, head and all,
    // then drops a block), till the steps give three cobblestone; then back up to the table.
    const top = feet(env);
    const sx = top.x === table.x ? 0 : Math.sign(top.x - table.x);
    const sz = sx ? 0 : Math.sign(top.z - table.z) || 1;
    for (let i = 1; i <= 10 && carried(env, 'cobblestone') < 3; i++) {
      for (const dy of [2, 1, 0]) if (dy < 2 || i > 1) act({ type: 'dig', x: top.x + sx * i, y: top.y - i + dy, z: top.z + sz * i });
      act({ type: 'move_to', x: top.x + sx * i, y: top.y - i, z: top.z + sz * i });
    }
    act({ type: 'move_to', ...table });
    act({ type: 'craft', item: 'stone_pickaxe' });
  },
  smelt_iron: (env, act) => {
    act({ type: 'place', item: 'furnace', ...beside(env) });
    act({ type: 'smelt', item: 'raw_iron', count: 3 });
  },
  survive_night: (env, act) => {
    // Three blocks down, a roof of dirt over the head, and wait for the morning.
    let f = feet(env);
    // (On a slope's edge the block under the cell isn't the one stood on: a level spot nearby, then.)
    if (!act({ type: 'dig', x: f.x, y: f.y - 1, z: f.z }).ok) {
      act({ type: 'move_to', ...beside(env) });
      f = feet(env);
      act({ type: 'dig', x: f.x, y: f.y - 1, z: f.z });
    }
    for (let d = 2; d <= 3; d++) act({ type: 'dig', x: f.x, y: f.y - d, z: f.z });
    act({ type: 'place', item: 'dirt', x: f.x, y: f.y - 1, z: f.z });
    for (let i = 0; i < 3; i++) act({ type: 'wait', seconds: 300 });
  },
};

/** Run the scripted expert on one task instance; returns the grade and the actions' log. */
export function runScripted(env: MarmEnv, task: string, seed: number) {
  env.reset(task, seed);
  const log: string[] = [];
  const act: Act = (a) => {
    const r = env.act(a);
    log.push(`${JSON.stringify(a)} -> ${r.result.ok ? 'OK' : 'FAILED'}: ${r.result.message}`);
    return r.result;
  };
  PLANS[task](env, act);
  return { grade: env.grade(), log };
}
