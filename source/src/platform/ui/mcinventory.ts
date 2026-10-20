import './mcinventory.css';
import { h } from './dom';
import { McDoll, type DollWear } from './mcdoll';
import { MAGNIFIER } from './pixelicons';
import type { ModelSpec } from '../api/types';
import type { Registry } from '../world/registry';

/** A page of a game's own beside what they carry (mconline's pets): none of this build's games has one, but the inventory keeps the place for it. */
export interface InventoryPage {
  id: string;
  title: string;
  image: string;
  cells: readonly { id: string; icon: string; tip: string; tipColor?: string; chosen?: boolean }[];
  onPick(cell: string): void;
  side?: HTMLElement;
  head?: HTMLElement;
  onHover?(cell: string | null): void;
  onShown?(shown: boolean): void;
}

/** What a game sets round a survivor's own inventory (mconline's): unused here, kept for the inventory's own layout. */
export interface InventoryAround {
  left?: HTMLElement;
  right?: HTMLElement;
  person?: HTMLElement;
  onShown?(shown: boolean): void;
}

/**
 * The creative inventory the way Minecraft has it (Java Edition's): the grey panel with its tabs
 * along the top and bottom, nine columns of slots that scroll, the hotbar under them, a search
 * tab, and the same hands: click a block to pick it up (it follows the pointer), click a hotbar
 * slot to put it down (or swap), click back among the blocks or outside the panel to let it go;
 * shift-click sends a block straight to the hotbar, a number key puts the one under the pointer in
 * that slot, the wheel scrolls. Sized in Minecraft's GUI pixels, at its automatic GUI scale.
 */

interface Tab {
  id: string;
  title: string;
  /** The block on the tab (the first of these the game has), or a picture where Minecraft's is an item. */
  icon: string[];
  image?: string;
  /** Where a block comes in the tab (Minecraft's order: lower first), or -1 if it isn't in it. */
  rank: (name: string) => number;
  bottom?: boolean;
  right?: boolean;
}

/** A tab's blocks in order: a block's place is the first of these its name fits (a block can be in several tabs, as Minecraft's are). */
const listed = (patterns: RegExp[]) => (name: string) => patterns.findIndex((p) => p.test(name));
const WOOD = '(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped)';

// The creative inventory's sections and what's in each, as Minecraft has them
// (https://minecraft.wiki/w/Creative_inventory): of the blocks a game has. What's a game's own and
// Minecraft has no place for goes at the end of the nearest section.
const BUILDING = listed([
  /_log$/, /_stem$/, /^bamboo_block$/, /_wood$/, /_hyphae$/, /_planks$/, /^bamboo_mosaic$/, new RegExp(`^(${WOOD}|bamboo_mosaic)_stairs$`), new RegExp(`^${WOOD}_slab$`), new RegExp(`^${WOOD}_fence$`), /_fence_gate$/, new RegExp(`^${WOOD}_door$`), new RegExp(`^${WOOD}_trapdoor$`), new RegExp(`^${WOOD}_pressure_plate$`), new RegExp(`^${WOOD}_button$`),
  /_stairs$/, /_slab$/, /_wall$/, /^stone$/, /^stone_pressure_plate$/, /^stone_button$/, /^cobblestone$/, /^mossy_cobblestone$/, /^stone_bricks$/, /^granite$/, /^diorite$/, /^andesite$/, /^deepslate$/, /^bricks$/, /^sandstone$/, /^sea_lantern$/,
  /^nether_brick_fence$/, /^end_stone$/, /^iron_block$/, /^iron_bars$/, /^iron_door$/, /^iron_trapdoor$/, /^chain$/,
  /^marble$/, /^oak_beam$/, /^crate$/, /^oak_table$/,
]);
const COLOURED = listed([/_wool$/, /_carpet$/, /terracotta$/, /_concrete$/, /_concrete_powder$/, /^glass$/, /tinted/, /stained_glass$/, /^glass_pane$/, /_pane$/, /_bed$/, /^neon_/]);
const NATURAL = listed([
  /^grass_block$/, /^snowy_grass$/, /^podzol$/, /^dirt$/, /^clay$/, /^gravel$/, /^sand$/, /^sandstone$/, /^ice$/, /^snow_block$/, /^snow$/, /^stone$/, /^deepslate$/, /^granite$/, /^diorite$/, /^andesite$/, /^obsidian$/, /^end_stone$/,
  /^coal_ore$/, /^lapis_ore$/, /^redstone_ore$/, /^iron_ore$/, /^gold_ore$/, /^diamond_ore$/, /_ore$/, /^glowstone$/, /_log$/, /_leaves$/, /_mushroom$/, /^short_grass$/, /^fern$/, /^dead_bush$/, /^dandelion$/, /^poppy$/, /^cornflower$/,
  /^sugar_cane$/, /^cactus$/, /^vine$/, /^tall_grass$/, /^large_fern$/, /^sunflower$/, /^lilac$/, /^rose_bush$/, /^peony$/, /^lily_pad$/, /^cobweb$/, /^bedrock$/, /^water$/, /^lava$/,
  // (The rest of what grows and what the ground's made of, as a game has it.)
  /^(mycelium|coarse_dirt|rooted_dirt|mud|moss_block|moss_carpet|red_sand|packed_ice|blue_ice|calcite|tuff|dripstone_block|magma_block|crying_obsidian|netherrack|crimson_nylium|warped_nylium|soul_sand|soul_soil|bone_block|blackstone|basalt|smooth_basalt|ancient_debris|raw_.*_block|amethyst_block|.*mushroom_block|mushroom_stem|.*_wart_block|shroomlight)$/,
  /^(.*_sapling|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|lily_of_the_valley|gr_dandelion|gr_poppy|gr_cornflower|golden_dandelion|closed_eyeblossom|open_eyeblossom|pink_petals|wildflowers|spore_blossom|pitcher_plant|chorus_flower|wither_rose|torchflower|.*_fungus|.*_roots|nether_sprouts|amethyst_cluster|bush|firefly_bush|.*_dry_grass|cactus_flower|sweet_berry_bush|bamboo|seagrass|kelp)$/,
  /^farmland/, /^(wheat|carrots|potatoes|beetroots|nether_wart)_\d$/,
  /coral/, /^(sponge|wet_sponge|melon|pumpkin|carved_pumpkin|jack_o_lantern|hay_block|honeycomb_block|slime_block|honey_block|sculk|dried_kelp_block)$/, /^(fire|soul_fire)$/, /^flowing_/,
]);
const FUNCTIONAL = listed([
  /^torch$/, /^lantern$/, /^paper_lantern$/, /^chain$/, /^end_rod$/, /^sea_lantern$/, /^glowstone$/, /^anvil$/, /^enchanting_table$/, /^cauldron$/, /^ladder$/, /^flower_pot$/, /^bookshelf$/, /_sign$/, /^chest$/, /^crate$/, /_bed$/, /^head/, /^oak_table$/,
  /^(soul_torch|redstone_torch|soul_lantern|shroomlight|crying_obsidian|magma_block|redstone_lamp|redstone_lamp_on|crafting_table|stonecutter|cartography_table|fletching_table|smithing_table|loom|furnace|smoker|blast_furnace|campfire|composter|note_block|jukebox|brewing_stand|beacon|lodestone|scaffolding|bee_nest|beehive|barrel|ender_chest|end_portal_frame|lectern|cake)$/,
]);
const REDSTONE = listed([
  /^lever$/, /^oak_button$/, /^stone_button$/, /^oak_pressure_plate$/, /^stone_pressure_plate$/, /^daylight_detector$/, /^hopper$/, /^chest$/, /^rail$/, /^powered_rail$/, /^oak_door$/, /^iron_door$/, /^oak_fence_gate$/, /^oak_trapdoor$/, /^iron_trapdoor$/, /^redstone_ore$/,
  /^(redstone_torch|redstone_block|repeater|comparator|target|lectern|piston|sticky_piston|slime_block|honey_block|dispenser|dropper|barrel|furnace|jukebox|observer|note_block|composter|cauldron|detector_rail|activator_rail|tnt|redstone_lamp)$/,
]);
const NONE = () => -1;
const IN_NONE = (name: string) => [BUILDING, COLOURED, NATURAL, FUNCTIONAL, REDSTONE].every((r) => r(name) < 0);

