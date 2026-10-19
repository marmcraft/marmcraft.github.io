import { defineClient } from '@platform/client';
import { figures, firstPerson } from '@platform/client/kits';
import { ATLAS, blockItems, itemCells, shared } from './shared';

/**
 * Sandbox on each player's screen: the first-person view (the block in hand, placed and broken)
 * and other builders' figures (with the blocks they hold). Building's sounds are the engine's own;
 * a block in hand is held Minecraft Java's way (the cube alone, low at the right); nobody swings, fires or throws, so it needs no other voices, HUD or effects.
 * Survival's items look as they're painted (the server's atlas of them), and a block's item as the block.
 */
export default defineClient(shared, {
  kits: [...firstPerson.standard({ blocks: 'java' }), figures.minecraft(), figures.humanoid()],
  setup(client) {
    // What this player has (mode, what they carry, where), kept in this browser: the server sends it now and then,
    // and asks for it back when they join (addons/saves.ts). Singleplayer and multiplayer keep theirs apart.
    const key = () => {
      let mode = 'single';
      try {
        mode = sessionStorage.getItem('marm.mode') === 'multi' ? 'multi' : 'single';
      } catch {
        // (No storage: singleplayer's.)
      }
      return `marm.save.${mode}`;
    };
    client.on('marm:save', (data) => {
      try {
        localStorage.setItem(key(), JSON.stringify(data));
      } catch {
        // (Not kept: full, or no storage.)
      }
    });
    client.on('marm:hello', () => {
      let kept: unknown = null;
      try {
        kept = JSON.parse(localStorage.getItem(key()) ?? 'null');
      } catch {
        kept = null;
      }
      client.send('marm:restore', kept);
    });
    for (const [name, at] of itemCells()) client.items.look(name, { icon: { atlas: ATLAS, ...at } });
    for (const name of blockItems(Object.keys(shared.blocks ?? {}))) client.items.look(name, { icon: { block: name } });
  },
});
