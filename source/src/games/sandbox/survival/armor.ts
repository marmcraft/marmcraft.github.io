import type { GameContext, ItemStack, Player } from '@platform';
import { wearArmour } from '../addons/skins';
import { ARMOUR_PIECES } from './art.shared';

/**
 * Armour, Minecraft's (Mineclonia's numbers, https://minecraft.wiki/w/Armor): leather, gold, iron and diamond, a
 * helmet, chestplate, leggings and boots of each. What a survivor wears is in the inventory's four slots beside
 * their figure; its points (0 to 20) each take 4% off a hit; each hit wears every piece a little (a quarter of the
 * hit, at least one), and a piece worn out breaks. Worn armour shows on their figure, and is kept with what they
 * carry.
 */

export type Piece = (typeof ARMOUR_PIECES)[number];

/** Each material's points per piece (helmet, chestplate, leggings, boots) and how many hits it lasts per piece. */
export const ARMOUR: Record<string, { label: string; points: [number, number, number, number]; uses: [number, number, number, number]; of: string }> = {
  leather: { label: 'Leather', points: [1, 3, 2, 1], uses: [55, 80, 75, 65], of: 'leather' },
  golden: { label: 'Golden', points: [2, 5, 3, 1], uses: [77, 112, 105, 91], of: 'gold_ingot' },
  iron: { label: 'Iron', points: [2, 6, 5, 2], uses: [165, 240, 225, 195], of: 'iron_ingot' },
  diamond: { label: 'Diamond', points: [3, 8, 6, 3], uses: [363, 528, 495, 429], of: 'diamond' },
};
const LABEL: Record<Piece, string> = { helmet: 'Cap', chestplate: 'Tunic', leggings: 'Pants', boots: 'Boots' };
const NAME: Record<Piece, string> = { helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };

/** Each piece's recipe (M the material), Minecraft's. */
export const ARMOUR_SHAPES: Record<Piece, string[]> = {
  helmet: ['MMM', 'M.M'],
  chestplate: ['M.M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M.M', 'M.M'],
  boots: ['M.M', 'M.M'],
};

/** What an item is as armour: its material and piece (null: not armour). */
export function armourOf(item: string | null | undefined): { material: string; piece: Piece; slot: number } | null {
  if (!item) return null;
  const k = item.indexOf('_');
  const material = item.slice(0, k);
  const piece = item.slice(k + 1) as Piece;
  const slot = ARMOUR_PIECES.indexOf(piece);
  return ARMOUR[material] && slot >= 0 ? { material, piece, slot } : null;
}

/** A piece's uses before it breaks. */
export const armourUses = (item: string) => {
  const a = armourOf(item);
  return a ? ARMOUR[a.material].uses[a.slot] : undefined;
};

/** Define the armour items (in the game's `setup`). */
export function defineArmour(game: GameContext) {
  for (const [material, m] of Object.entries(ARMOUR)) {
    ARMOUR_PIECES.forEach((piece, i) => {
      const id = `${material}_${piece}`;
      // (Leather's are Minecraft's cap, tunic, pants and boots.)
      const name = material === 'leather' ? `Leather ${LABEL[piece]}` : `${m.label} ${NAME[piece]}`;
      if (!game.items.get(id)) game.items.define(id, { kind: 'armour', name, stack: 1, uses: m.uses[i] });
    });
  }
}

const KEPT = 'survival:armour';

export interface Armour {
  /** What a player wears, head to feet (the array itself: the inventory's armour slots write into it). */
  worn(player: Player): (ItemStack | null)[];
  /** What they wear changed (moved in or out in the inventory): their points, their figure, kept. */
  changed(player: Player): void;
  /** Put away (out of survival): nothing worn shows, no points. Back: as it was. */
  show(player: Player, on: boolean): void;
  /** Everything worn, taken off (dropped on death). */
  strip(player: Player): ItemStack[];
}

export function armour(game: GameContext, wears: (p: Player) => boolean, open: (p: Player) => (ItemStack | null)[] | null): Armour {
  const all = new Map<string, (ItemStack | null)[]>();
  const shown = new Map<string, boolean>();

  const worn = (player: Player) => {
    let w = all.get(player.id);
    if (!w) {
      const kept = player.store.get<(ItemStack | null)[]>(KEPT) ?? [];
      w = [0, 1, 2, 3].map((i) => (kept[i] && armourOf(kept[i]!.item)?.slot === i ? kept[i] : null));
      all.set(player.id, w);
    }
    return w;
  };

  const refresh = (player: Player) => {
    const w = worn(player);
    const on = shown.get(player.id) ?? wears(player);
    player.armor = on ? w.reduce((n, s, i) => n + (s ? (ARMOUR[armourOf(s.item)!.material]?.points[i] ?? 0) : 0), 0) : 0;
    wearArmour(game, player, on ? w.map((s) => (s ? armourOf(s.item)!.material : null)) : [null, null, null, null]);
    player.store.set(KEPT, w);
  };

  // Hits from something (a blade, an arrow, a blast) wear what's worn; a fall or the world's harm isn't softened
  // by it (the platform's armour takes its share of everything: undone here for those).
  game.events.on('damage', (e) => {
    const player = e.target as Player;
    if (!('inventory' in player) || e.cancelled || player.bot) return;
    if (e.cause === 'world') {
      if (player.armor > 0) e.amount /= 1 - Math.min(20, player.armor) * 0.04;
      return;
    }
    if (!wears(player) || !['melee', 'projectile', 'explosion'].includes(e.cause)) return;
    const w = worn(player);
    const by = Math.max(1, Math.floor(e.amount / 4));
    let broke = false;
    w.forEach((s, i) => {
      if (!s) return;
      const uses = armourUses(s.item) ?? 1;
      const wear = (s.wear ?? 0) + by;
      if (wear >= uses) {
        w[i] = null;
        broke = true;
        player.hud.toast(`Your ${game.items.get(s.item)?.name ?? 'armour'} broke`);
      } else w[i] = { ...s, wear };
    });
    // (The inventory's armour slots, if it's open, show the same.)
    const slots = open(player);
    if (slots) for (let i = 0; i < 4; i++) slots[5 + i] = w[i];
    if (broke) refresh(player);
    else player.store.set(KEPT, w);
  });
  game.events.on('playerJoin', ({ player }) => !player.bot && refresh(player));
  game.events.on('playerLeave', ({ player }) => (all.delete(player.id), shown.delete(player.id)));

  return {
    worn,
    changed: refresh,
    show(player, on) {
      shown.set(player.id, on);
      refresh(player);
    },
    strip(player) {
      const w = worn(player);
      const out = w.filter((s): s is ItemStack => !!s);
      w.fill(null);
      refresh(player);
      return out;
    },
  };
}
