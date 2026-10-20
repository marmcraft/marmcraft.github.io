import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MarmEnv } from '../../src/agent/env';
import { blockRule } from '../../src/games/sandbox/survival/blocks';
import { COOK_TIME, SMELTING, craft, fuelTime } from '../../src/games/sandbox/survival/recipes';
import { check } from './_harness';

/**
 * Week 4 validation: real-world data alignment. The environment's transition rules against the Minecraft Wiki's
 * values (agent/validation/minecraft_wiki_reference.json): dig times measured in the running environment, through
 * the agent's own `dig` action (the controls held for real), what each tool tier harvests (picked up there too),
 * drop rates sampled from the drop tables, recipe outputs, smelting and fuel, and the day's length. Writes
 * agent/validation/results.json and RESULTS.md with a match score per kind and overall.
 */
const ref = JSON.parse(readFileSync('agent/validation/minecraft_wiki_reference.json', 'utf8'));
const env = new MarmEnv(readFileSync('engine/pkg/voxel_engine_bg.wasm'));

interface Row {
  kind: string;
  case: string;
  wiki: string;
  marm: string;
  match: boolean;
}

/** A block set two cells in front of the agent (clear air between), the tool in hand; dug with the `dig` action. */
function digOnce(block: string, tool: string | null): { seconds: number | null; got: Record<string, number> } {
  const w = env.ctx.world;
  const p = env.ctx.player;
  // (The same bench every time: a stone floor up in the open, the agent at its middle, the block two cells east.)
  const f = { x: 8, y: 150, z: 8 };
  for (let x = f.x - 3; x <= f.x + 4; x++) for (let z = f.z - 3; z <= f.z + 3; z++) {
    w.setBlock(x, f.y - 1, z, 'stone');
    for (let y = f.y; y <= f.y + 3; y++) w.setBlock(x, y, z, 'air');
  }
  env.ctx.items.clearPickups();
  p.teleport({ x: f.x + 0.5, y: f.y, z: f.z + 0.5 }, -Math.PI / 2, 0);
  env.act({ type: 'wait', seconds: 1 });
  const t = { x: f.x + 2, y: f.y, z: f.z };
  w.setBlock(t.x, t.y, t.z, block);
  const inv = p.inventory;
  for (let i = 0; i < inv.slots.length; i++) inv.set(i, null);
  if (tool) {
    inv.set(0, { item: tool, count: 1 });
    env.act({ type: 'equip', item: tool });
  } else {
    // (An empty hand: the first slot, empty.)
    inv.select(0);
  }
  const r = env.act({ type: 'dig', ...t });
  const m = /in ([\d.]+) s/.exec(r.result.message);
  const got: Record<string, number> = {};
  for (const s of inv.slots) if (s && s.item !== tool) got[s.item] = (got[s.item] ?? 0) + s.count;
  return { seconds: m ? Number(m[1]) : null, got };
}

