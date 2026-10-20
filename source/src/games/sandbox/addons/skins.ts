import { Models, type GameContext, type ModelPart, type ModelSpec, type Player } from '@platform';
import { SKINS } from './skins.data';
import { ARMOUR_COLOURS } from '../survival/art.shared';

/**
 * Skins: an add-on that gives everyone a Minecraft-style body, a box figure in a skin, in place of
 * the platform's characters; their first-person hand wears the same skin. The skins are the PNGs
 * in `./skins`, packed by `scripts/build-sandbox-skins.mjs` (drop more in and run it again).
 *
 * Each person gets one of them by who they are (the same one each visit), and can change it:
 * `/skin 12`, `/skin next`, `/skin prev`, `/skin random`. Other add-ons can dress their own people
 * from `models` (the crowd does).
 *
 * To take it out, drop it from `addons/index.ts`: players are their avatars again.
 */
export interface Skins {
  readonly count: number;
  /** A body in each skin. */
  readonly models: readonly ModelSpec[];
  /** Put a player in a skin (by number, wrapping round). */
  wear(player: Player, skin: number): void;
  /** The body in a skin, fitted for what's worn over it (slim arms, parts without their second layer). */
  fitted(skin: number, fit: { slim: boolean; bare: readonly string[] }): ModelSpec;
}

const ATLAS = 'sandbox_skins';
const dressers = new WeakMap<GameContext, (player: Player) => unknown>();
/** Put a player back in their skin (after something else has had their figure). */
export const redress = (game: GameContext, player: Player) => void dressers.get(game)?.(player);
/** How a figure's fitted for what's worn over it: slim arms, and the parts that go without their second layer (in order: the same fit is the same list). */
interface Fit { slim: boolean; bare: string[] }
/** Those whose figure is fitted just now (by id), a game's: something they wear is cut close (`fitBody`). */
const fits = new WeakMap<GameContext, Map<string, Fit>>();
/** Fit a player's figure for what they wear (`armory.ts` says), or give them their own again (no slim arms, nothing bare). It's made over in the same skin. */
export function fitBody(game: GameContext, player: Player, fit: { slim: boolean; bare: readonly string[] }): void {
  const all = fits.get(game);
  if (!all) return;
  const next: Fit = { slim: fit.slim, bare: [...fit.bare].sort() };
  const now = all.get(player.id) ?? { slim: false, bare: [] };
  if (now.slim === next.slim && now.bare.join() === next.bare.join()) return;
  if (next.slim || next.bare.length) all.set(player.id, next);
  else all.delete(player.id);
  redress(game, player);
}
/** The second layer of each part (hats, sleeves, trouser legs), where it is in a skin. */
const OVERLAYS: Record<string, [number, number]> = { head: [32, 0], body: [16, 32], armR: [40, 32], armL: [48, 48], legR: [0, 32], legL: [0, 48] };

const installedSkins = new WeakMap<GameContext, Skins>();
/** A game's skins, where it has them (for another add-on that dresses figures in them). */
export const skinsOf = (game: GameContext): Skins | undefined => installedSkins.get(game);

/** A packed sheet of skins (`scripts/build-sandbox-skins.mjs` makes them): side by side in rows, as runs of one colour. */
export interface SkinSheet { count: number; columns: number; width: number; height: number; runs: string }
/** A figure with slim arms (Minecraft's "Alex" build: three texels across, not four, each arm keeping its inner side where it was). */
const slimmed = (parts: readonly ModelPart[]): ModelPart[] =>
  parts.map((p) => (/^arm[RL]/.test(p.name) ? { ...p, size: [3, p.size[1], p.size[2]] as [number, number, number], offset: [p.name.startsWith('armR') ? p.offset[0] + 1 : p.offset[0], p.offset[1], p.offset[2]] as [number, number, number] } : p));
/**
 * A box figure in each skin of a sheet that isn't the players' own (Grianan's people have theirs): the sheet goes in
 * as an atlas by that name, and `slim` says which of them are slim-armed.
 */
