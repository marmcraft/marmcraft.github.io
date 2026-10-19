# Survival progression plan

Goal: Minecraft-style survival in Sandbox, after Mineclonia: tools and tiers, crafting, smelting, block
drops, flowing water and lava, buckets, cobblestone and obsidian, the Nether and the End.
Reference numbers: `../research/mineclonia-spec.md`. Engine limits: `../research/marm-limits.md`.

## Phase 0: wide block ids (engine): done
Ids are `u16` (`BlockId`, `ID_SPACE` 65536, `UNKNOWN_ID` 65535): a game has room for 65,348 variants. Packed
columns and mesher regions carry two bytes a block (`SECTION_BYTES` 8192); edits are saved tagged `BYW2` with
two-byte blocks, and untagged one-byte saves from before still load (`import_edits`, `forEachEdit`); blueprints are
`Uint16Array` (65535 keeps the terrain). Test: `tests/headless/wideids.ts` (400 blocks, ids to 586).

Block ids are one byte today (sections `[u8; 4096]`, 255 = unknown), so a game gets 68 variants of its own
blocks and Sandbox has about 12 left. Widen to `u16` through the engine (world sections, edits and their
export, the mesher and lighting, the terrain generator and blueprints, shapes, culling, damage, movers),
the TypeScript side (the registry and remap tables, worker transfer, blueprints) and saved worlds (a
format version, with old one-byte saves read as before).

## Phase 1: survival core (TypeScript): done (2026-10-19)
Done as below, except buckets (Phase 2), chests' storage, and ore generation for the new ores.

- Item mode in survival: a 36-slot inventory (hotbar 9), the Minecraft inventory screen showing what's
  carried (mconline's `setStacks`, `inventoryMove`), kept per player.
- Items: block items, sticks, coal, charcoal, raw and smelted metals, gems, flint, buckets, tools in
  wood, stone, iron, gold, diamond (pickaxe, axe, shovel, sword, hoe) with durability.
- Mining: Mineclonia's dig-time formula with tool speed and level; drops only at the right level; drop
  tables (stone → cobblestone, ores → raw metal or gems with counts, gravel → flint, leaves → saplings
  and sticks, glass → nothing).
- Crafting: the inventory's 2×2 and the crafting table's 3×3, shaped and shapeless recipes with groups.
- Smelting: the furnace with fuel and cook times; block entities (furnace, chest) kept by position.
- New blocks: crafting table, furnace (lit and unlit), copper and deepslate ores and their cobbles, ore
  blocks.

## Phase 2: liquids: done (2026-10-19)
Done as below (flowing levels in the engine, flow in `survival/liquids.ts`, buckets). Surfaces are flat steps, not slopes.

- Water and lava levels as blocks (source and seven or three flowing levels), with the engine treating
  every level as water or lava for swimming, burning and drawing.
- Flow after Mineclonia's Minecraft-like engine: tick rates, levels, falling columns, slope pathing,
  infinite water sources, washing away torches and plants.
- Lava meeting water: stone, cobblestone, obsidian.
- Buckets: empty, water, lava; pick up a source, place one.

## Phase 3: the Nether: done (2026-10-19)
Done in one world rather than its own room: the Nether is the world east of x 60,000 (see MINIMAL.md). No fortresses or mobs.

- Nether blocks: netherrack, soul sand, glowstone, nether quartz ore, nether bricks, portal.
- Portal: obsidian frame detection, flint and steel, the portal block, 3 s to teleport, 1:8 coordinates,
  finding or building the destination portal.
- A Nether world (its own room) with a Nether generator in the engine: netherrack caves, bedrock floor
  and roof, lava sea, glowstone, soul sand, quartz. Inventories carried between worlds.

## Phase 4: the End: done (2026-10-19)
Done in one world (west of x −60,000), without the dragon or mobs; see MINIMAL.md.

- End portal frames and eyes of ender, strongholds (simplified), the End world: the main island of end
  stone, obsidian pillars, the exit portal. The dragon is optional.

## Later
Hunger and saturation, XP, beds and respawn points, more mobs.
