import type { GameDefinition } from '@platform';
import sandbox from './sandbox/server';

/** The games a server hosts, as it runs them (shared definition and rules): MARM's one world. */
export const games: GameDefinition[] = [sandbox];

/** Development-only games: none now (MARM is one world). */
export async function devGames(): Promise<GameDefinition[]> {
  return [];
}
