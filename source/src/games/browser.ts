import type { GameMeta } from '@platform';
import type { ClientGame, GameEntry } from '@platform/client';
import sandbox from './sandbox/meta';

/** A game in the catalog: its meta now, its client code (and shared code) when picked, a chunk of its own. */
const entry = (meta: GameMeta, load: () => Promise<{ default: ClientGame }>): GameEntry => ({ meta, load: () => load().then((m) => m.default) });

/** The browser's catalog: MARM's one world. */
export const games: GameEntry[] = [entry(sandbox, () => import('./sandbox/client'))];

/** Development-only games: none now (MARM is one world). */
export async function devGames(): Promise<GameEntry[]> {
  return [];
}