export function figures(game: GameContext, atlas: string, sheet: SkinSheet, slim: readonly number[] = [], glows?: ReadonlyMap<number, readonly (readonly [number, number])[]>): ModelSpec[] {
  const made = unpack(game, atlas, sheet, glows);
  return made.models.map((m, k) => (slim.includes(k) ? { ...m, parts: slimmed(m.parts) } : m));
}

/**
 * A sheet's skins as an atlas, and a figure in each. `glows`: texels of some of them (by their place in the sheet; x, y in the
 * skin) that are alight, as a creature's eyes are (roadfolk, Sean 2026-10-15: a pack's alpha, its eyes lit in its skin).
 */
function unpack(game: GameContext, ATLAS: string, sheet: SkinSheet, glows?: ReadonlyMap<number, readonly (readonly [number, number])[]>, below?: { height: number; paint(pixels: Uint8Array, width: number, y0: number): void }) {
  const { count, columns, width } = sheet;
  // (Room under the skins for what's painted there: armour's.)
  const height = sheet.height + (below?.height ?? 0);

  // The skins, side by side: unpacked from runs of one colour (count, r, g, b, a).
  const runs = Uint8Array.from(atob(sheet.runs), (c) => c.charCodeAt(0));
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, o = 0; i < runs.length; i += 5) {
    for (let n = runs[i]; n > 0; n--, o += 4) pixels.set(runs.subarray(i + 1, i + 5), o);
  }
  const origin = (k: number): [number, number] => [(k % columns) * 64, Math.floor(k / columns) * 64];
  let emissive: Uint8Array | undefined;
  if (glows?.size) {
    emissive = new Uint8Array(width * height);
    for (const [k, texels] of glows) {
      const [ox, oy] = origin(k);
      for (const [x, y] of texels) emissive[(oy + y) * width + ox + x] = 255;
    }
  }
  below?.paint(pixels, width, sheet.height);
  game.items.atlas(ATLAS, { width, height, pixels, ...(emissive && { emissive }) });

  /** A box figure in a skin, laid out the new way: its left arm and leg have places of their own, and each part its second layer. */
  function model(k: number): ModelSpec {
    const [ox, oy] = origin(k);
    // (Whole arms and legs, as Minecraft's are: no elbows or knees.)
    const m: ModelSpec = { ...Models.humanoid({ skin: [ox, oy], atlas: ATLAS, skeleton: true }), limbs: 'solid' };
    for (const [name, uv] of [['legL', [16, 48]], ['armL', [32, 48]]] as const) {
      const part = m.parts.find((p) => p.name === name)!;
      part.uv = [ox + uv[0], oy + uv[1]];
      delete part.mirror;
    }
    for (const p of [...m.parts]) {
      const uv = OVERLAYS[p.name];
      if (uv) m.parts.push({ name: `${p.name}Overlay`, parent: p.name, size: [...p.size], uv: [ox + uv[0], oy + uv[1]], pivot: [0, 0, 0], offset: [...p.offset], inflate: p.name === 'head' ? 0.5 : 0.25 } as ModelPart);
    }
    return m;
  }
  return { origin, models: Array.from({ length: count }, (_, k) => model(k)) };
}

/**
 * The most skins sent: each joining screen gets the sheet as one picture, so it's cut to the first rows (96 skins,
 * 1024 × 384: under a third of the whole sheet), for players coming in over a tunnel.
 */
const MOST_SKINS = 96;

/** A sheet cut to its first `most` skins (whole rows). */
function firstOf(sheet: SkinSheet, most: number): SkinSheet {
  if (sheet.count <= most) return sheet;
  const rows = Math.ceil(most / sheet.columns);
  const height = rows * 64;
  // (Re-pack the runs of the rows kept: a run never crosses the cut once split there.)
  const runs = Uint8Array.from(atob(sheet.runs), (c) => c.charCodeAt(0));
  const keep = sheet.width * height;
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < runs.length && at < keep; i += 5) {
    const n = Math.min(runs[i], keep - at);
    out.push(n, runs[i + 1], runs[i + 2], runs[i + 3], runs[i + 4]);
    at += n;
  }
  let text = '';
  for (let i = 0; i < out.length; i += 0x8000) text += String.fromCharCode(...out.slice(i, i + 0x8000));
  return { ...sheet, count: Math.min(most, rows * sheet.columns), height, runs: btoa(text) };
}

