/** Generator configuration shared by every worker (game structures, terraforming). */
export interface WorldGenConfig {
  flat?: number;
  void?: boolean;
  /** A void world's ground (block ids). */
  ground?: { y: number; top: number; fill: number; depth: number };
  terraforms: { x: number; z: number; radius: number; blend: number; height: number }[];
  blueprints: { origin: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; data: Uint16Array }[];
  /** A Nether east of `x` (block ids). */
  nether?: { x: number; rack: number; soulSand: number; quartz: number; glowstone: number; lava: number };
  /** An End west of `x` (block id). */
  end?: { x: number; middle: number; portal: number };
}

export type WorkerRequest =
  /** `blocks`: the game's own blocks, as the engine takes them (`set_game_blocks`). */
  | { type: 'init'; module: WebAssembly.Module; seed: number; world: WorldGenConfig; blocks: string }
  | { type: 'gen'; id: number; cx: number; cz: number }
  | { type: 'mesh'; id: number; cx: number; cz: number; region: Uint8Array };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'gen'; id: number; cx: number; cz: number; data: Uint8Array; ms: number }
  | { type: 'mesh'; id: number; cx: number; cz: number; data: Uint32Array; ms: number }
  | { type: 'error'; id: number; message: string };
