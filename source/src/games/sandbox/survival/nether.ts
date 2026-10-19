/**
 * Where Sandbox's Nether is: the same world, east of x 60,000 (the generator makes Nether there: `world.nether`),
 * its middle at x 100,000. A block in the Nether is eight in the overworld, as Minecraft's: overworld (x, z) is
 * Nether (100,000 + x / 8, z / 8), so the overworld out to x ±320,000 has its Nether.
 */
export const NETHER_X = 60_000;
export const NETHER_MIDDLE = 100_000;
/** How high the Nether is: bedrock roof under this, and its lava sea's level. */
export const NETHER_TOP = 128;
export const NETHER_LAVA = 31;

export const inNether = (x: number) => x >= NETHER_X;

/** Where a place in one world leads in the other (y as it is; the portal's finding fixes it). */
export function across(x: number, y: number, z: number): { x: number; y: number; z: number; nether: boolean } {
  if (inNether(x)) return { x: Math.floor((x - NETHER_MIDDLE) * 8), y, z: Math.floor(z * 8), nether: false };
  return { x: Math.floor(NETHER_MIDDLE + x / 8), y, z: Math.floor(z / 8), nether: true };
}