// -------------------------------------------------------------------------------------------- armour

/** The armour materials, in their order under the skins: each a 128-wide strip (its two layers, 64 × 32 each). */
const ARMOUR_MATERIALS = Object.keys(ARMOUR_COLOURS);

/**
 * Paint each material's armour in Minecraft's armour layout (layer 1: helmet, chestplate, boots; layer 2: leggings)
 * under the skins, at `y0`: the material's colour, darker at the edges, a little grain.
 */
function paintArmour(pixels: Uint8Array, width: number, y0: number) {
  ARMOUR_MATERIALS.forEach((material, m) => {
    const [light, dark, line] = ARMOUR_COLOURS[material].map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    const put = (layer: number, x: number, y: number, edge = false) => {
      const grain = ((x * 7 + y * 13) % 5) / 40;
      const c = edge ? dark : light;
      const o = ((y0 + y) * width + m * 128 + layer * 64 + x) * 4;
      for (let k = 0; k < 3; k++) pixels[o + k] = Math.min(255, c[k] * (1 - grain));
      pixels[o + 3] = 255;
    };
    const box = (layer: number, x0: number, y0b: number, w: number, h: number, keep: (x: number, y: number) => boolean) => {
      for (let y = y0b; y < y0b + h; y++) for (let x = x0; x < x0 + w; x++) if (keep(x, y)) put(layer, x, y, x === x0 || y === y0b || x === x0 + w - 1 || y === y0b + h - 1);
    };
    // Layer 1. The helmet (head, 0,0): all round, its front open for the eyes.
    box(0, 0, 0, 32, 16, (x, y) => !(y >= 8 && x >= 8 && x < 16 && y >= 11 && x > 8 && x < 15) && !(y >= 8 && (x < 8 || (x >= 16 && x < 24)) && y >= 14));
    // The chestplate: the body (16,16) whole, the arms (40,16) to the elbow.
    box(0, 16, 16, 24, 16, () => true);
    box(0, 40, 16, 16, 16, (_x, y) => y < 25);
    // Boots: the legs (0,16), their lowest rows and soles.
    box(0, 0, 16, 16, 16, (x, y) => y >= 27 || (y < 20 && x >= 8 && x < 12));
    // Layer 2. Leggings: the body's waist (16,16, its lowest rows) and the legs (0,16) from the hips to the boots.
    box(1, 16, 16, 24, 16, (x, y) => y >= 27 || (y < 20 && x >= 28 && x < 36));
    box(1, 0, 16, 16, 16, (x, y) => (y >= 20 && y < 28) || (y < 20 && x >= 4 && x < 8));
    // (The outline's colour on the helmet's rim.)
    for (let x = 0; x < 32; x++) {
      const o = ((y0 + 15) * width + m * 128 + x) * 4;
      if (pixels[o + 3]) [pixels[o], pixels[o + 1], pixels[o + 2]] = line;
    }
  });
}

/** What a player wears: each piece's material (helmet, chestplate, leggings, boots), or null. */
export type Worn = readonly (string | null)[];
const wornOf = new WeakMap<GameContext, Map<string, Worn>>();

/** Put armour on a player's figure (or take it off: all null): their figure's made over with it. */
export function wearArmour(game: GameContext, player: Player, worn: Worn) {
  const all = wornOf.get(game);
  if (!all) return;
  const was = all.get(player.id);
  if (was && was.join() === worn.join()) return;
  all.set(player.id, [...worn]);
  redress(game, player);
}

/** The boxes armour adds over a figure's parts (Minecraft's: the helmet, chest and boots 1 texel out; leggings ½). */
function armourParts(base: readonly ModelPart[], worn: Worn, y0: number): ModelPart[] {
  const out: ModelPart[] = [];
  const UV: Record<string, [number, number]> = { head: [0, 0], body: [16, 16], armR: [40, 16], armL: [40, 16], legR: [0, 16], legL: [0, 16] };
  const piece = (k: number, layer: number, parts: string[], inflate: number) => {
    const material = worn[k];
    const m = material ? ARMOUR_MATERIALS.indexOf(material) : -1;
    if (m < 0) return;
    for (const name of parts) {
      const p = base.find((q) => q.name === name);
      if (!p) continue;
      const [u, v] = UV[name];
      out.push({ name: `${name}Armour${k}`, parent: name, size: [...p.size], uv: [m * 128 + layer * 64 + u, y0 + v], pivot: [0, 0, 0], offset: [...p.offset], inflate, ...(name.endsWith('L') && { mirror: true }) } as ModelPart);
    }
  };
  piece(0, 0, ['head'], 1);
  piece(1, 0, ['body', 'armR', 'armL'], 1);
  piece(2, 1, ['body', 'legR', 'legL'], 0.5);
  piece(3, 0, ['legR', 'legL'], 1);
  return out;
}

