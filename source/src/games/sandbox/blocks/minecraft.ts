import type { BlockDefinition, BlockTexture } from '@platform';

/**
 * The thin blocks Minecraft builds are full of, as blocks of Sandbox's own (after mconline's `core`
 * set): a fence of another wood, a wall, bars, a trapdoor, a door, a gate, rails, carpets, snow, vines,
 * a cobweb, a lily pad, a chest, a lantern, a plate, a button and a flower pot. They're in the block
 * picker, as they stand: nothing opens, presses or rides on them.
 *
 * Every picture is painted here, as the engine's own are (no texture pack). The endless world has room
 * for 68 variants of a game's blocks in all (a block that faces four ways is four), so this is one of
 * each kind.
 */

type Box = [number, number, number, number, number, number];
type Blocks = Record<string, BlockDefinition>;

/** Against the wall behind it (as it faces north: the south side of its cell). */
const ON_WALL = (x0: number, y0: number, x1: number, y1: number, deep = 1): Box[] => [[x0, y0, 16 - deep, x1, y1, 16]];
const FLAT: Box[] = [[0, 0, 0, 16, 1, 16]];

const OAK_DARK = '#7d5a32';
const OAK_LIGHT = '#a8834d';
const OAK_MID = '#946f3f';

/** Bars: uprights with a rail top and bottom, the rest clear. */
const BARS: BlockTexture = { paint: (x, y) => (x % 4 === 1 || y === 0 || y === 15 ? (x % 4 === 1 && y % 3 ? '#8f959b' : '#6c7278') : null) };
/** A trapdoor's hatch: a frame, and inside it a lattice with holes. */
const TRAPDOOR: BlockTexture = {
  paint: (x, y) => (x > 2 && x < 13 && y > 2 && y < 13 && (x % 5 === 3 || y % 5 === 3) ? OAK_DARK : x > 2 && x < 13 && y > 2 && y < 13 ? null : (x + y) % 7 ? OAK_LIGHT : OAK_DARK),
};
/** A door's lower half: planks running up, in a dark frame, two sunk panels. */
const DOOR: BlockTexture = {
  paint: (x, y) => {
    if (x === 0 || x === 15 || y === 15) return OAK_DARK;
    if ((x === 3 || x === 12) && y > 2 && y < 13) return OAK_DARK;
    if ((y === 3 || y === 12) && x > 2 && x < 13) return OAK_DARK;
    if (x === 13 && y === 7) return '#3a2a18'; // the knob
    return x % 4 === 0 ? OAK_MID : OAK_LIGHT;
  },
};
/** A door's upper half: the same frame, with a window of four panes (clear). */
const DOOR_TOP: BlockTexture = {
  paint: (x, y) => {
    if (x === 0 || x === 15 || y === 0) return OAK_DARK;
    if (x > 2 && x < 13 && y > 2 && y < 13) return x === 7 || x === 8 || y === 7 || y === 8 ? OAK_DARK : null;
    return x % 4 === 0 ? OAK_MID : OAK_LIGHT;
  },
};
/** Rails from above: two steel rails along z on wooden sleepers (`turned`: along x). */
const railTop = (turned: boolean): BlockTexture => ({
  paint: (x, y) => {
    const [a, b] = turned ? [y, x] : [x, y];
    if (a === 2 || a === 3 || a === 12 || a === 13) return a % 2 ? '#9aa0a6' : '#7d838a';
    if (a > 0 && a < 15 && b % 4 < 2) return b % 4 ? '#7a5a34' : '#6a4d2c';
    return null;
  },
});
/** Leaves hanging in strands (grey: tinted by the grass where it hangs). */
const VINE: BlockTexture = { paint: (x, y) => ((x * 7 + y * 3) % 5 < 2 && (x + (y >> 2)) % 3 !== 0 ? ((x + y) % 2 ? '#9a9a9a' : '#868686') : null) };
/** Threads from the middle out, and rings round it. */
const COBWEB: BlockTexture = {
  paint: (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    const r = Math.round(Math.hypot(dx, dy));
    const spoke = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6;
    return spoke || (r % 4 === 2 && r < 9) ? '#e8eaec' : null;
  },
};
/** A lily pad's outline from above (a notch cut toward the middle). */
const LILY_PAD: Box[] = [[4, 0, 1, 6, 1, 13], [10, 0, 1, 12, 1, 13], [3, 0, 2, 4, 1, 12], [6, 0, 2, 7, 1, 14], [9, 0, 2, 10, 1, 14], [12, 0, 2, 13, 1, 12], [2, 0, 3, 3, 1, 11], [13, 0, 3, 14, 1, 11], [7, 0, 4, 9, 1, 14], [5, 0, 13, 6, 1, 14], [10, 0, 13, 11, 1, 14]];
/** A chest's planks in a dark frame, and (on its front) the seam under the lid and a pale latch. */
const CHEST_SIDE: BlockTexture = { paint: (x, y) => (x === 0 || x === 15 || y === 0 || y === 15 ? '#4a2f14' : y === 9 ? '#3a240f' : (x + (y >> 1)) % 5 ? '#b5762d' : '#9c6424') };
const CHEST_FRONT: BlockTexture = { paint: (x, y) => (x >= 7 && x <= 8 && y >= 7 && y <= 10 ? '#d9d4c7' : (CHEST_SIDE as { paint: (x: number, y: number) => string | null }).paint(x, y)) };
const COLOURS: Record<string, string> = { white: '#e9ecec', red: '#a12722' };

