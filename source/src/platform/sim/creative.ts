import type { VoxelWorld } from '@engine/voxel_engine.js';
import type { RayHit } from '../api/types';
import type { Registry } from '../world/registry';
import type { PlayerSim } from './player';
import type { Presentation } from './present';
import { rayHit } from './worldquery';
import { defaultBreakTime } from '../kits/building';

const REACH = 6.5;

/**
 * Creative building (`player.build`): a hotbar of blocks, instant breaking and placing, and
 * middle-click to pick the block you're looking at.
 */
export class CreativeBuild {
  /** What they carry: the hotbar's nine slots, then the twenty-seven of their inventory behind it (0: an empty slot). */
  hotbar: number[];
  selected = 0;
  /** Breaking and placing blocks are theirs (`Player.build`): off, the hotbar's still theirs to choose from, but the world isn't theirs to change. */
  editing = true;
  /**
   * Blocks are mined, not broken at a touch (survival: `Player.setCreative(false)`): held on, a block cracks stage by stage
   * (its `hardness` in seconds, else the platform's time for its kind) and breaks when it's through.
   */
  timed = false;
  /** The block being mined (its cell), and how far through it is (0..1). */
  private mining = { key: '', progress: 0, swingT: 0 };
  private breakTimer = 0;
  private placeTimer = 0;

  constructor(
    private world: VoxelWorld,
    private registry: Registry,
    private present: Presentation,
    private player: PlayerSim,
    /** Break a block with debris and what hangs on it (the simulation's `world.breakBlock`). */
    private breakBlock: (x: number, y: number, z: number) => boolean,
    /** Place a block against the face aimed at (the simulation's `world.placeBlock`). */
    private placeBlock: (x: number, y: number, z: number, id: number, against: RayHit) => boolean,
  ) {
    // (Empty to start: the creative inventory, E, fills it.)
    this.hotbar = Array(36).fill(0);
  }

  /** The chosen slot's block (0: none). */
  get selectedBlock(): number {
    return this.hotbar[this.selected] ?? 0;
  }

  select(i: number) {
    this.selected = ((i % 9) + 9) % 9;
  }

  /** The block picker: put a block in a slot (0 empties it), or swap two slots (`fromSlot`: where it came from, which must hold it). */
  pick(id: number, slot = this.selected, fromSlot?: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 35 || (id !== 0 && !this.registry.blocks[id]?.placeable)) return;
    if (fromSlot !== undefined) {
      if (!Number.isInteger(fromSlot) || fromSlot < 0 || fromSlot > 35 || this.hotbar[fromSlot] !== id) return;
      [this.hotbar[slot], this.hotbar[fromSlot]] = [this.hotbar[fromSlot], this.hotbar[slot]];
    } else this.hotbar[slot] = id;
  }

  /** The block to pick for one in the world: its family's (a wall torch is a torch). */
  private pickable(id: number): number | null {
    const def = this.registry.blocks[id];
    const d = def && this.registry.byName.get(def.name);
    return d?.placeable ? d.id : null;
  }

  private swing() {
    this.player.swings++;
    this.present.send(this.player.id, 'view', 'use', [1]);
  }

  update(dt: number) {
    this.breakTimer = Math.max(0, this.breakTimer - dt);
    this.placeTimer = Math.max(0, this.placeTimer - dt);
    const eye = this.player.eye;
    const d = this.player.look;
    // (Not theirs to change, or they're dead or watching: no block's outlined or broken or placed.)
    const edits = this.editing && !this.player.spectating && !this.player.health.dead;
    const t = edits ? rayHit(this.world, eye, d, REACH) : null;
    const input = this.player.input;
    // (Survival: held on a block, it's mined (the cracks show how far); creative: broken at a touch.)
    const mined = this.timed && edits && input.active ? this.mine(t, dt) : 0;
    this.present.send(this.player.id, 'hud', 'highlight', [t && { x: t.x, y: t.y, z: t.z }, ...(mined > 0 ? [{ progress: mined }] : [])]);
    if (!input.active) return;

    if (input.wheel !== 0) this.select(this.selected + input.wheel);
    for (let i = 0; i < 9; i++) if (input.pressed(`Digit${i + 1}`)) this.select(i);
    if (!edits) return;

    if (input.buttonPressed(0)) this.swing();
    if (!this.timed && t && (input.buttonPressed(0) || (input.button(0) && this.breakTimer <= 0))) {
      if (!input.buttonPressed(0)) this.swing();
      const def = this.registry.blocks[t.block];
      if (def?.breakable) this.breakBlock(t.x, t.y, t.z);
      this.breakTimer = input.buttonPressed(0) ? 0.3 : 0.22;
    }
    if (t && (input.buttonPressed(2) || (input.button(2) && this.placeTimer <= 0))) {
      this.swing();
      this.place(t);
      this.placeTimer = input.buttonPressed(2) ? 0.3 : 0.2;
    }
    if (t && input.buttonPressed(1)) {
      const id = this.pickable(t.block);
      if (id !== null) {
        // (Already in the hotbar: that slot's chosen. Else it goes in the first empty one, or the chosen one.)
        const at = this.hotbar.slice(0, 9).indexOf(id);
        const empty = this.hotbar.slice(0, 9).indexOf(0);
        if (at >= 0) this.select(at);
        else if (empty >= 0 && !this.hotbar[this.selected]) this.hotbar[this.selected] = id;
        else if (empty >= 0) {
          this.hotbar[empty] = id;
          this.select(empty);
        }
        else this.hotbar[this.selected] = id;
      }
    }
  }

  /**
   * Survival's mining, a step at a time: held on the same block, how far through it goes up by the step over its time (its
   * `hardness`, else the platform's time for its kind: `kits/building`'s `defaultBreakTime`); the arm swings now and then;
   * through it, it breaks. Let go, or looked away, it starts again. Returns how far through it is (0: not mining).
   */
  private mine(t: RayHit | null, dt: number): number {
    const m = this.mining;
    m.swingT = Math.max(0, m.swingT - dt);
    const def = t ? this.registry.blocks[t.block] : undefined;
    if (!t || !def?.breakable || !this.player.input.button(0)) {
      m.key = '';
      m.progress = 0;
      return 0;
    }
    const time = def.hardness ?? defaultBreakTime(def.name, def.shape === 'cross');
    if (!Number.isFinite(time)) return 0;
    const key = `${t.x},${t.y},${t.z}`;
    if (key !== m.key) {
      m.key = key;
      m.progress = 0;
    }
    m.progress += time <= 0 ? 1 : dt / time;
    if (m.swingT <= 0) {
      m.swingT = 0.25;
      this.swing();
    }
    if (m.progress < 1) return m.progress;
    this.breakBlock(t.x, t.y, t.z);
    m.key = '';
    m.progress = 0;
    // (A short pause before the next block, as Minecraft has.)
    m.swingT = 0.15;
    return 0;
  }

  private place(t: RayHit) {
    // Against the face aimed at, or into a plant's cell.
    // (An empty hand places nothing.)
    if (!this.selectedBlock) return;
    const into = this.registry.blocks[t.block]?.replaceable;
    this.placeBlock(into ? t.x : t.x + t.normal.x, into ? t.y : t.y + t.normal.y, into ? t.z : t.z + t.normal.z, this.selectedBlock, t);
  }
}
