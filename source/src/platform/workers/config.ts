import type { TerrainGen } from '@engine/voxel_engine.js';
import type { BlockRef, SharedDefinition } from '../api/types';
import type { WorldGenConfig } from './protocol';

/**
 * A game's world settings as the terrain generator takes them: the same on every screen (its
 * terrain workers) and on the server (its own copy of the world).
 */
export function worldGenConfig(def: Pick<SharedDefinition, 'world'>, blockId: (b: BlockRef) => number): WorldGenConfig {
  const w = def.world ?? {};
  return {
    flat: w.terrain === 'flat' ? (w.flatHeight ?? 64) : undefined,
    void: w.terrain === 'void',
    ground: w.terrain === 'void' && w.ground ? { y: w.ground.y, top: blockId(w.ground.top ?? 'grass_block'), fill: blockId(w.ground.fill ?? 'dirt'), depth: w.ground.depth ?? 4 } : undefined,
    terraforms: w.terraform ?? [],
    blueprints: (w.structures ?? []).map((s) => s.build(blockId)),
    end: w.end && { x: w.end.x, middle: w.end.middle, portal: blockId(w.end.portal) },
    nether: w.nether && { x: w.nether.x, rack: blockId(w.nether.rack), soulSand: blockId(w.nether.soulSand), quartz: blockId(w.nether.quartz), glowstone: blockId(w.nether.glowstone ?? 'glowstone'), lava: blockId('lava') },
  };
}

/** Apply a game's world configuration to a generator (workers and the main thread). */
export function applyWorldConfig(gen: TerrainGen, cfg: WorldGenConfig) {
  if (cfg.flat !== undefined) gen.set_flat(cfg.flat);
  if (cfg.void) gen.set_void();
  if (cfg.void && cfg.ground) gen.set_void_ground(cfg.ground.y, cfg.ground.top, cfg.ground.fill, cfg.ground.depth);
  for (const t of cfg.terraforms) gen.add_terraform(t.x, t.z, t.radius, t.blend, t.height);
  if (cfg.end) gen.set_end(cfg.end.x, cfg.end.middle, cfg.end.portal);
  if (cfg.nether) gen.set_nether(cfg.nether.x, cfg.nether.rack, cfg.nether.soulSand, cfg.nether.quartz, cfg.nether.glowstone, cfg.nether.lava);
  for (const b of cfg.blueprints) gen.add_blueprint(b.origin.x, b.origin.y, b.origin.z, b.size.x, b.size.y, b.size.z, b.data);
}