/** A picture of nothing (a tab whose own comes later). */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const TABS: Tab[] = [
  // (A block no section claims is a building block: nothing a game has goes missing.)
  { id: 'building', title: 'Building Blocks', icon: ['bricks', 'stone_bricks', 'stone'], rank: (n) => (BUILDING(n) >= 0 ? BUILDING(n) : IN_NONE(n) ? 999 : -1) },
  { id: 'coloured', title: 'Colored Blocks', icon: ['cyan_wool', 'blue_wool', 'white_wool'], rank: COLOURED },
  { id: 'natural', title: 'Natural Blocks', icon: ['grass_block', 'dirt'], rank: NATURAL },
  { id: 'functional', title: 'Functional Blocks', icon: ['oak_sign', 'chest', 'torch', 'ladder'], rank: FUNCTIONAL },
  // (Minimal-marm: the tabs for blocks only, each tab's picture a block of the game's own; the search's a magnifying glass.)
  { id: 'redstone', title: 'Redstone Blocks', icon: ['rail', 'stone_button', 'oak_pressure_plate'], rank: REDSTONE },
  { id: 'search', title: 'Search Items', icon: [], rank: () => 0, right: true },
  // (A game's items, as Minecraft's bottom row has them: tools, weapons and armour, and what things are made from.
  // Each tab's picture is one of its items, given with `setTabImage`.)
  { id: 'tools', title: 'Tools & Utilities', icon: [], image: BLANK, rank: NONE, bottom: true },
  { id: 'combat', title: 'Combat', icon: [], image: BLANK, rank: NONE, bottom: true },
  { id: 'ingredients', title: 'Ingredients', icon: [], image: BLANK, rank: NONE, bottom: true },
  // (What they carry themselves: Minecraft's own inventory, the hotbar and the twenty-seven slots behind it.)
  { id: 'inventory', title: 'Inventory', icon: ['chest', 'crate'], rank: NONE, bottom: true, right: true },
];

/** The tab last open, kept from one opening to the next (and one visit to the next). */
const LAST_TAB = 'voxel.mcinv.tab';

const COLUMNS = 9;
const ROWS = 5;

type Carried = { block: number; fromSlot?: number; icon?: string };

/** A stack as the inventory shows it in survival: its picture, how many, its name. */
export interface ShownStack {
  icon: string;
  count: number;
  label: string;
  /** How much of a tool is left (0..1): a bar under it, green to red; unsaid for what doesn't wear. */
  left?: number;
  /** Its name's colour (its rarity's), and what's told of it under its name. */
  color?: string;
  tooltip?: TooltipLine[];
}
/** A line under an item's name in its tooltip: its colour, a small picture before it, a lore line's slant. */
export interface TooltipLine { text: string; color?: string; icon?: string; italic?: boolean }

/** An item of the game's that a builder may carry among their blocks: its number (as a hotbar slot holds it), its id, name, tab, and what part of the body it's worn on if it's armour. */
export interface CarriedItem {
  id: number;
  item: string;
  label: string;
  tab: string;
  wear?: 'helmet' | 'chestplate' | 'leggings' | 'boots';
  /** Its name's colour, as its rarity has it (a pet's tooltip's way): white, unsaid. */
  color?: string;
  /** What's told of it under its name (its stats, its lore). */
  tooltip?: TooltipLine[];
}
const WORN = ['helmet', 'chestplate', 'leggings', 'boots'] as const;

export class McCreative {
  /** The game's items a builder may carry, by number. */
  private items = new Map<number, CarriedItem>();
  /** What's worn: each slot's item's number (head, chest, legs, feet; 0 nothing). */
  private worn: number[] = [0, 0, 0, 0];
  private wornCells: HTMLElement[] = [];
  /** Armour put in a slot (0 the head's to 3 the feet's), or (null) taken out. */
  onWear: ((slot: number, item: string | null) => void) | null = null;
  /**
   * A place of the game's for what's worn or carried about them (`InventoryAround.person`'s `data-place`, and in survival the four
   * armour slots too): something of theirs set down on it (`from`: its slot, a survivor's), a builder's item put on (`item`), or
   * (both null) what's there taken off. The game says what goes where, and what's there after.
   */
  onPlace: ((place: string, from: number | null, item: string | null) => void) | null = null;

  setItems(items: CarriedItem[]) {
    this.items = new Map(items.map((i) => [i.id, i]));
    if (this.visible) {
      this.fill();
      this.setHotbar(this.hotbar, this.selected);
    }
    this.showWorn();
  }

