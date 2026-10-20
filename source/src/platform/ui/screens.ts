import { h } from './dom';
import { McCreative, type ShownStack } from './mcinventory';
import type { Registry } from '../world/registry';

/**
 * Creative block picker: the platform's grid of blocks, or (`look: 'minecraft'`, a game in Mineclonia's look) Minecraft's
 * creative inventory, which does the showing and the picking: tabs, search, the hotbar and the slots behind it.
 */
export class Inventory {
  readonly root: HTMLElement;
  /** A block for a slot (the selected one, unless said; 0 empties it), or moved there from another slot (`fromSlot`). */
  onPick: ((id: number, slot?: number, fromSlot?: number) => void) | null = null;
  private mc: McCreative | null = null;

  constructor(parent: HTMLElement, registry: Registry, icons: Map<number, string>, onClose: () => void, look: 'plain' | 'minecraft' = 'plain') {
    if (look === 'minecraft') {
      this.mc = new McCreative(parent, registry, icons, onClose, (id, slot, fromSlot) => this.onPick?.(id, slot, fromSlot));
      this.root = this.mc.root;
      return;
    }
    const grid = h('div.inv-grid');
    for (const b of registry.blocks) {
      if (!b.placeable) continue;
      const cell = h('button.inv-cell', { title: b.label, onclick: () => this.onPick?.(b.id) }, h('img', { src: icons.get(b.id) ?? '', alt: b.label, draggable: false }));
      grid.append(cell);
    }
    this.root = h(
      'div.screen.inventory-screen.hidden',
      { onclick: (e: Event) => e.target === this.root && onClose() },
      h('div.panel.inv-panel', {}, h('div.panel-head', {}, h('h2', {}, 'Blocks'), h('span.hint', {}, 'Click a block to put it in the selected hotbar slot'), h('button.btn', { onclick: () => onClose() }, 'Done')), grid),
    );
    parent.append(this.root);
  }

  /** What they carry (the hotbar's nine, then the twenty-seven behind it) and the chosen slot: Minecraft's inventory shows it. */
  setHotbar(ids: number[], selected: number) {
    this.mc?.setHotbar(ids, selected);
  }

  /** A survivor's own inventory (Minecraft's look only): what they carry, shown in place of the blocks to build with; null back to building. */
  setStacks(stacks: (ShownStack | null)[] | null, selected = 0) {
    this.mc?.setStacks(stacks, selected);
  }
  /** A container open beside what they carry (a crafting grid, a furnace), or none. */
  setContainer(box: Parameters<McCreative['setContainer']>[0]) {
    this.mc?.setContainer(box);
  }
  /** A stack moved (their slots, the container's from 100; -1 a quick move), or thrown out of the screen. */
  set onMove(fn: McCreative['onMove']) {
    if (this.mc) this.mc.onMove = fn;
  }
  set onToss(fn: McCreative['onToss']) {
    if (this.mc) this.mc.onToss = fn;
  }
  /** The game's items, each with a number (past the blocks' ids), in the creative inventory's tabs. */
  setItems(items: Parameters<McCreative['setItems']>[0]) {
    this.mc?.setItems(items);
  }
  setTabImage(id: string, src: string) {
    this.mc?.setTabImage(id, src);
  }
  /** It shows a survivor's own inventory (Minecraft's look). */
  get survives(): boolean {
    return !!this.mc;
  }

  /** Minecraft's inventory's own: the player's figure for it. */
  set doll(fn: McCreative['doll']) {
    if (this.mc) this.mc.doll = fn;
  }

  show() {
    if (this.mc) return this.mc.show();
    this.root.classList.remove('hidden');
  }

  hide() {
    if (this.mc) return this.mc.hide();
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}
