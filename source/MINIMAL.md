# MARM: Multi-agent Rust in Minecraft

The engine and platform this started from (2026-10-17), with a few features carried over from the mconline
fork. Everything else from mconline was left out on purpose.

## What changed from the starting platform

**Removed**
- Block Jam, Block Ice and Blockilization (`src/games/{blockjam,blockice,blockilization}`), their
  tests, and their entries in `src/games/browser.ts`, `src/games/server.ts` and `docs/PLATFORM.md`.

**Added (all switched on in Sandbox only)**
- **Mineclonia first-person hand.** `src/platform/render/mineclonia-hand.ts` and
  `render/assets/mineclonia-hand/` (the CC0 Mineclonia mesh and skin). A game turns it on with
  `hud: { style: 'mineclonia' }`; the arm uses the player's skin when they have one.
- **Java-style held block.** `firstPerson.standard({ blocks: 'java' })` shows a held block as
  Minecraft Java does: the cube alone, low at the right, turned 45 degrees, with no arm. Torches
  are held upright in the fist. (`client-kits/firstperson/kit.ts`, `poses.ts`: `blockRest`, `lightRest`.)
- **Mineclonia hotbar.** `hud.style: 'mineclonia'` puts `mineclonia-look` on the body in play;
  `src/platform/ui/mineclonia.css` draws the hotbar with Mineclonia's `mcl_inventory` sprites
  (`ui/assets/mineclonia/`).
- **Browser shortcuts blocked in play.** `src/platform/player/shortcuts.ts`: Ctrl/Alt shortcuts
  are cancelled while the mouse is captured; in Chromium, play goes full screen so Ctrl+W, Ctrl+T
  and Ctrl+N are held by Keyboard Lock (F11 turns that off, remembered); elsewhere, leaving
  mid-play asks first.
- **Minecraft thin blocks.** `src/games/sandbox/blocks/minecraft.ts`: 20 blocks (spruce fence,
  cobblestone wall, iron bars, oak trapdoor, oak door and its upper half, gate, two rails, two
  carpets, snow layer, vine, cobweb, lily pad, chest, lantern, pressure plate, stone button,
  flower pot). Textures are painted in code; no texture pack. They're decorative: nothing opens.
- **Wandering bots.** `src/games/sandbox/addons/wanderers.ts`, `motion/` (crowd behaviour from
  recorded social-VR crowds), `names.data.ts`. 4,000 named bots on a repeating 1,024-block square;
  up to 320 get bodies near players. Name tags match players' own. `/bots on|off|<n>|sight|live|model`.
- **Minecraft skins.** `src/games/sandbox/addons/skins.ts` and `skins.data.ts` (301 skins, packed).
  Bots and players wear them; `/skin <n>|next|prev|random`.

- **Title screen.** `GameMeta.brand` (`{ title, byline }`): when the first game listed has one, the
  home page is its own: the title in Pixelify Sans (a short name before a colon set big, without the
  colon), the byline (`link`: a part of it linked, underlined on hover; here the name to seanhardestylewis.com),
  and Play over the live world, as mconline's Grianan screen is. MARM's bar, the shelf of other
  games, the name and face, the hints and who's online are hidden (`src/platform/ui/brand.css`).
  Sandbox is first in `src/games/browser.ts` and `server.ts`, so it's the default and its brand
  ("MARM: Multi-agent Rust in Minecraft", "by Sean Hardesty Lewis") is the home page. The other games
  still open by URL (`?game=bedwars`).
- **Empty hotbar.** Creative building starts with 36 empty slots: the hotbar's nine and twenty-seven
  behind it (`sim/creative.ts`). An empty slot places nothing and holds nothing (the Mineclonia hand).
  `creativePick` now carries a slot, and a slot to swap from (`net/protocol.ts`, `validate.ts`).
- **Minecraft creative inventory** (E). `src/platform/ui/mcinventory.ts` (+ `mcdoll.ts`, the player's
  figure in their skin): Java's creative inventory, with tabs, search, a carried block, shift-click,
  number keys, and an Inventory tab of the 27 slots. Tabs are block tabs only, each pictured with
  one of the game's blocks. Used where `hud.style` is `mineclonia` (`ui/screens.ts`).