  /** A tab's picture (an item's: the Tools tab's a pickaxe). */
  setTabImage(id: string, src: string) {
    const img = this.tabs.get(id)?.querySelector('img');
    if (img && img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  setWorn(items: readonly (string | null)[]) {
    const byItem = new Map([...this.items.values()].map((i) => [i.item, i.id]));
    this.worn = [0, 1, 2, 3].map((i) => (items[i] ? (byItem.get(items[i]!) ?? 0) : 0));
    this.showWorn();
  }

  private showWorn() {
    this.wornCells.forEach((cell, i) => {
      this.show1(cell, this.worn[i]);
      cell.classList.toggle('is-filled', !!this.worn[i]);
    });
  }

  /** A slot's or the list's thing by name: a block's, or an item's. */
  private labelOf(id: number): string | null {
    return this.registry.blocks[id]?.label ?? this.items.get(id)?.label ?? null;
  }
  /** The colour a slot's thing's name is written in: its rarity's, an item's that has one. */
  private colorOf(id: number): string | undefined {
    return this.registry.blocks[id] ? undefined : this.items.get(id)?.color;
  }
  private linesOf(id: number): TooltipLine[] | undefined {
    return this.registry.blocks[id] ? undefined : this.items.get(id)?.tooltip;
  }

  /** A click on one of the four slots for what's worn: armour in hand for that part goes on; empty-handed, what's there comes off. */
  private clickWorn(slot: number, e: MouseEvent) {
    // (A survivor's: one of their own stacks put on, or what's there taken off into their inventory, by the game.)
    if (this.stacks) return this.clickPlace(WORN[slot], e);
    const held = this.carried ? this.items.get(this.carried.block) : undefined;
    if (held?.wear === WORN[slot]) {
      // (What was worn there comes to hand in its place: changed, not lost.)
      const was = this.worn[slot];
      this.onWear?.(slot, held.item);
      this.carry(was && was !== held.id ? { block: was } : null);
      if (was) this.follow(e);
    } else if (!this.carried && this.worn[slot]) {
      const id = this.worn[slot];
      this.onWear?.(slot, null);
      if (!e.shiftKey) {
        this.carry({ block: id });
        this.follow(e);
      }
    }
  }

  /**
   * A place for what's worn or carried about them: with something in hand, that goes on (the game says if it fits; if it doesn't,
   * it's back where it came from, never let go); empty-handed, what's there comes off (a survivor's into their inventory, by the
   * game; a builder's to hand, as the armour slots' always did).
   */
  private clickPlace(place: string, e: MouseEvent) {
    if (this.stacks) {
      if (this.carried) {
        if (this.carried.fromSlot !== undefined) this.onPlace?.(place, this.carried.fromSlot, null);
        this.carry(null);
        this.setStacks(this.stacks, this.selected);
      } else this.onPlace?.(place, null, null);
      return;
    }
    const held = this.carried ? this.items.get(this.carried.block) : undefined;
    if (held) {
      this.onPlace?.(place, null, held.item);
      this.carry(null);
    } else if (!this.carried) {
      const there = this.placed.get(place);
      const id = there ? [...this.items.values()].find((i) => i.item === there)?.id : undefined;
      if (!there) return;
      this.onPlace?.(place, null, null);
      if (id && !e.shiftKey) {
        this.carry({ block: id });
        this.follow(e);
      }
    } else this.drop();
  }
  /** What's in each of the game's places now (its `data-place` cells' `data-item`), for a builder taking one off. */
  private placed = new Map<string, string>();
  private placeClick = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-place]');
    if (!cell || !this.around?.person?.contains(cell)) return;
    e.preventDefault();
    e.stopPropagation();
    const place = cell.dataset.place!;
    if (cell.dataset.item) this.placed.set(place, cell.dataset.item);
    else this.placed.delete(place);
    this.clickPlace(place, e);
  };

  /** What the game sets round a survivor's own inventory: to its left and right, and among what they wear. */
  private around: InventoryAround | null = null;
  private leftEl = h('div.mcinv-left');
  private rightEl = h('div.mcinv-right');
  private extraEl = h('div.mcinv-extra');
  private aroundSeen = false;
  private wornHome: HTMLElement | null = null;
  /** The four slots for what's worn: in the places the game's marked for them among what it's set there, or back where they're kept. */
  private lendWorn(on: boolean) {
    const into = on ? (this.around?.person ?? null) : null;
    let lent = false;
    WORN.forEach((part, i) => {
      const at = into?.querySelector(`[data-worn="${part}"]`);
      if (at) {
        at.replaceChildren(this.wornCells[i]);
        lent = true;
      } else this.wornHome?.append(this.wornCells[i]);
    });
    this.root.classList.toggle('own-worn', lent);
  }
  private seeAround() {
    const seen = !!this.around && this.visible && !!this.stacks && (this.tab.id === 'inventory' || this.ownPage);
    // (The four slots for what's worn are lent only on the tab of what they carry.)
    this.lendWorn(seen && this.tab.id === 'inventory');
    if (seen === this.aroundSeen) return;
    this.aroundSeen = seen;
    this.around?.onShown?.(seen);
  }
  setAround(around: InventoryAround | null) {
    this.around?.person?.removeEventListener('mousedown', this.placeClick);
    around?.person?.addEventListener('mousedown', this.placeClick);
    if (this.aroundSeen) this.around?.onShown?.(false);
    this.lendWorn(false);
    this.aroundSeen = false;
    this.around = around;
    this.root.classList.toggle('has-around', !!around);
    this.leftEl.replaceChildren(...(around?.left ? [around.left] : []));
    this.rightEl.replaceChildren(...(around?.right ? [around.right] : []));
    this.extraEl.replaceChildren(...(around?.person ? [around.person] : []));
    this.seeAround();
  }

