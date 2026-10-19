import type { GameContext, Player } from '@platform';

/**
 * Game modes, Minecraft's four, a player at a time (`/gamemode <mode> [player]`; kept for the player between visits):
 *
 * - **creative**: Sandbox as it always was: fly (double-tap Space), never hurt, break and place freely.
 * - **survival**: ten hearts (falls hurt, health comes back slowly), no flying; Minecraft's survival (`survival/`):
 *   what they carry, mined, crafted and smelted, and dropped when they die.
 * - **adventure**: survival, but no block of the world's is theirs to break or place.
 * - **spectator**: a ghost: flying through anything, unseen by the world's creatures, unhurt; nothing to build.
 *
 * Dying (in survival or adventure), they wake at the spawn after a moment. To take it out, drop it from
 * `addons/index.ts`: everyone's in creative again.
 */
export type GameMode = 'creative' | 'survival' | 'adventure' | 'spectator';

const MODES: readonly GameMode[] = ['creative', 'survival', 'adventure', 'spectator'];
/** What each can be called: its name, its first letters, or Minecraft's number. */
const ALIASES: Record<string, GameMode> = { c: 'creative', 0: 'survival', s: 'survival', 1: 'creative', a: 'adventure', 2: 'adventure', sp: 'spectator', 3: 'spectator' };
const KEPT = 'gamemode';
/** How long the dead lie before they wake at the spawn (seconds). */
const WAKE = 3;
/** Survival's health: Minecraft's ten hearts, back slowly a while after a hurt. */
const HEALTH = { health: 20, fallDamage: true, regen: { delay: 6, perSecond: 0.5 } };

export interface GameModes {
  of(player: Player): GameMode;
  set(player: Player, mode: GameMode): void;
}

/** `changed`: a player's mode changed (or they arrived: `was` undefined), after the change. */
export function gamemode(game: GameContext, changed?: (player: Player, mode: GameMode, was: GameMode | undefined) => void): GameModes {
  const modes = new Map<string, GameMode>();

  function set(player: Player, mode: GameMode) {
    const was = modes.get(player.id);
    modes.set(player.id, mode);
    player.store.set(KEPT, mode);
    player.spectate(mode === 'spectator');
    player.setCreative(mode === 'creative' || mode === 'spectator', HEALTH);
    player.build = mode === 'creative' || mode === 'survival';
    changed?.(player, mode, was);
  }

  const of = (player: Player): GameMode => modes.get(player.id) ?? 'survival';
  const named = (word: string): GameMode | null => (MODES.includes(word as GameMode) ? (word as GameMode) : (ALIASES[word] ?? null));

  // (Each as they last were: survival, the first time.)
  const restore = (player: Player) => {
    if (player.bot) return;
    const kept = player.store.get<string>(KEPT);
    set(player, kept && named(kept) ? named(kept)! : 'survival');
  };
  game.events.on('playerJoin', ({ player }) => restore(player));
  // (Anyone here before this was set up: singleplayer's player is in from the start.)
  game.clock.after(0, () => {
    for (const p of game.players) if (!modes.has(p.id)) restore(p);
  });
  game.events.on('playerLeave', ({ player }) => modes.delete(player.id));

  // Dead: up again at the spawn after a moment, as they were.
  game.events.on('playerDeath', ({ player }) => {
    if (player.bot) return;
    game.clock.after(WAKE, () => {
      if (!game.players.includes(player)) return;
      player.revive();
      const s = game.world.spawn;
      player.teleport({ x: s.x, y: s.y, z: s.z }, s.yaw);
    });
  });

  const spec = {
    help: 'Change game mode: creative, survival, adventure or spectator',
    usage: '<creative|survival|adventure|spectator> [player]',
    run(args: string[], g: GameContext, player: Player) {
      if (!args[0]) return `You're in ${of(player)} mode`;
      const mode = named(args[0].toLowerCase());
      if (!mode) return `Unknown mode "${args[0]}". Usage: /gamemode <creative|survival|adventure|spectator> [player]`;
      const who = args[1] ? g.players.find((p) => p.name.toLowerCase() === args[1].toLowerCase()) : player;
      if (!who) return `Nobody called ${args[1]} is here`;
      set(who, mode);
      const name = mode.charAt(0).toUpperCase() + mode.slice(1);
      if (who !== player) who.hud.toast(`Your game mode is now ${name} Mode`);
      return who === player ? `Set own game mode to ${name} Mode` : `Set ${who.name}'s game mode to ${name} Mode`;
    },
    complete: (args: string[], g: GameContext) => (args.length <= 1 ? [...MODES] : g.players.filter((p) => !p.bot).map((p) => p.name)),
  };
  game.commands.register('gamemode', spec);
  // (Minecraft's short way: /gm s.)
  game.commands.register('gm', { ...spec, help: 'Short for /gamemode' });
  return { of, set };
}