export function skins(game: GameContext): Skins {
  const sheet = firstOf(SKINS, MOST_SKINS);
  const { count } = sheet;
  const { origin, models } = unpack(game, ATLAS, sheet, undefined, { height: 32, paint: paintArmour });
  const armourAt = sheet.height;
  wornOf.set(game, new Map());
  /**
   * The same figure with slim arms (Minecraft's "Alex" build: three texels across, not four, each
   * arm keeping its inner side where it was), for under what's cut to fit that build. Made the
   * first time each is wanted.
   */
  const fitted = new Map<string, ModelSpec>();
  /** A skin's figure fitted for what's worn over it: slim-armed or not, and without the second layer of the parts in `bare` (a body's, an arm's, a leg's: what's worn there lies close, and the layer under it would show through). */
  function fittedModel(k: number, fit: Fit): ModelSpec {
    const key = `${k}:${fit.slim}:${fit.bare.join(',')}`;
    let m = fitted.get(key);
    if (!m) {
      const kept = models[k].parts.filter((p) => !(p.name.endsWith('Overlay') && fit.bare.includes(p.parent ?? '')));
      m = { ...models[k], parts: fit.slim ? slimmed(kept) : kept };
      fitted.set(key, m);
    }
    return m;
  }
  fits.set(game, new Map());

  function wear(player: Player, skin: number) {
    const k = ((Math.floor(skin) % count) + count) % count;
    player.store.set('skin', k);
    const fit = fits.get(game)?.get(player.id);
    const body = fit ? fittedModel(k, fit) : models[k];
    // (What armour they wear, over it.)
    const worn = wornOf.get(game)?.get(player.id);
    player.setModel(worn && worn.some(Boolean) ? { ...body, parts: [...body.parts, ...armourParts(body.parts, worn, armourAt)] } : body);
    // (Their first-person hand wears it too.)
    player.setSkin(origin(k), ATLAS);
  }

  /** The skin someone's in: the one they chose, else one that's theirs by their name. */
  function chosen(player: Player): number {
    const kept = player.store.get<number>('skin');
    if (typeof kept === 'number') return kept;
    let h = 2166136261;
    for (const c of player.name + player.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) % count;
  }

  const dress = (player: Player) => !player.bot && wear(player, chosen(player));
  // (For whoever undresses them, a creature's shape put off: `redress`.)
  dressers.set(game, dress);
  game.events.on('playerJoin', ({ player }) => dress(player));
  game.events.on('playerLeave', ({ player }) => (fits.get(game)?.delete(player.id), wornOf.get(game)?.delete(player.id)));
  game.events.on('playerReady', ({ player }) => dress(player));

  game.commands.register('skin', {
    help: 'Change your skin',
    usage: `<1-${count}> | next | prev | random`,
    run(args, g, player) {
      const a = (args[0] ?? '').toLowerCase();
      const now = chosen(player);
      if (/^\d+$/.test(a)) wear(player, Number(a) - 1);
      else if (a === 'next') wear(player, now + 1);
      else if (a === 'prev') wear(player, now - 1);
      else if (a === 'random') wear(player, g.rng.int(0, count - 1));
      else if (a) return `Usage: /skin <1-${count}> | next | prev | random`;
      return `Skin ${chosen(player) + 1} of ${count}`;
    },
    complete: () => ['next', 'prev', 'random'],
  });

  const made: Skins = { count, models, wear, fitted: (k, fit) => fittedModel(k, { slim: fit.slim, bare: [...fit.bare].sort() }) };
  installedSkins.set(game, made);
  return made;
}
