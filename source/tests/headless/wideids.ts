import { readFileSync } from 'node:fs';
import { Blueprint, defineGame, type BlockDefinition, type GameDefinition } from '../../src/platform';
import { GameHost } from '../../src/platform/host/game';
import { MemoryStore } from '../../src/platform/host/store';
import { EDITS_WIDE, firstGameBlock } from '../../src/platform/world/blocks';
import { check } from './_harness';

const wasm = readFileSync('engine/pkg/voxel_engine_bg.wasm');
const FLOOR = 64;
/** More of a game's own blocks than one-byte ids had room for (68 then). */
const COUNT = 400;

/** A game with `COUNT` blocks of its own (`b0` … `b399`), in `order`, and a floor with the last of them set into it. */
function game(order: string[]): GameDefinition {
  const blocks: Record<string, BlockDefinition> = {};
  for (const name of order) blocks[name] = { texture: { color: `#${(Number(name.slice(1)) * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)}` } };
  const bp = new Blueprint({ x: -4, y: FLOOR - 1, z: -4 }, { x: 9, y: 1, z: 9 });
  bp.fill({ x: -4, y: FLOOR - 1, z: -4 }, { x: 4, y: FLOOR - 1, z: 4 }, 'stone');
  bp.set(2, FLOOR - 1, 2, `b${COUNT - 1}`);
  return defineGame({
    id: 'wideids',
    title: 'Wide ids',
    world: { terrain: 'void', structures: [bp], spawn: { x: 0.5, y: FLOOR, z: 0.5 }, persist: true },
    player: { build: true, fly: true, health: false },
    blocks,
  });
}

/**
 * Block ids two bytes wide: a game with 400 blocks of its own (ids well past 255), set by a structure
 * and by hand, kept in a save, loaded again with the blocks reordered (their ids move past 255, the
 * blocks stay), and a save from before (a byte a block, no tag) still read.
 */
export default function wideids() {
  const names = Array.from({ length: COUNT }, (_, i) => `b${i}`);
  const store = new MemoryStore();
  const host = new GameHost(game(names), { engine: wasm, seed: 1, budget: Infinity, store, remote: true });
  const w = host.sim.ctx.world;
  const last = w.blockId(`b${COUNT - 1}`);
  check(last === firstGameBlock() + COUNT - 1 && last > 255, `the last block's id is past a byte: ${last}`);
  check(w.blockName(w.getBlock(2, FLOOR - 1, 2)) === `b${COUNT - 1}`, `a structure sets it: ${w.blockName(w.getBlock(2, FLOOR - 1, 2))}`);
  w.setBlock(1, FLOOR, 1, 'b300');
  w.setBlock(-1, FLOOR, 1, 'b5');
  check(w.blockName(w.getBlock(1, FLOOR, 1)) === 'b300' && w.getBlock(1, FLOOR, 1) > 255, 'set by hand, past a byte');
  host.persist();
  const saved = store.world()!.edits!;
  check(EDITS_WIDE.every((b, i) => saved[i] === b), 'the save is tagged as two-byte ids');
  host.dispose();

  // The same save, the blocks defined in reverse: every id moves; the blocks don't.
  const again = new GameHost(game([...names].reverse()), { engine: wasm, seed: 1, budget: Infinity, store, remote: true });
  const w2 = again.sim.ctx.world;
  check(w2.blockId('b300') !== w.blockId('b300'), `b300's id moved: ${w.blockId('b300')} to ${w2.blockId('b300')}`);
  check(w2.blockName(w2.getBlock(1, FLOOR, 1)) === 'b300', `and it's still b300: ${w2.blockName(w2.getBlock(1, FLOOR, 1))}`);
  check(w2.blockName(w2.getBlock(-1, FLOOR, 1)) === 'b5', `b5 too (now past a byte: ${w2.blockId('b5')})`);
  again.dispose();

  // A save from before ids were two bytes: [cx, cz, count, (local u32, block u8)*], no tag.
  const old = new Uint8Array(12 + 5);
  const v = new DataView(old.buffer);
  v.setInt32(0, 0, true);
  v.setInt32(4, 0, true);
  v.setUint32(8, 1, true);
  v.setUint32(12, (FLOOR << 8) | (3 << 4) | 3, true);
  old[16] = firstGameBlock() + 7;
  const oldStore = new MemoryStore();
  oldStore.saveWorld({ game: 'wideids', seed: 1, edits: old, blocks: names, time: 0 });
  const fromOld = new GameHost(game(names), { engine: wasm, seed: 1, budget: Infinity, store: oldStore, remote: true });
  const w3 = fromOld.sim.ctx.world;
  check(w3.blockName(w3.getBlock(3, FLOOR, 3)) === 'b7', `a one-byte save loads: ${w3.blockName(w3.getBlock(3, FLOOR, 3))}`);
  fromOld.dispose();
  console.log(`  ${COUNT} blocks of a game's own (ids to ${last}), by structure and by hand, kept tagged, reloaded reordered, and an old one-byte save read`);
}
