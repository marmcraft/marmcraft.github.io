import type { GameContext } from '@platform';
import { survival, type Survival } from '../survival';
import { gamemode } from './gamemode';
import { saves } from './saves';
import { NAMES } from './names.data';
import { skins } from './skins';
import { wanderers } from './wanderers';

/**
 * Sandbox's add-ons (ported from mconline): optional extras that keep to themselves. Each is a
 * function given the game in `setup`; taking its line out of the list takes it out of the game.
 */
export const ADDONS: ((game: GameContext) => void | { update(dt: number): void })[] = [
  (game) => {
    // Minecraft-style bodies in skins, for players and the crowd alike (`/skin`), and a crowd of
    // bots wandering the world in them, named and tagged as players are (`/bots on|off|<n>`).
    const looks = skins(game);
    // (A smaller crowd than mconline's 4,000: every body drawn is sent to every screen, over a tunnel too.)
    wanderers(game, { count: 600, sight: 120, live: 48, people: looks.models, names: NAMES });
  },
  // Minecraft's game modes, a player at a time (/gamemode creative|survival|adventure|spectator), and survival's
  // mining, crafting and smelting for those in survival.
  (game) => {
    let rules: Survival | null = null;
    const modes = gamemode(game, (player, mode, was) => rules?.changed(player, mode, was));
    rules = survival(game, (player) => modes.of(player));
    // What each player has, kept in their own browser and put back when they return.
    const kept = saves(game, modes);
    return { update: (dt: number) => (rules!.update(dt), kept.update(dt)) };
  },
];

/** Set every add-on up; returns what runs every step (call it from the game's `update`). */
export function installAddons(game: GameContext): (dt: number) => void {
  const running = ADDONS.map((addon) => addon(game)).filter((a): a is { update(dt: number): void } => !!a);
  return (dt) => {
    for (const a of running) a.update(dt);
  };
}
