import type { CommandApi, CommandSpec, GameContext, Player } from './api/types';

/** Splits a command line into words; double quotes group words with spaces. */
function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  return out;
}

/** Registry and runner for slash commands (`/give iron_sword 2`). */
export class Commands implements CommandApi {
  private cmds = new Map<string, CommandSpec>();

  constructor(
    private ctx: () => GameContext,
    /** Cheats are on: developer tools (`cheat: true`) exist. */
    private cheats = true,
  ) {}

  register(name: string, spec: CommandSpec) {
    // Without cheats, a developer tool isn't there at all.
    if (spec.cheat && !this.cheats) return;
    this.cmds.set(name.toLowerCase().replace(/^\/+/, ''), spec);
  }

  list(): [string, CommandSpec][] {
    return [...this.cmds.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  run(line: string): string {
    return this.exec(line).text;
  }

  /** Runs a line typed by `player` (default: the player); `ok` is false for unknown commands and thrown errors. */
  exec(line: string, player?: Player): { ok: boolean; text: string } {
    // (A minus sign that isn't the keyboard's, before a number: taken as one. Pasted text often has the typeset minus.)
    const words = tokenize(line.trim().replace(/^\/+/, '').replace(/(^|[\s~,])[\u2212\u2012\u2013\u2014\ufe63\uff0d](?=\.?\d)/g, '$1-'));
    if (!words.length) return { ok: true, text: '' };
    const name = words[0].toLowerCase();
    const cmd = this.cmds.get(name);
    if (!cmd) return { ok: false, text: `Unknown command /${name}. Try /help` };
    try {
      const ctx = this.ctx();
      return { ok: true, text: cmd.run(words.slice(1), ctx, player ?? ctx.player) ?? '' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, text: cmd.usage ? `${msg}\nUsage: /${name} ${cmd.usage}` : msg };
    }
  }

  /** Candidates for the word being typed at the end of `line`, and where that word starts. */
  complete(line: string): { start: number; options: string[] } {
    // What's said (no slash): the word being typed, completed as the name of someone here.
    if (!line.startsWith('/')) {
      const word = /\S*$/.exec(line)?.[0] ?? '';
      if (!word) return { start: line.length, options: [] };
      const names = this.ctx().players.filter((p) => !p.bot).map((p) => p.name);
      return { start: line.length - word.length, options: names.filter((n) => n.toLowerCase().startsWith(word.toLowerCase())).sort() };
    }
    const body = line.replace(/^\/+/, '');
    const offset = line.length - body.length;
    const words = body.split(/\s+/);
    const current = words[words.length - 1] ?? '';
    const start = line.length - current.length;
    let pool: string[];
    if (words.length <= 1) {
      pool = [...this.cmds.keys()];
      return { start: Math.max(start, offset), options: pool.filter((c) => c.startsWith(current.toLowerCase())).sort() };
    }
    const cmd = this.cmds.get(words[0].toLowerCase());
    pool = cmd?.complete?.(words.slice(1), this.ctx()) ?? [];
    // A command that doesn't say: the choices its usage lists for this word (`<clear|rain|thunder>`, `[on|off]`), in its order;
    // and where it takes a player, the players here.
    let listed = pool.length === 0 ? choices(cmd?.usage, words.length - 2) : [];
    if (!listed.length && pool.length === 0 && /^[<[](player|name|target|who)[\]>]$/i.test(cmd?.usage?.match(/<[^>]*>|\[[^\]]*\]|\S+/g)?.[words.length - 2] ?? '')) listed = this.ctx().players.filter((p) => !p.bot).map((p) => p.name);
    const options = listed.length ? listed.filter((c) => c.toLowerCase().startsWith(current.toLowerCase())) : pool.filter((c) => c.toLowerCase().startsWith(current.toLowerCase())).sort();
    return { start, options };
  }
}

/** The choices a usage lists for its `n`th word (`<a|b|c> [seconds]`: a, b, c for the first), if it lists any. */
function choices(usage: string | undefined, n: number): string[] {
  const word = usage?.match(/<[^>]*>|\[[^\]]*\]|\S+/g)?.[n];
  if (!word) return [];
  const inner = word.replace(/^[<[]|[\]>]$/g, '');
  return inner.includes('|') ? inner.split('|').map((w) => w.trim()).filter((w) => /^[\w-]+$/.test(w)) : [];
}