  /** A page of the game's own (its pets): its tab, beside the one for what they carry, and its slots in the list's place. */
  private page: InventoryPage | null = null;
  private pageTab: Tab | null = null;
  private pageEl: HTMLElement | null = null;
  private bottomTabs: HTMLElement | null = null;
  private sideEl: HTMLElement | null = null;
  private headEl = h('div.mcinv-head');
  /** A survivor's page with a head of the game's: laid out as their own inventory is. */
  private get ownPage(): boolean {
    return this.onPage && !!this.stacks && !!this.page?.head;
  }
  /** How many rows of the list show: five; three, where a page is laid out as their own inventory. */
  private get rowsShown(): number {
    return this.ownPage ? 3 : ROWS;
  }
  private layPage() {
    this.root.classList.toggle('is-page-own', this.ownPage);
  }
  /** Whether the page's been told it's in view. */
  private pageSeen = false;
  private seePage() {
    const seen = this.onPage && this.visible;
    if (seen === this.pageSeen) return;
    this.pageSeen = seen;
    this.page?.onShown?.(seen);
  }
  private get onPage(): boolean {
    return !!this.pageTab && this.tab === this.pageTab;
  }
  setPage(page: InventoryPage | null) {
    const was = this.onPage;
    this.page = page;
    this.root.classList.toggle('has-pages', !!page);
    this.root.classList.toggle('has-side', !!page?.side);
    // (Its own panel, beside the inventory: there while its page is open.)
    if (this.sideEl && this.sideEl.firstChild !== (page?.side ?? null)) this.sideEl.replaceChildren(...(page?.side ? [page.side] : []));
    if (this.headEl.firstChild !== (page?.head ?? null)) this.headEl.replaceChildren(...(page?.head ? [page.head] : []));
    this.layPage();
    this.seeAround();
    if (!page) {
      this.pageEl?.remove();
      this.tabs.delete(this.pageTab?.id ?? '');
      [this.pageEl, this.pageTab] = [null, null];
      if (was) this.open(TABS.find((t) => t.id === 'inventory')!, false);
      this.pageSeen = false;
      return;
    }
    if (!this.pageTab || this.pageTab.id !== `page:${page.id}`) {
      this.pageEl?.remove();
      const tab: Tab = { id: `page:${page.id}`, title: page.title, icon: [], image: page.image, rank: NONE, bottom: true };
      const tip = (e: MouseEvent) => this.hint(tab.title, e);
      // (Its picture's a photograph of a thing, not a sprite: smoothed, as the slots' pictures are.)
      const el = h('button.mcinv-tab.is-own', { onclick: () => this.open(tab), onmouseenter: tip, onmousemove: tip, onmouseleave: () => this.hint(null) }, h('img', { src: page.image, alt: '', draggable: false }));
      this.bottomTabs?.append(el);
      this.tabs.set(tab.id, el);
      [this.pageTab, this.pageEl] = [tab, el];
      if (was) this.tab = tab;
    }
    // (Its name may have changed: how many there are.)
    this.pageTab.title = page.title;
    if (this.onPage) {
      this.title.textContent = page.title;
      this.fill();
    }
  }

  readonly root: HTMLElement;
  private panel: HTMLElement;
  private title: HTMLElement;
  private search: HTMLInputElement;
  private cells: HTMLElement[] = [];
  private bar: HTMLElement[] = [];
  /** Their own inventory's cells: the twenty-seven behind the hotbar (slots 9 to 35). */
  private own: HTMLElement[] = [];
  private knob: HTMLElement;
  private track: HTMLElement;
  private tip: HTMLElement;
  private ghost: HTMLImageElement;
  private tabs = new Map<string, HTMLElement>();
  private tab = TABS[0];
  private list: number[] = [];
  private scroll = 0;
  /** What they carry: the hotbar's nine slots, then their inventory's twenty-seven. */
  private hotbar: number[] = Array(36).fill(0);
  private selected = 0;
  private carried: Carried | null = null;
  /** The screen shut with something still in hand: it's thrown down (a survivor's stack by its slot; a builder's block or item by its name). */
  onToss: ((what: { slot?: number; block?: string; item?: string }) => void) | null = null;
  /** Survival: the stacks they carry (thirty-six slots, the hotbar's first), in place of the blocks a builder chooses from; null while building. */
  private stacks: (ShownStack | null)[] | null = null;
  /** Survival: a stack moved from one slot to another (an open container's from 100; `to` -1 a quick move; `count` one, a right-click's). */
  onMove: ((from: number, to: number, count?: number) => void) | null = null;
  /** A container open beside what they carry (`setContainer`): its kind, its stacks, which are taken from only, and its figures. */
  private box: { kind: string; title: string; slots: (ShownStack | null)[]; output: number[]; progress: Record<string, number> } | null = null;
  private boxEl = h('div.mcinv-container');
  private boxCells: HTMLElement[] = [];
  private boxShape = '';
  private boxBars: Record<string, HTMLElement> = {};
  /** The player's own figure for their inventory (its model and the skin sheet it's cut from), asked for while it's on show; null: none to show. */
  doll: (() => { spec: ModelSpec; atlas: { name: string; width: number; height: number; pixels: Uint8Array }; wear?: readonly DollWear[] } | null) | null = null;
  private dollView = new McDoll();
  private dollFrame = 0;
  private dollAt = 0;
  /** Sparks off what's picked up and set down (the inventory particles switch says whether). */
  sparks: (() => boolean) | null = null;
  private pointer = { x: 0, y: 0 };
  /** What's under the pointer: a block of the list, or a hotbar slot. */
  private over: { block: number; slot?: number } | null = null;
  private keys = (e: KeyboardEvent) => this.key(e);
  private size = () => this.fit();