- **Minecraft escape menu.** `src/platform/ui/mcmenu.ts`: the Game Menu and Options laid out as
  Minecraft's, over the platform's pause menu and its settings (FOV, World, Skin Customization, Music &
  Sounds, Video, Details, Performance, Controls, Mouse, Key Binds, Controller). Buttons this build has
  nothing for are greyed out. No resource packs, shaders, Fall Overhaul, Grianan or icon screens.

- **Minecraft bodies.** `ModelSpec.limbs: 'solid'` builds a box body's arms, legs and body as one box
  each (no elbows, knees or bend in the back), on a rig whose elbows and knees stay straight
  (`RigOptions.stiff`, `client/humanoid.ts`; `render/entities.ts`). Sandbox's skins use it, for players
  and bots alike. `figures.minecraft()` (`client-kits/figures/minecraft.ts`) moves them with Minecraft's
  own formulas (`HumanoidModel.setupAnim`): legs `cos(limbSwing·0.6662)·1.4·amount` from the hip, arms
  half that and opposite, the walk's amount eased from speed (a walk ~0.86, a sprint 1), arms swaying
  while standing, the body tipped forward to sneak, the arm swung to hit or build, raised a little
  with something in hand, the head where they look, a fall onto the side when dying.
- **Second skin layer.** `ModelPart.inflate`: a part grown out round its middle (the hat 0.5 texel each
  way, the jacket, sleeves and trousers 0.25, Minecraft's), so the layer sits just off the body
  instead of z-fighting with it (`render/entities.ts` `boxGeometry`).
- **Name tags** (mconline's). `MarkerOptions.style: 'nametag'`: the name alone on a dark plate,
  sized as something in the world, fading in and out, faint behind blocks and while sneaking
  (`dim`), thinning at the edge of its `reach` (`ui/hudkit.ts`, `style.css`). Players get them in
  Mineclonia's look (`client/avatars.ts`), and so do the bots. Set in Pixelify Sans, not Minecraft's font.
- **Game modes.** `/gamemode creative|survival|adventure|spectator [player]` (also `/gm`, `c`/`s`/`a`/`sp`,
  `0`-`3`), kept per player (`src/games/sandbox/addons/gamemode.ts`). Survival: ten hearts, fall
  damage, regeneration, no flying, and blocks are mined, not broken at a touch: held on, a block
  cracks through the platform's ten stages and breaks after its time (its `hardness`, else
  `defaultBreakTime`: dirt and grass 0.7 s, wood 1.5 s, stone 2.2 s, obsidian 12 s); let go and it starts
  again (`sim/creative.ts` `timed`). Blocks still come from the hotbar without running out (there's no
  gathering). Hearts sit as Minecraft's do, from the hotbar's left edge just above it, at its scale
  (`ui/mineclonia.css`). Adventure: survival without breaking or placing. Spectator: the platform's
  ghost. Dying, you wake at the spawn after 3 s. Platform: `Player.setCreative`, `Player.build`.
- **Chat.** A line without a slash is said to everyone (`<name> text`: a `say` client message, a
  `chat` host event; `exec` still runs a command with or without its slash); T opens
  the chat empty, `/` opens it with the slash. Tab completes players' names in what's said, a
  command's choices from its usage (`<a|b|c>`), and players where a command takes one
  (`platform/commands.ts`). A typeset minus is read as a minus (`/tp −12`).
- **Search tab icon.** A 16×16 pixel magnifying glass drawn in code (`ui/pixelicons.ts`), not a
  downloaded picture.
- **The platform's look always on.** Shadows are never switched fully off (auto quality's last notch,
  phones' defaults, a saved "off", and both menus): the lighting is shaded by the shadow map, and
  without it the world looks unshaded and broken, as mconline found (`quality.ts`, `settings.ts`).

- **Two-byte block ids.** The engine stores block ids as `u16` (it was one byte, which left a game 68 variants
  of its own); a game now has room for 65,332. Old saves still load. See `SURVIVAL-PLAN.md` (Phase 0).

- **Survival (Phase 1).** `/gamemode survival` plays Minecraft's way (`src/games/sandbox/survival/`, Mineclonia's
  numbers from `../research/mineclonia-spec.md`):
  - A 36-slot inventory (hotbar 9). The E screen shows what's carried, with click, right-click, shift-click and
    throw-out. It is kept per player and put away in creative.
  - Dig times are `hardness / speed`, times 1.5 when the block drops and times 5 when it doesn't. Pickaxe
    levels gate ores (iron needs stone, gold/diamond/redstone/emerald need iron, obsidian needs diamond).
  - Drop tables: stone → cobblestone, ores → raw metal and gems, gravel → flint, clay → balls, glowstone →
    dust, leaves → sticks and apples, glass → nothing.
  - Tools come in five kinds and five materials. Each has a wear bar and breaks when worn out.
  - Crafting: a 2×2 grid in the inventory and a 3×3 grid at a crafting table (right-click). Recipes can be
    shaped, mirrored or shapeless, and use groups (any planks, any cobble).
  - Furnaces smelt with fuel times, light up while burning, and keep their contents with the world.
  - New painted blocks: crafting table, furnace (and lit), copper and emerald ores, deepslate ores,
    cobbled deepslate, smooth stone, metal, gem and raw-ore blocks.
  - Items are painted in code into one atlas. The server sends the atlas, and each screen gives the items
    their looks (`client.ts`).
  - Dying in survival drops everything.
