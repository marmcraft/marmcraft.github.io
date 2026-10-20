import type { GameContext, ItemStack } from '@platform';
import type { Survival } from '../survival';
import type { GameMode, GameModes } from './gamemode';

/**
 * What a player has, kept in their own browser (localStorage), singleplayer and multiplayer alike: their game
 * mode, what they carry and where they are. Every few seconds the server sends their screen the lot
 * (`marm:save`), which keeps it; when they join, the server asks (`marm:hello`) and their screen sends back what
 * it kept (`marm:restore`), once, which puts them back as they were. The screen's half is in `client.ts`.
 */

const EVERY = 5;
/** How long after joining a restore is taken (after that, it's ignored: no teleporting about). */
const WINDOW = 15;

export interface Saved {
  mode: GameMode;
  slots: (ItemStack | null)[];
  /** Armour worn, head to feet. */
  worn?: (ItemStack | null)[];
  at: { x: number; y: number; z: number; yaw: number };
}

export function saves(game: GameContext, modes: GameModes, rules: Survival) {
  const joined = new Map<string, number>();
  const restored = new Set<string>();

  game.events.on('playerJoin', ({ player }) => {
    if (player.bot) return;
    joined.set(player.id, game.clock.total);
  });
  // (Anyone here before this was set up: singleplayer's player is in from the start.)
  for (const p of game.players) if (!p.bot) joined.set(p.id, game.clock.total);
  game.events.on('playerLeave', ({ player }) => {
    joined.delete(player.id);
    restored.delete(player.id);
  });

  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  game.events.on('clientMessage', ({ player, name, data }) => {
    if (name !== 'marm:restore' || restored.has(player.id)) return;
    const since = joined.get(player.id);
    if (since === undefined || game.clock.total - since > WINDOW) return;
    restored.add(player.id);
    const s = data as Partial<Saved> | null;
    if (!s || typeof s !== 'object') return;
    if (s.mode && ['creative', 'survival', 'adventure', 'spectator'].includes(s.mode)) modes.set(player, s.mode);
    if (Array.isArray(s.worn)) rules.setWorn(player, s.worn.slice(0, 4).map((st) => (st && typeof st.item === 'string' && finite(st.count) ? { item: st.item, count: 1, ...(finite(st.wear) && { wear: Math.floor(st.wear!) }) } : null)));
    if (Array.isArray(s.slots)) {
      s.slots.slice(0, player.inventory.capacity).forEach((st, i) => {
        if (!st || typeof st.item !== 'string' || !game.items.get(st.item) || !finite(st.count) || st.count < 1) return;
        player.inventory.set(i, { item: st.item, count: Math.min(Math.floor(st.count), 64), ...(finite(st.wear) && st.wear! > 0 && { wear: Math.floor(st.wear!) }) });
      });
    }
    const a = s.at;
    if (a && finite(a.x) && finite(a.y) && finite(a.z) && a.y > -64 && a.y < 320) player.teleport({ x: a.x, y: a.y, z: a.z }, finite(a.yaw) ? a.yaw : 0);
  });

  let next = EVERY;
  let ask = 1;
  return {
    update(dt: number) {
      // (Asked again until their screen answers: a singleplayer screen starts listening after the player's in.)
      ask -= dt;
      if (ask <= 0) {
        ask = 1;
        for (const p of game.players) if (!p.bot && !restored.has(p.id) && game.clock.total - (joined.get(p.id) ?? 0) < WINDOW) game.clients.send(p, 'marm:hello', {});
      }
      next -= dt;
      if (next > 0) return;
      next = EVERY;
      for (const p of game.players) {
        if (p.bot || !p.alive) continue;
        // (Not until they've been put back as they were, so a fresh start doesn't overwrite what was kept.)
        if (!restored.has(p.id) && game.clock.total - (joined.get(p.id) ?? 0) < WINDOW) continue;
        const pos = p.position;
        const saved: Saved = { mode: modes.of(p), slots: p.inventory.slots.map((s) => (s ? { item: s.item, count: s.count, ...(s.wear && { wear: s.wear }) } : null)), worn: rules.worn(p), at: { x: pos.x, y: pos.y, z: pos.z, yaw: p.yaw } };
        game.clients.send(p, 'marm:save', saved);
      }
    },
  };
}