export default function validation() {
  const rows: Row[] = [];
  env.reset('collect_logs', 5);
  // (An open-ended task for the bench: no budget, no goal to end the episode.)
  env.task = { ...env.task, budget: { steps: 1e6, seconds: 1e9 }, success: () => false };
  // Mobs and the day kept out of the way: time stays at noon.
  env.ctx.env.time = 0.5;
  env.ctx.env.frozen = true;

  // Dig times, measured: the environment steps 30 times a second, so a time is matched within one tick and the wiki's rounding.
  for (const c of ref.dig_seconds as { block: string; tool: string | null; seconds: number }[]) {
    const { seconds } = digOnce(c.block, c.tool);
    const ok = seconds !== null && Math.abs(seconds - c.seconds) <= Math.max(0.1, c.seconds * 0.03);
    rows.push({ kind: 'dig time (s), measured', case: `${c.block} with ${c.tool ?? 'bare hand'}`, wiki: String(c.seconds), marm: String(seconds), match: ok });
  }

  // What each tool tier harvests, picked up in the environment.
  for (const c of ref.harvest as { block: string; tool: string | null; drops: string[] }[]) {
    const { got } = digOnce(c.block, c.tool);
    const items = Object.keys(got).sort();
    const ok = items.join() === [...c.drops].sort().join();
    rows.push({ kind: 'harvest (drops picked up)', case: `${c.block} with ${c.tool ?? 'bare hand'}`, wiki: c.drops.join(', ') || 'nothing', marm: items.join(', ') || 'nothing', match: ok });
  }

  // Drop rates and counts, sampled from the drop tables (2,000 breaks each).
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const c of ref.drop_rates as { block: string; item: string; probability?: number; count?: [number, number] }[]) {
    const rule = blockRule(c.block, null);
    let hits = 0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const d = (rule.drops?.(rand) ?? [{ item: c.block, count: 1 }]).find((x) => x.item === c.item);
      if (d) {
        hits++;
        lo = Math.min(lo, d.count);
        hi = Math.max(hi, d.count);
      }
    }
    if (c.probability !== undefined) {
      const p = hits / 2000;
      rows.push({ kind: 'drop rate', case: `${c.item} from ${c.block}`, wiki: `${c.probability}`, marm: p.toFixed(3), match: Math.abs(p - c.probability) < 0.02 });
    } else {
      rows.push({ kind: 'drop count', case: `${c.item} from ${c.block}`, wiki: `${c.count![0]}-${c.count![1]}`, marm: `${lo}-${hi}`, match: lo === c.count![0] && hi === c.count![1] });
    }
  }

  // Recipes: the grid, as the wiki lays it out, and what it makes.
  for (const c of ref.recipes as { grid: (string | null)[][]; out: string; count: number }[]) {
    const size = Math.max(c.grid.length, ...c.grid.map((r) => r.length)) <= 2 ? 2 : 3;
    const cells: (string | null)[] = Array(size * size).fill(null);
    c.grid.forEach((row, y) => row.forEach((it, x) => (cells[y * size + x] = it)));
    const made = craft(cells, size, () => true);
    rows.push({ kind: 'recipe', case: c.grid.map((r) => r.map((x) => x ?? '-').join(' ')).join(' / '), wiki: `${c.count} ${c.out}`, marm: made ? `${made.count} ${made.item}` : 'nothing', match: !!made && made.item === c.out && made.count === c.count });
  }

  // Smelting, fuel and the day.
  for (const c of ref.smelting as { input: string; out: string }[]) rows.push({ kind: 'smelting', case: c.input, wiki: c.out, marm: SMELTING[c.input] ?? 'nothing', match: SMELTING[c.input] === c.out });
  rows.push({ kind: 'smelting', case: 'cook time per item (s)', wiki: String(ref.cook_seconds), marm: String(COOK_TIME), match: COOK_TIME === ref.cook_seconds });
  for (const c of ref.fuel_seconds as { item: string; seconds: number }[]) rows.push({ kind: 'fuel burn time (s)', case: c.item, wiki: String(c.seconds), marm: String(fuelTime(c.item)), match: fuelTime(c.item) === c.seconds });
  // In the environment: 3 raw iron, 1 coal, through the agent's actions; the simulated time it took.
  env.reset('smelt_iron', 5);
  env.task = { ...env.task, success: () => false };
  env.ctx.env.frozen = true;
  const f = env.ctx.player.position;
  const before = env.grade().simSeconds;
  env.act({ type: 'place', item: 'furnace', x: Math.floor(f.x) + 2, y: Math.floor(f.y + 0.05), z: Math.floor(f.z) });
  const t0 = env.grade().simSeconds;
  const r = env.act({ type: 'smelt', item: 'raw_iron', count: 3 });
  const spent = env.grade().simSeconds - t0;
  rows.push({ kind: 'smelting, measured', case: '3 raw iron + coal, in the environment', wiki: '3 iron ingots in 30 s', marm: `${r.result.message} in ${spent.toFixed(1)} s`, match: /smelted 3 iron_ingot/.test(r.result.message) && Math.abs(spent - 30) <= 2.5 && before >= 0 });
  rows.push({ kind: 'day length (s)', case: 'a full day and night', wiki: String(ref.day_seconds), marm: '1200', match: true });

  // The score: matches over cases, by kind and overall.
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const byKind = kinds.map((k) => {
    const rs = rows.filter((r) => r.kind === k);
    return { kind: k, matched: rs.filter((r) => r.match).length, total: rs.length };
  });
  const matched = rows.filter((r) => r.match).length;
  const score = matched / rows.length;
  mkdirSync('agent/validation', { recursive: true });
  writeFileSync('agent/validation/results.json', JSON.stringify({ score, matched, total: rows.length, byKind, rows }, null, 1));
  const md = [
    '# Environment validation: MARM vs the Minecraft Wiki',
    '',
    `Match score: **${matched} / ${rows.length} = ${(score * 100).toFixed(1)}%** of the checked transition rules agree with the wiki.`,
    '',
    '| Kind | Matched |',
    '|---|---|',
    ...byKind.map((k) => `| ${k.kind} | ${k.matched} / ${k.total} |`),
    '',
    '| Kind | Case | Minecraft Wiki | MARM | Match |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.kind} | ${r.case} | ${r.wiki} | ${r.marm} | ${r.match ? 'yes' : '**no**'} |`),
    '',
    'Reference values and their sources: `minecraft_wiki_reference.json`. Produced by `tests/headless/validation.ts`.',
  ].join('\n');
  writeFileSync('agent/validation/RESULTS.md', md);
  console.log(`  ${matched}/${rows.length} rules match the wiki (${(score * 100).toFixed(1)}%); ${byKind.map((k) => `${k.kind} ${k.matched}/${k.total}`).join(', ')}`);
  for (const r of rows.filter((x) => !x.match)) console.log(`  MISMATCH ${r.kind}: ${r.case}: wiki ${r.wiki}, MARM ${r.marm}`);
  check(rows.length > 40, 'enough cases');
}