- **Liquids and buckets (Phase 2).**
  - The engine has flowing water and lava as variants of the sources: levels 1 to 7 and falling, with ids
    203 onward after the built-in blocks, so saved ids stay put. A game's own blocks now start at 203.
  - The mesher draws each flowing level at its height (2/16 a level) and draws the step between levels.
    Swimming, eyes underwater and rays treat every level as the liquid.
  - Flow (`survival/liquids.ts`, Mineclonia's rules): water runs 7 blocks and lava 3. Liquid falls first,
    then heads for the nearest way down. It dries up when its source goes.
  - Two sources either side of a cell make infinite water. Water washes plants away and drops them;
    lava burns them.
  - Where they meet: a lava source becomes obsidian, flowing lava becomes cobblestone, and water under lava
    becomes stone.
  - Buckets: empty, water and lava (crafted from three iron). An empty bucket takes a source; a full one
    pours it, in survival. A lava bucket is furnace fuel for 1000 s and gives back its bucket.
- **The Nether (Phase 3).**
  - The platform can't move a player between rooms, and the world is only 256 high. So the Nether is a band of
    the same world east of x 60,000 (`world.nether`, a new world option). Inventories, persistence and
    everything else carry over as they are.
  - The engine's generator makes it (`Generator::nether_chunk`), 128 high: a ragged bedrock floor and roof,
    netherrack caves, a lava sea to y 31, soul sand on its shores, glowstone hanging from the ceilings, and
    quartz in the rock. These are Sandbox's own blocks, passed to the generator by id.
  - New blocks: netherrack, soul sand, nether quartz ore, nether bricks, quartz block, and the portal (purple,
    glowing, not solid, unbreakable). New items: quartz, nether brick, flint and steel (65 uses).
  - Portals (`survival/portals.ts`):
    - Flint and steel struck inside a standing obsidian frame (along x or z, inside 2×3 up to 21×21) lights
      it. Breaking the frame or taking a portal cell puts it out.
    - Three seconds in a portal (half a second in creative or spectator) takes you across at 1:8
      (`survival/nether.ts`: the Nether's x is 100,000 + x/8).
    - You arrive in a kept portal within 16 blocks in the Nether or 128 in the overworld. Failing that, a
      4×5 frame with a ledge is built on the nearest floor with room.
    - You stay frozen until the ground there has loaded, then have 4 seconds before a portal takes you
      again. The crowd of bots doesn't use portals.
  - The screen in the Nether: no sun, moon, stars or sky light; a red haze for a sky and fog; dim red light in
    the dark (`Environment.nether`, `uNether`).
- **The End (Phase 4).**
  - Like the Nether, it's a band of the same world: west of x −60,000 (`world.end`, a new world option), its
    island round x −100,000, z 0.
  - The engine makes it (`Generator::end_chunk`): the void, and an end-stone island 100 across, tapering
    underneath. Ten obsidian pillars stand in a ring 42 out, each as wide and tall as its shuffled size, with
    bedrock on top. The exit portal sits in a bedrock fountain at the middle and is open from the start,
    since there's no dragon.
  - Strongholds (`survival/end.ts`) are blueprints: 19 portal rooms deep underground in Minecraft's three
    inner rings. Each is stone brick with twelve frames round a lava pool, one frame in ten already holding
    an eye. They're placed by a fixed seed, the same in every world.
  - Eye of ender: put in an empty frame, it stays there. The twelfth opens the 3×3 into the End portal.
    Thrown, it flies toward the nearest stronghold in a trail of sparks, then drops (one in five shatters).
    Its recipe is a stand-in (emerald, quartz, glowstone dust), since there are no blazes or endermen yet.
  - Through the portal you go at once onto a fresh 5×5 obsidian platform at (−99,900, 49, 0). The exit
    portal takes you back to the spawn. Reaching the bottom of the End kills you.
  - The screen there: a dark purple void and dim, even light (`Environment.end`).
- **MARM only.** Every other game is gone, along with the tests that played them (about 90 files). The
  page has no `?game=` and doesn't write one. "Blockyard" is renamed to MARM throughout, the package
  included.
- **Singleplayer and Multiplayer** on the title screen. The one picked plays; the other reloads into
  itself (remembered in `sessionStorage`).
  - Singleplayer runs the host in the page (`src/singleplayer.ts`, after mconline's `LocalLink`). The world
    is kept in localStorage (`marm.single.*`), saved every 10 s and when the page goes.
  - Multiplayer connects to `MULTIPLAYER_SERVER` in `src/server-settings.ts`. `npm run multiplayer --
    --write` starts the server on port 8798 and a Cloudflare quick tunnel in front of it, and writes the
    tunnel's address into the settings.
  - The boundary and bundle checks let `src/singleplayer.ts` alone reach the host.
- **Saves in the browser** (`addons/saves.ts` and `client.ts`): every 5 s the server sends each player
  their mode, inventory (with wear) and position. Their screen keeps it in localStorage (`marm.save.single`
  or `.multi`) and sends it back when they join, once, within 15 s.
- **Night mobs** (`survival/mobs.ts`), skins painted in code:
  - zombies hit, skeletons shoot arrows, spiders pounce, and creepers hiss and blow up (breaking blocks);
  - they spawn 24–44 blocks from survival players after dark, up to 10 each, never in the Nether or End,
    and ignore creative players and spectators;
  - zombies and skeletons burn in daylight; anything 96 blocks from everyone despawns;
  - drops: rotten flesh, bones, string, gunpowder.
- Spawn in a forest (the engine's spawn search tries well inside a forest first). Survival is the default
  mode. Dropped items have no glow under them. The Disconnected screen is the title screen again, with
  Reconnect.
- Data over a tunnel: 96 skins sent (1024×384), not the whole sheet, and a crowd of 600 bots (48 drawn).
- Published at https://marmcraft.github.io (repository marmcraft/marmcraft.github.io: the built site at
  its root, this source under `source/`, one commit).
- **Items in every mode, armour, weapons, cows** (vanilla Minecraft's, Mineclonia's numbers; nothing from mconline's
  fantasy packs):
  - Sandbox plays by items in creative too (`player.hotbar: 'items'`).
    - The creative inventory lists every item: blocks in the block tabs, and the rest in Minecraft's Tools &
      Utilities, Combat and Ingredients tabs, in Minecraft's order.
    - Picking an item gives a whole stack (`creativeGive`). Creative breaks at a touch and doesn't use up what
      it places.
    - What you carry stays the same across modes, as in Minecraft.
  - Armour: leather, gold, iron and diamond (helmet, chestplate, leggings, boots) with Minecraft's points,
    durability and recipes.
    - It's worn in the survival inventory's four armour slots, laid out as Minecraft's: the slots down the left,
      the figure, the 2×2 grid and its result. Shift-click puts it on.
    - Hits wear it; falls and the world's harm aren't softened by it.
    - It shows on the player's figure, painted in Minecraft's armour layout.
  - Tools are weapons, with Minecraft's damage and attack speed (the platform's melee kit): swords sweep, and the
    bare hand does 1. A hit wears a sword by 1 and other tools by 2.
  - Cows graze by day round survival players and drop leather.
  - The title's Singleplayer/Multiplayer switcher no longer appears twice after Save and Quit to Title.
- Platform pieces for survival: `inventory.setCapacity`, `move` and `giveStack`; tool `wear` on stacks; `Container` (`player.openContainer`) with `inventoryMove/Toss/Open/Close` messages; and the building kit's `who` filter.

Left out of these on purpose: mconline's Minecraft font (Mojang's glyphs, not cleared to publish) and
its menu and tab icons (Classic Faithful pictures): the menus use Pixelify Sans (Google Fonts, OFL).

Not carried over from mconline's bots: the Tab overlay and profile cards, idle "life" animation,
crouch/AFK poses on screen (the server still sends those messages; nothing draws them), armour,
hats and pets on the crowd.

## Running it

Node 22.13 or newer (the server uses `node:sqlite`). On this machine `C:\Program Files\nodejs`
has 22.14; the nvm default (22.12) is too old.

```bash
npm install
npm run dev
```

Open `/?game=sandbox`.

## Checks run (2026-10-19, Node 22.14, Windows)

- `tsc --noEmit`, `check:boundaries`, `vite build`, `check:bundle`: pass.
- Headless tests: all 36 pass, `split.ts` included (it failed on another game's files before). New: `gamemodes.ts`, `wideids.ts`, `survival.ts`, `liquids.ts`, `nether.ts`, `end.ts` and `mobs.ts`. `generated.ts` loads Sandbox's own blocks, since its Nether is made of them.
- `tests/headless/public.ts`: its two Sandbox joins now wait 2 s instead of 0.4 s. Sandbox takes
  about 1.1 s to start (skins 0.13 s, the crowd 0.5 s); Bed Wars about 0.12 s.
- `tests/headless/sandbox.ts` now checks the empty hotbar (36 empty slots, nothing placed from an
  empty hand) and picks grass into slot 1 before placing.
- In the browser (dev server, driven by script): the title screen, the empty hotbar, a block picked
  in the creative inventory reaching the server's hotbar, and the escape menu's Game Menu, Options
  and Video screens. Clicking Play and the in-game look with a real mouse weren't checked.
- Survival in the browser, driven by script: in survival mode the E screen showed carried items with their
  painted icons, a tool's wear bar, and the 2×2 grid; a log in the grid offered 4 planks; closing gave the log
  back. The furnace and mining were checked headless only. Screenshots couldn't be taken because the window
  wasn't drawing.
- `cargo test`: 77 of 78 pass. `built_in_physics_and_rays_are_unchanged` failed before any of these changes
  too. The block-table fingerprint now skips the new flowing ids, which used to read as stone.
- Water in the browser: poured on a floor, the screen got levels 7 down to 1 and then air, with no errors.
  The flowing surfaces weren't seen in a picture, since screenshots time out while the window isn't drawing.
- The Nether in the browser: teleported there, the screen turned red (mean colour 100, 46, 26 against the
  overworld's 23, 28, 36). A screenshot showed netherrack caves, hanging glowstone and the haze. Once, the
  page showed "Disconnected" after the trip; it didn't happen again in two more tries (20 s there, with
  the pane hidden).
- `npm run build` stops on `BUNDLE_REPORT=1` under Windows `cmd`. Its steps run one by one (wasm aside) pass.

## Caveats

- The skin sheet is sent to every player as an item atlas (1024×1216 RGBA, about 5 MB before the
  WebSocket's deflate). It's the same in mconline.
- 4,000 bots / 320 live bodies is mconline's tuning. Lower it in `addons/index.ts` if the server
  struggles.
- The Mineclonia hand shows with an empty slot chosen; a block in hand is held Java-style, with no arm.
- `npm run dev` lands on Sandbox's title screen; the other games are unlisted but still served.
- Survival: the world generator doesn't place the new ores (copper, emerald, deepslate's); they're craftable
  and placeable only. Tools don't hit harder yet (no combat changes), and there's no hunger. Recipes for
  items not made yet (flint and steel, books, golden apple) are skipped until Phase 3.
- Liquids: flowing surfaces are flat steps rather than Minecraft's slopes, and have no flow direction or ripple.
  Lava doesn't set things on fire. Nether lava flows as the overworld's does.
- Nether: overworld land past x 60,000 is Nether (nobody's likely to walk that far). Portals go by the
  kept list, not by searching the world. Soul sand doesn't slow you. No fortresses, ghasts or other mobs,
  and no fire block (flint and steel only lights portals). Far from the origin (x 100,000), positions are
  32-bit floats on the GPU, about 1/128 block apart there.
- End: overworld land past x −60,000 is the End. No dragon, crystals, endermen, outer islands, chorus or
  End cities. Frames don't face inward (any ring of twelve works).