/** Sandbox's Minecraft blocks: one of each kind (see the top). */
export function minecraftBlocks(): Blocks {
  const b: Blocks = {};
  b.spruce_fence = { texture: 'spruce_planks', shape: 'fence', hardness: 1.5 };
  // (A wall stands as a fence does, in stone.)
  b.cobblestone_wall = { label: 'Cobblestone Wall', texture: 'cobblestone', shape: 'fence', hardness: 2 };
  b.iron_bars = { texture: BARS, shape: 'pane', transparency: 'cutout', hardness: 2.5 };
  // A trapdoor shut in the floor of its cell.
  b.oak_trapdoor = { texture: TRAPDOOR, boxes: [[0, 0, 0, 16, 3, 16]], facing: true, transparency: 'cutout', hardness: 1.5 };
  // A door: a block for each half, standing at the back of its cell (put the upper on the lower).
  b.oak_door = { label: 'Oak Door', texture: DOOR, boxes: ON_WALL(0, 0, 16, 16, 3), facing: true, transparency: 'cutout', hardness: 1.5 };
  b.oak_door_top = { label: 'Oak Door (Upper)', texture: DOOR_TOP, boxes: ON_WALL(0, 0, 16, 16, 3), facing: true, transparency: 'cutout', hardness: 1.5 };
  // A gate across the way it faces.
  b.oak_fence_gate = { texture: 'oak_planks', boxes: [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [2, 6, 7, 14, 9, 9], [2, 12, 7, 14, 15, 9], [6, 9, 7, 10, 12, 9]], facing: true, hardness: 1.5 };
  // Rails in the round: two steel rails standing on wooden sleepers, along z, or turned along x.
  const track = (turned: boolean): Box[] => {
    const t = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): Box => (turned ? [z0, y0, x0, z1, y1, x1] : [x0, y0, z0, x1, y1, z1]);
    return [t(2, 0, 4, 16, 1, 3), t(12, 0, 14, 16, 1, 3), ...[1, 5, 9, 13].map((z) => t(1, z, 15, z + 2, 0, 1))];
  };
  const rail = (turned: boolean, label?: string): BlockDefinition => ({
    ...(label && { label }),
    texture: { top: railTop(turned), bottom: railTop(turned), side: { paint: (_x, y) => (y >= 15 ? '#7a5a34' : '#9aa0a6') } },
    boxes: track(turned),
    transparency: 'cutout',
    solid: false,
    hardness: 0.7,
  });
  b.rail = rail(false);
  b.rail_ew = rail(true, 'Rail (East-West)');
  for (const [colour, hex] of Object.entries(COLOURS)) b[`${colour}_carpet`] = { texture: { color: hex, noise: 0.14, scale: 2 }, boxes: FLAT, hardness: 0.1 };
  // A layer of snow, walked through (feet sunk in it).
  b.snow_layer = { label: 'Snow', texture: 'snow', boxes: [[0, 0, 0, 16, 2, 16]], hardness: 0.1, replaceable: true, solid: false };
  // Things that hang, grow and catch.
  b.vine = { texture: VINE, boxes: ON_WALL(0, 0, 16, 16, 1), facing: true, solid: false, climbable: true, transparency: 'cutout', tint: 'grass', hardness: 0.2 };
  b.cobweb = { texture: COBWEB, shape: 'cross', transparency: 'cutout', solid: false, hardness: 0.4 };
  b.lily_pad = { texture: { color: ['#2f8a3a', '#26752f'], scale: 2 }, boxes: LILY_PAD, hardness: 0.1 };
  // Furnishings, as their shapes. A chest: a body and a lid, the latch on the side it faces.
  b.chest = { texture: { top: CHEST_SIDE, bottom: CHEST_SIDE, side: CHEST_SIDE, front: CHEST_FRONT }, boxes: [[1, 0, 1, 15, 14, 15]], facing: true, hardness: 2 };
  b.lantern = { texture: { color: ['#ffd27a', '#f2b84a'], scale: 2 }, boxes: [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]], light: 14, glow: 0.9, hardness: 1 };
  b.oak_pressure_plate = { texture: 'oak_planks', boxes: [[1, 0, 1, 15, 1, 15]], solid: false, hardness: 0.5 };
  b.stone_button = { texture: 'stone', boxes: ON_WALL(5, 6, 11, 10, 2), facing: true, solid: false, hardness: 0.5 };
  b.flower_pot = { texture: { color: ['#8e4a32', '#7c4029'], scale: 4 }, boxes: [[5, 0, 5, 11, 6, 11]], hardness: 0.1 };
  return b;
}
