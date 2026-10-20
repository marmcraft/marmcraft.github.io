import { readFileSync } from 'node:fs';
import { MarmEnv } from '../../src/agent/env';
import { runScripted } from '../../src/agent/scripted';
import { check } from './_harness';

/**
 * Reset is reproducible: the same task instance (task, seed) and the same actions give the same episode, action
 * by action (every result message and the grade). So when the LLM agent's trials differ, the difference is the
 * policy's, not the environment's.
 */
const CASES: [string, number][] = [
  ['stone_pickaxe', 23],
  ['survive_night', 11],
  ['smelt_iron', 37],
];

export default function agentreset() {
  const env = new MarmEnv(readFileSync('engine/pkg/voxel_engine_bg.wasm'));
  for (const [task, seed] of CASES) {
    const a = runScripted(env, task, seed);
    const b = runScripted(env, task, seed);
    const same = JSON.stringify(a.log) === JSON.stringify(b.log) && JSON.stringify(a.grade) === JSON.stringify(b.grade);
    check(same, `${task} seed ${seed}: two runs identical (${a.log.length} actions, success ${a.grade.success}, ${a.grade.simSeconds} sim s)`);
  }
}
