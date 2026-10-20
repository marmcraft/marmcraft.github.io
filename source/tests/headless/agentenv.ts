import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MarmEnv } from '../../src/agent/env';
import { runScripted } from '../../src/agent/scripted';
import { TASKS } from '../../src/agent/tasks';
import { check } from './_harness';

/**
 * The agent environment (src/agent): every task in the suite can be done through the actions alone, on every
 * evaluation seed, by the scripted expert (src/agent/scripted.ts: a hand-written plan, no model). Shows the task
 * instances are solvable and the actions work, and gives the expert's reference scores. Writes
 * agent/validation/solvability.json.
 */
const SEEDS = [11, 23, 37];

export default function agentenv() {
  const env = new MarmEnv(readFileSync('engine/pkg/voxel_engine_bg.wasm'));
  const rows: { task: string; seed: number; success: boolean; progress: number; steps: number; invalid: number; simSeconds: number }[] = [];
  for (const task of TASKS) {
    for (const seed of SEEDS) {
      const { grade: g, log } = runScripted(env, task.id, seed);
      rows.push({ task: task.id, seed, success: g.success, progress: g.progress, steps: g.steps, invalid: g.invalid, simSeconds: g.simSeconds });
      if (!g.success) console.log(`  ${task.id} seed ${seed} NOT solved:\n    ${log.join('\n    ')}`);
    }
  }
  mkdirSync('agent/validation', { recursive: true });
  writeFileSync('agent/validation/solvability.json', JSON.stringify(rows, null, 1));
  for (const t of TASKS) {
    const rs = rows.filter((r) => r.task === t.id);
    console.log(`  ${t.id}: ${rs.filter((r) => r.success).length}/${rs.length} seeds solved, ${rs.map((r) => `${r.steps} actions / ${r.simSeconds} s`).join('; ')}`);
  }
  const solved = rows.filter((r) => r.success).length;
  check(solved === rows.length, `${solved}/${rows.length} task instances solved by the scripted expert`);
}