  constructor(
    parent: HTMLElement,
    private registry: Registry,
    private icons: Map<number, string>,
    private onClose: () => void,
    private pick: (id: number, slot?: number, fromSlot?: number) => void,
  ) {
    const placeable = registry.blocks.filter((b) => b.placeable);
    const byName = new Map(placeable.map((b) => [b.name, b.id]));
    const tabs = (bottom: boolean) =>
      h('div.mcinv-tabs', { class: bottom ? 'mcinv-tabs is-bottom' : 'mcinv-tabs' }, ...TABS.filter((t) => !!t.bottom === bottom).map((t) => {
        const icon = t.icon.map((n) => byName.get(n)).find((id) => id !== undefined);
        const el = h('button.mcinv-tab', { class: `mcinv-tab${t.right ? ' is-right' : ''}${t.id === 'inventory' ? ' is-own' : ''}`, onclick: () => this.open(t), onmouseenter: (e: MouseEvent) => this.hint(t.title, e), onmousemove: (e: MouseEvent) => this.hint(t.title, e), onmouseleave: () => this.hint(null) },
          icon !== undefined ? h('img', { src: icons.get(icon) ?? '', alt: '', draggable: false }) : h('img.is-item', { src: t.image ?? MAGNIFIER, alt: '', draggable: false }));
        this.tabs.set(t.id, el);
        return el;
      }));

    this.title = h('div.mcinv-title');
    this.search = h('input.mcinv-search', { type: 'text', spellcheck: false, maxLength: 50, oninput: () => this.fill(), onkeydown: (e: KeyboardEvent) => e.stopPropagation() }) as HTMLInputElement;
    const grid = h('div.mcinv-grid', { onwheel: (e: WheelEvent) => { e.preventDefault(); this.scrollBy(Math.sign(e.deltaY)); } });
    for (let i = 0; i < COLUMNS * ROWS; i++) {
      const cell = h('div.mcinv-slot', {
        onmouseenter: (e: MouseEvent) => this.hover(i, e),
        onmousemove: (e: MouseEvent) => this.hover(i, e),
        onmouseleave: () => this.leave(),
        onmousedown: (e: MouseEvent) => { e.preventDefault(); this.clickList(i, e); },
      }, h('img', { alt: '', draggable: false }));
      this.cells.push(cell);
      grid.append(cell);
    }
    this.knob = h('div.mcinv-knob');
    this.track = h('div.mcinv-track', { onmousedown: (e: MouseEvent) => this.dragScroll(e) }, this.knob);
    const bar = h('div.mcinv-hotbar');
    for (let i = 0; i < 9; i++) {
      const cell = h('div.mcinv-slot', {
        onmouseenter: (e: MouseEvent) => this.hoverBar(i, e),
        onmousemove: (e: MouseEvent) => this.hoverBar(i, e),
        onmouseleave: () => this.leave(),
        onmousedown: (e: MouseEvent) => { e.preventDefault(); this.clickBar(i, e); },
      }, h('img', { alt: '', draggable: false }));
      this.bar.push(cell);
      bar.append(cell);
    }
    // Their own inventory (the chest tab), laid out as Minecraft's: what's worn down the left, the
    // player beside it, the twenty-seven slots, the hotbar under them, and a slot that destroys
    // what's dropped on it (shift-click: everything they carry).
    const mine = h('div.mcinv-own');
    for (let i = 9; i < 36; i++) {
      const cell = h('div.mcinv-slot', {
        onmouseenter: (e: MouseEvent) => this.hoverBar(i, e),
        onmousemove: (e: MouseEvent) => this.hoverBar(i, e),
        onmouseleave: () => this.leave(),
        onmousedown: (e: MouseEvent) => { e.preventDefault(); this.clickBar(i, e); },
      }, h('img', { alt: '', draggable: false }));
      this.own.push(cell);
      mine.append(cell);
    }
    const worn = h('div.mcinv-worn', {}, ...WORN.map((part, slot) => {
      // (Lent to what the game's set among what they wear, nothing's told of it: that's the game's to say, or not.)
      const tip = (e: MouseEvent) => this.hint(this.carried || this.root.classList.contains('own-worn') ? null : this.worn[slot] ? this.labelOf(this.worn[slot]) : null, e, this.worn[slot] ? this.colorOf(this.worn[slot]) : undefined, this.worn[slot] ? this.linesOf(this.worn[slot]) : undefined);
      const cell = h(`div.mcinv-slot.is-worn.is-${part}`, { onmouseenter: tip, onmousemove: tip, onmouseleave: () => this.hint(null), onmousedown: (e: MouseEvent) => { e.preventDefault(); this.clickWorn(slot, e); } }, h('img', { alt: '', draggable: false }));
      this.wornCells.push(cell);
      return cell;
    }));
    const bin = h('div.mcinv-slot.mcinv-bin', {
      onmouseenter: (e: MouseEvent) => this.hint(this.carried ? null : 'Destroy Item', e),
      onmousemove: (e: MouseEvent) => this.hint(this.carried ? null : 'Destroy Item', e),
      onmouseleave: () => this.hint(null),
      onmousedown: (e: MouseEvent) => {
        e.preventDefault();
        if (this.carried) return this.drop();
        if (e.shiftKey) for (let i = 0; i < 36; i++) if (this.hotbar[i]) this.pick(0, i);
      },
    });
    this.wornHome = worn;
    const person = h('div.mcinv-person', {}, worn, h('div.mcinv-doll', {}, this.dollView.canvas), h('div.mcinv-slot.is-worn.is-shield'), bin, this.extraEl);
    this.panel = h('div.mcinv-panel', {}, this.title, this.search, grid, this.track, person, mine, bar, this.headEl, this.boxEl);
    this.tip = h('div.mcinv-tip');
    this.ghost = h('img.mcinv-ghost', { alt: '', draggable: false }) as HTMLImageElement;
    this.root = h('div.screen.mcinv.hidden', {
      onmousedown: (e: MouseEvent) => {
        if (e.target !== this.root) return;
        // Outside the panel: what's carried is thrown (a survivor's: Minecraft's way) or let go; with nothing in hand, the inventory closes.
        if (this.carried && this.stacks && this.carried.fromSlot !== undefined) {
          this.onToss?.({ slot: this.carried.fromSlot });
          this.carry(null);
        } else if (this.carried) this.drop();
        else this.onClose();
      },
      onmousemove: (e: MouseEvent) => {
        this.pointer = { x: e.clientX, y: e.clientY };
        this.dollView.look(e.clientX, e.clientY);
        this.follow(e);
      },
      oncontextmenu: (e: Event) => e.preventDefault(),
    }, this.rightEl, this.leftEl, h('div.mcinv-frame', {}, tabs(false), this.panel, (this.bottomTabs = tabs(true)), (this.sideEl = h('div.mcinv-side'))), this.ghost, this.tip);
    parent.append(this.root);
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_TAB);
    } catch {
      // (No storage: the first tab.)
    }
    this.open(TABS.find((t) => t.id === last) ?? TABS[0]);
  }

  /**
   * Survival's inventory: the stacks they carry (null: building again, with every block to choose
   * from). Only their own inventory shows, Minecraft's, and a click picks a stack up or sets it down.
   */
  setStacks(stacks: (ShownStack | null)[] | null, selected = 0) {
    const was = !!this.stacks;
    this.stacks = stacks;
    this.root.classList.toggle('is-survival', !!stacks);
    this.layPage();
    this.seeAround();
    if (stacks) {
      this.selected = selected;
      if (this.tab.id !== 'inventory' && !this.onPage) this.open(TABS.find((t) => t.id === 'inventory')!, false);
      // (A stack picked up is in the hand, not in its slot, until it's set down.)
      const held = this.carried?.fromSlot;
      this.bar.forEach((cell, i) => {
        this.showStack(cell, i === held ? null : (stacks[i] ?? null));
        cell.classList.toggle('is-selected', i === selected);
      });
      this.own.forEach((cell, i) => this.showStack(cell, 9 + i === held ? null : (stacks[9 + i] ?? null)));
    } else if (was) {
      for (const cell of [...this.bar, ...this.own]) cell.querySelector('.mcinv-count')?.remove();
      this.setHotbar(this.hotbar, this.selected);
    }
  }

  private showStack(cell: HTMLElement, stack: ShownStack | null) {
    const img = cell.querySelector('img')!;
    if (stack?.icon) {
      if (img.getAttribute('src') !== stack.icon) img.src = stack.icon;
    } else img.removeAttribute('src');
    img.style.visibility = stack?.icon ? '' : 'hidden';
    let count = cell.querySelector<HTMLElement>('.mcinv-count');
    if (stack && stack.count > 1) {
      if (!count) cell.append((count = h('span.mcinv-count')));
      count.textContent = String(stack.count);
    } else count?.remove();
    let wear = cell.querySelector<HTMLElement>('.mcinv-wear');
    if (stack?.left !== undefined && stack.left < 1) {
      if (!wear) cell.append((wear = h('span.mcinv-wear', {}, h('span'))));
      const bar = wear.firstElementChild as HTMLElement;
      bar.style.width = `${Math.max(0, Math.round(stack.left * 100))}%`;
      bar.style.background = `hsl(${Math.round(stack.left * 120)}, 100%, 45%)`;
    } else wear?.remove();
  }

  setHotbar(ids: number[], selected: number) {
    if (this.stacks) return;
    this.hotbar = Array.from({ length: 36 }, (_, i) => ids[i] ?? 0);
    this.selected = selected;
    this.bar.forEach((cell, i) => {
      this.show1(cell, this.hotbar[i] ?? 0);
      cell.classList.toggle('is-selected', i === selected);
    });
    this.own.forEach((cell, i) => this.show1(cell, this.hotbar[9 + i] ?? 0));
  }

  /** Their figure in their inventory: drawn each frame it's on show, looking at the pointer. */
  private animate = (now: number) => {
    this.dollFrame = this.visible ? requestAnimationFrame(this.animate) : 0;
    const dt = Math.min(0.1, (now - (this.dollAt || now)) / 1000);
    this.dollAt = now;
    if (this.tab.id !== 'inventory') return;
    const d = this.doll?.();
    if (d) this.dollView.set(d.spec, d.atlas, d.wear);
    this.root.classList.toggle('has-doll', !!d);
    this.dollView.draw(dt);
  };

  /** A burst of little squares in a block's colours, where the pointer is: something picked up, set down, or sent to the hotbar. */
  private spark(src: string | undefined, at = this.pointer) {
    if (!src || !this.sparks?.()) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0, 8, 8);
      const px = g.getImageData(0, 0, 8, 8).data;
      const colours: string[] = [];
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) colours.push(`rgb(${px[i]}, ${px[i + 1]}, ${px[i + 2]})`);
      if (!colours.length) return;
      for (let n = 0; n < 12; n++) {
        const dot = h('span.mcinv-spark');
        dot.style.background = colours[Math.floor(Math.random() * colours.length)];
        dot.style.left = `${at.x}px`;
        dot.style.top = `${at.y}px`;
        this.root.append(dot);
        const a = Math.random() * Math.PI * 2;
        const far = 14 + Math.random() * 26;
        const [dx, dy] = [Math.cos(a) * far, Math.sin(a) * far - 10];
        // (Out, and falling as it goes.)
        dot.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(0.9)`, opacity: 1, offset: 0.5 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 22}px)) scale(0.3)`, opacity: 0 }], { duration: 420 + Math.random() * 220, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' }).onfinish = () => dot.remove();
      }
    };
    img.src = src;
  }

  show() {
    this.carry(null);
    this.fit();
    this.root.classList.remove('hidden');
    this.seePage();
    this.seeAround();
    this.dollAt = 0;
    if (!this.dollFrame) this.dollFrame = requestAnimationFrame(this.animate);
    window.addEventListener('keydown', this.keys, true);
    window.addEventListener('resize', this.size);
  }

  hide() {
    // (Shut with something in hand: down it goes, in front of them.)
    const c = this.carried;
    // (A survivor's stack in hand never left its slot: nothing's thrown as the screen shuts.)
    if (c && this.visible && !this.stacks) {
      const item = this.items.get(c.block)?.item;
      this.onToss?.(this.stacks && c.fromSlot !== undefined ? { slot: c.fromSlot } : item ? { item } : { block: this.registry.blocks[c.block]?.name });
    }
    this.carry(null);
    this.hint(null);
    this.root.classList.add('hidden');
    this.seePage();
    this.seeAround();
    window.removeEventListener('keydown', this.keys, true);
    window.removeEventListener('resize', this.size);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** Minecraft's automatic GUI scale: the largest whole one at which a 320 x 240 screen still fits. */
  private fit() {
    const scale = Math.max(1, Math.min(Math.floor(window.innerWidth / 320), Math.floor(window.innerHeight / 240)));
    this.root.style.setProperty('--g', `${scale}px`);
  }

  private open(tab: Tab, remember = true) {
    // (In survival there's only their own inventory, and the game's own page if it has one.)
    if (this.stacks && tab.id !== 'inventory' && tab !== this.pageTab) return;
    this.tab = tab;
    for (const [id, el] of this.tabs) el.classList.toggle('is-open', id === tab.id);
    this.title.textContent = tab.title;
    this.root.classList.toggle('is-search', tab.id === 'search');
    this.root.classList.toggle('is-inventory', tab.id === 'inventory');
    this.root.classList.toggle('is-page', tab === this.pageTab);
    this.layPage();
    this.seePage();
    this.seeAround();
    try {
      if (remember) window.localStorage.setItem(LAST_TAB, tab.id);
    } catch {
      // (No storage: forgotten when the page goes.)
    }
    this.search.value = '';
    this.scroll = 0;
    this.fill();
    // (Typing goes to the search only when the inventory's on show: the tab's remembered while it's shut.)
    if (tab.id === 'search' && this.visible) this.search.focus();
    else this.search.blur();
  }

  /** The tab's blocks (the search's: those whose name has what's typed), from the scrolled row on. */
  private fill() {
    if (this.onPage && this.page) {
      // (The game's own page: its slots in the list's place, the one in use bordered.)
      const cells = this.page.cells;
      this.list = [];
      const rows = this.rows();
      const most = this.rowsShown * COLUMNS;
      this.scroll = Math.max(0, Math.min(rows, this.scroll));
      this.cells.forEach((cell, i) => {
        cell.style.display = i < most ? '' : 'none';
        const c = cells[this.scroll * COLUMNS + i];
        const img = cell.querySelector('img')!;
        if (c?.icon) {
          if (img.getAttribute('src') !== c.icon) img.src = c.icon;
        } else img.removeAttribute('src');
        img.style.visibility = c?.icon ? '' : 'hidden';
        cell.classList.toggle('is-chosen', !!c?.chosen);
      });
      this.track.classList.toggle('is-idle', rows === 0);
      this.knob.style.top = rows ? `calc(${(this.scroll / rows) * ((this.ownPage ? 54 : 110) - 15)} * var(--g))` : '0';
      return;
    }
    for (const cell of this.cells) {
      cell.classList.remove('is-chosen');
      cell.style.display = '';
    }
    const q = this.tab.id === 'search' ? this.search.value.trim().toLowerCase() : '';
    // (In Minecraft's order within the tab; the search, in the order the game has them.)
    this.list = this.registry.blocks
      .filter((b) => b.placeable && this.tab.rank(b.name) >= 0 && (!q || b.label.toLowerCase().includes(q) || b.name.includes(q.replace(/ /g, '_'))))
      .map((b, i) => ({ id: b.id, at: this.tab.rank(b.name) * 100000 + i }))
      .sort((x, y) => x.at - y.at)
      .map((b) => b.id);
    // The game's items, in their tabs (and the search), after the blocks, in their own order.
    for (const it of this.items.values()) if (this.tab.id === 'search' ? !q || it.label.toLowerCase().includes(q) || it.item.includes(q.replace(/ /g, '_')) : it.tab === this.tab.id) this.list.push(it.id);
    this.scroll = Math.max(0, Math.min(this.rows(), this.scroll));
    this.cells.forEach((cell, i) => this.show1(cell, this.list[this.scroll * COLUMNS + i] ?? 0));
    const rows = this.rows();
    this.track.classList.toggle('is-idle', rows === 0);
    this.knob.style.top = rows ? `calc(${(this.scroll / rows) * (110 - 15)} * var(--g))` : '0';
  }

  /** Rows there are to scroll past. */
  private rows(): number {
    return Math.max(0, Math.ceil((this.onPage && this.page ? this.page.cells.length : this.list.length) / COLUMNS) - this.rowsShown);
  }

  private scrollBy(rows: number) {
    this.scroll = Math.max(0, Math.min(this.rows(), this.scroll + rows));
    this.fill();
  }

  private dragScroll(e: MouseEvent) {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const r = this.track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (ev.clientY - r.top - r.height * 0.07) / (r.height * 0.86)));
      this.scroll = Math.round(t * this.rows());
      this.fill();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    move(e);
  }

  private show1(cell: HTMLElement, id: number) {
    const img = cell.querySelector('img')!;
    const src = id ? (this.icons.get(id) ?? '') : '';
    if (src) {
      if (img.getAttribute('src') !== src) img.src = src;
    } else img.removeAttribute('src');
    img.style.visibility = src ? '' : 'hidden';
  }

  private hover(i: number, e: MouseEvent) {
    if (this.onPage) {
      this.over = null;
      this.page?.onHover?.(this.page.cells[this.scroll * COLUMNS + i]?.id ?? null);
      const c = this.page?.cells[this.scroll * COLUMNS + i];
      return this.hint(this.carried ? null : (c?.tip ?? null), e, c?.tipColor);
    }
    const block = this.list[this.scroll * COLUMNS + i] ?? 0;
    this.over = block ? { block } : null;
    this.hint(block && !this.carried ? this.labelOf(block) : null, e, block ? this.colorOf(block) : undefined, block ? this.linesOf(block) : undefined);
  }

  private hoverBar(i: number, e: MouseEvent) {
    if (this.stacks) {
      this.over = { block: 0, slot: i };
      const s = this.stacks[i];
      return this.hint(this.carried ? null : (s?.label ?? null), e, s?.color, s?.tooltip);
    }
    const block = this.hotbar[i] ?? 0;
    this.over = { block, slot: i };
    this.hint(block && !this.carried ? this.labelOf(block) : null, e, block ? this.colorOf(block) : undefined, block ? this.linesOf(block) : undefined);
  }

  private leave() {
    if (this.onPage) this.page?.onHover?.(null);
    this.over = null;
    this.hint(null);
  }

  /** Among the blocks: with a hand full, it's let go (they never run out); else that block's picked up (shift: straight to the hotbar). */
  private clickList(i: number, e: MouseEvent) {
    if (this.onPage) {
      if (this.carried) return this.drop();
      const c = this.page?.cells[this.scroll * COLUMNS + i];
      if (c && e.button === 0) this.page!.onPick(c.id);
      return;
    }
    const block = this.list[this.scroll * COLUMNS + i] ?? 0;
    if (this.carried) return this.drop();
    if (!block) return;
    const wear = this.items.get(block)?.wear;
    // (Shift-click or right-click on armour: put straight on, as Minecraft's is.)
    if ((e.shiftKey || e.button === 2) && wear) return void this.onWear?.(WORN.indexOf(wear), this.items.get(block)!.item);
    if (e.shiftKey) return this.toHotbar(block);
    this.carry({ block });
    this.follow(e);
  }

  /** A slot of theirs: what's carried goes in (what was there comes to hand); empty-handed, its block is picked up (shift: sent across, hotbar to pack or back). */
  private clickBar(i: number, e: MouseEvent) {
    if (this.stacks) return this.clickSlot(i, e);
    const there = this.hotbar[i] ?? 0;
    if (this.carried) {
      const { block, fromSlot } = this.carried;
      // (Swapped with where it came from, if it came from the hotbar and that's still empty.)
      this.pick(block, i, fromSlot !== undefined && fromSlot !== i && this.hotbar[fromSlot] === block ? fromSlot : undefined);
      this.carry(there && fromSlot === undefined ? { block: there } : null);
      this.follow(e);
      return;
    }
    if (!there) return;
    // Armour they carry, right-clicked (or shift-clicked): on it goes, and what was worn there takes its slot.
    const wear = this.items.get(there)?.wear;
    if (wear && (e.button === 2 || e.shiftKey)) {
      const slot = WORN.indexOf(wear);
      const was = this.worn[slot];
      this.onWear?.(slot, this.items.get(there)!.item);
      return this.pick(was === there ? there : was, i);
    }
    if (e.shiftKey) {
      // (Shift: straight across, hotbar to the slots behind it or back, into the first that's free; none free, nothing.)
      const to = this.across(i, (k) => !this.hotbar[k]);
      if (to >= 0) this.pick(there, to, i);
      return;
    }
    this.pick(0, i);
    this.carry({ block: there });
    this.follow(e);
  }

  /** A survivor's stack in a slot of theirs (under 100) or of the open container (from 100). */
  private stackAt(id: number): ShownStack | null {
    return id >= 100 ? (this.box?.slots[id - 100] ?? null) : (this.stacks?.[id] ?? null);
  }

  /**
   * A survivor's click on a slot, theirs or the container's: with a stack in hand, it goes here (a right-click puts one
   * down and keeps the rest in hand); empty-handed, this one's picked up, or (shift) sent across. The game moves it (`onMove`).
   */
  private clickSlot(id: number, e: MouseEvent) {
    const here = this.stackAt(id);
    if (this.carried) {
      const from = this.carried.fromSlot;
      if (from !== undefined && from !== id) this.onMove?.(from, id, e.button === 2 ? 1 : undefined);
      if (e.button !== 2 || from === id) this.carry(null);
    } else if (here && e.shiftKey) this.onMove?.(id, -1);
    else if (here) {
      this.carry({ block: 0, fromSlot: id, icon: here.icon });
      this.follow(e);
    }
    if (this.stacks) this.setStacks(this.stacks, this.selected);
  }

  /**
   * The container open beside what they carry (a crafting grid, a furnace), or none: drawn in their inventory, Minecraft's way
   * (a 2×2 grid beside their figure; a crafting table's 3×3 or a furnace in a taller screen, their figure put away).
   */
  setContainer(box: { kind: string; title: string; slots: (ShownStack | null)[]; output: number[]; progress: Record<string, number> } | null) {
    this.box = box;
    const shape = box ? `${box.kind}:${box.slots.length}` : '';
    this.root.classList.toggle('has-container', !!box);
    this.root.classList.toggle('is-tall', !!box && !(box.kind === 'crafting' && box.slots.length <= 9));
    // (The 2×2 grid with the four armour slots beside it: survival's own inventory.)
    this.root.classList.toggle('has-armour', !!box && box.kind === 'crafting' && box.slots.length === 9);
    if (shape !== this.boxShape) {
      this.boxShape = shape;
      this.boxCells = [];
      this.boxBars = {};
      this.boxEl.replaceChildren();
      this.boxEl.className = box ? `mcinv-container is-${box.kind} has-${box.slots.length}` : 'mcinv-container';
      if (box) {
        this.boxEl.append(h('div.mcinv-container-title', {}, box.title));
        box.slots.forEach((_, i) => {
          const id = 100 + i;
          const tip = (e: MouseEvent) => {
            this.over = { block: 0, slot: id };
            const s = this.stackAt(id);
            this.hint(this.carried ? null : (s?.label ?? null), e);
          };
          const out = box.output.includes(i);
          const cell = h(`div.mcinv-slot.is-box.at-${i}${out ? '.is-output' : ''}`, {
            onmouseenter: tip,
            onmousemove: tip,
            onmouseleave: () => this.leave(),
            onmousedown: (e: MouseEvent) => {
              e.preventDefault();
              this.clickSlot(id, e);
            },
          }, h('img', { alt: '', draggable: false }));
          this.boxCells.push(cell);
          this.boxEl.append(cell);
        });
        // (Its arrow, and a furnace's flame: filled as far as its figures say.)
        const arrow = h('div.mcinv-arrow', {}, h('span'));
        this.boxEl.append(arrow);
        this.boxBars.cook = arrow.firstElementChild as HTMLElement;
        if (box.kind === 'furnace') {
          const flame = h('div.mcinv-flame', {}, h('span'));
          this.boxEl.append(flame);
          this.boxBars.burn = flame.firstElementChild as HTMLElement;
        }
      }
    }
    if (!box) return;
    // (A stack picked up is in the hand, not in its slot, until it's set down.)
    const held = this.carried?.fromSlot;
    this.boxCells.forEach((cell, i) => this.showStack(cell, 100 + i === held ? null : (box.slots[i] ?? null)));
    if (this.boxBars.cook) this.boxBars.cook.style.width = `${Math.round((box.progress.cook ?? 0) * 100)}%`;
    if (this.boxBars.burn) this.boxBars.burn.style.height = `${Math.round((box.progress.burn ?? 0) * 100)}%`;
  }

  /** The first free slot on the other side from slot `i`: behind the hotbar for one of the hotbar's nine, in the hotbar for one behind it. -1: none. */
  private across(i: number, free: (slot: number) => boolean): number {
    const [from, to] = i < 9 ? [9, 36] : [0, 9];
    for (let k = from; k < to; k++) if (free(k)) return k;
    return -1;
  }

  /** Into the first empty hotbar slot (the selected one, if they're all full). */
  private toHotbar(block: number) {
    // (The hotbar first, then the slots behind it.)
    const empty = this.hotbar.findIndex((id) => !id);
    this.pick(block, empty >= 0 ? empty : this.selected);
    this.spark(this.icons.get(block));
  }

  private drop() {
    this.carry(null);
    // (A survivor's stack let go is back in its slot: shown there again.)
    if (this.stacks) this.setStacks(this.stacks, this.selected);
  }

  private carry(c: Carried | null) {
    this.carried = c;
    // (Sparks as it's taken up, and as what was carried is set down.)
    const was = this.carried ? (this.carried.icon ?? this.icons.get(this.carried.block)) : undefined;
    const src = c ? (c.icon ?? this.icons.get(c.block) ?? '') : '';
    this.spark(src || was);
    if (src) this.ghost.src = src;
    this.ghost.style.display = src ? 'block' : 'none';
    this.root.classList.toggle('is-carrying', !!c);
    if (c) this.hint(null);
  }

  private follow(e: MouseEvent) {
    if (!this.carried) return;
    this.ghost.style.left = `${e.clientX}px`;
    this.ghost.style.top = `${e.clientY}px`;
  }

  /** The name of what's under the pointer, beside it (Minecraft's tooltip). */
  private hint(text: string | null, e?: MouseEvent, color?: string, lines?: TooltipLine[]) {
    this.tip.style.color = color ?? '';
    if (!text || !e) {
      this.tip.style.display = 'none';
      return;
    }
    // (Its name, and under it what's told of it: a line each, a small picture before those that have one.)
    const key = `${text}|${lines?.length ?? 0}`;
    if (this.tip.dataset.key !== key) {
      this.tip.dataset.key = key;
      if (!lines?.length) this.tip.textContent = text;
      else {
        this.tip.replaceChildren(
          h('div.mcinv-tip-name', {}, text),
          ...lines.map((l) => {
            const row = h(`div.mcinv-tip-line${l.italic ? '.is-lore' : ''}${l.text ? '' : '.is-gap'}`, {});
            if (l.color) row.style.color = l.color;
            if (l.icon) row.append(h('img', { src: l.icon, alt: '', draggable: false }));
            row.append(l.text);
            return row;
          }),
        );
      }
    }
    this.tip.style.display = 'block';
    const w = this.tip.offsetWidth;
    const hgt = this.tip.offsetHeight;
    const x = e.clientX + 12 + w > window.innerWidth ? e.clientX - 12 - w : e.clientX + 12;
    this.tip.style.left = `${Math.max(2, x)}px`;
    this.tip.style.top = `${Math.max(2, Math.min(window.innerHeight - hgt - 2, e.clientY - 12))}px`;
  }

  /** 1 to 9 puts what's under the pointer in that hotbar slot (from a hotbar slot: swapped). The rest of the keys are the search's, on its tab. */
  private key(e: KeyboardEvent) {
    if (!this.visible) return;
    const n = /^Digit([1-9])$/.exec(e.code);
    if (n && document.activeElement !== this.search && this.over) {
      e.preventDefault();
      e.stopPropagation();
      const slot = Number(n[1]) - 1;
      if (this.over.slot === undefined) this.pick(this.over.block, slot);
      else if (this.over.slot !== slot && this.over.block) this.pick(this.over.block, slot, this.over.slot);
      return;
    }
    if (document.activeElement === this.search && e.code !== 'Escape') e.stopPropagation();
  }
}
