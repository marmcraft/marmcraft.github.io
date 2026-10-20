import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { workerData, type MessagePort } from 'node:worker_threads';
import { MarmEnv, type Action } from './env';
import { TASKS } from './tasks';
import { Watch } from './watch';

/**
 * The environment over HTTP (JSON), for an agent in any language (the course's Python agent). One episode at a time
 * per server; start several on different ports to run episodes side by side.
 *
 *   GET  /tasks                       the task suite (ids, goals, budgets)
 *   GET  /actions                     the action space, described
 *   POST /reset   { task, seed }      -> { observation }
 *   POST /step    { action }          -> { observation, result, done }
 *   GET  /observe                     -> { observation }        (no time passes)
 *   GET  /grade                       -> the grader's scores     (the true state: for the evaluator, not the agent)
 *   GET  /watching                    -> { watching }  pages showing the episode (watch mode: src/agent/watch.ts)
 */

export const ACTIONS = [
  { type: 'move_to', args: { x: 'int', y: 'int', z: 'int' }, does: 'Walk to a place (within 64 blocks), finding a way round, up steps and down drops.' },
  { type: 'mine', args: { block: 'block name (or "log" for any log)', count: 'int, default 1' }, does: 'Mine the nearest blocks of a type in sight, with what is in hand, and pick up what drops.' },
  { type: 'dig', args: { x: 'int', y: 'int', z: 'int' }, does: 'Break the block at a place (walking within reach first), and pick up what drops.' },
  { type: 'place', args: { item: 'item name', x: 'int', y: 'int', z: 'int' }, does: 'Place a block from the inventory into an empty place beside something solid.' },
  { type: 'craft', args: { item: 'item name', count: 'int: how many of the item, default 1' }, does: 'Craft an item: in the inventory 2x2 grid, or at a crafting table within 16 blocks for 3x3 recipes.' },
  { type: 'smelt', args: { item: 'item name', count: 'int, default 1', fuel: 'item name, optional' }, does: 'Smelt items in a furnace within 16 blocks (10 s each); fuel is taken from the inventory.' },
  { type: 'equip', args: { item: 'item name' }, does: 'Hold an item in hand (tools mine faster; swords hit harder).' },
  { type: 'attack', args: { target: 'creature type, optional' }, does: 'Fight the nearest creature (of a type) until it dies or 20 s pass.' },
  { type: 'use', args: { item: 'item name', x: 'int', y: 'int', z: 'int' }, does: 'Use an item on a block (a bucket on water, flint and steel on obsidian).' },
  { type: 'chat', args: { message: 'text' }, does: 'Say something to the player you are helping (explain what you are doing and why).' },
  { type: 'wait', args: { seconds: 'number, 1-300' }, does: 'Let time pass (furnaces cook, night goes by).' },
  { type: 'scan', args: {}, does: 'Look further around (a wider view); takes no time.' },
];

export function serve(port: number, wasm: BufferSource, watch?: Watch) {
  const env = new MarmEnv(wasm);
  watch?.attach(env);
  let ready = false;
  const body = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (err) {
          reject(err);
        }
      });
    });
  const send = (res: ServerResponse, code: number, value: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/tasks') return send(res, 200, TASKS.map((t) => ({ id: t.id, goal: t.goal, start: t.start, budget: t.budget, milestones: t.milestones.map((m) => m.label) })));
      if (req.method === 'GET' && url.pathname === '/actions') return send(res, 200, ACTIONS);
      if (req.method === 'GET' && url.pathname === '/watching') return send(res, 200, { watching: watch?.watching ?? 0 });
      if (req.method === 'POST' && url.pathname === '/reset') {
        const b = await body(req);
        const observation = env.reset(String(b.task), Number(b.seed ?? 1));
        ready = true;
        return send(res, 200, { observation });
      }
      if (!ready) return send(res, 409, { error: 'reset first' });
      if (req.method === 'POST' && url.pathname === '/step') {
        const b = await body(req);
        const out = env.act(b.action as Action);
        return send(res, 200, { observation: out.observation, result: out.result, done: out.done });
      }
      if (req.method === 'GET' && url.pathname === '/observe') return send(res, 200, { observation: env.observe() });
      if (req.method === 'GET' && url.pathname === '/grade') return send(res, 200, env.grade());
      return send(res, 404, { error: 'no such route' });
    } catch (err) {
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

/**
 * `node scripts/agent-env.mjs --port 8810`: the engine's .wasm read from disk. With `--watch`, this runs in a worker
 * (the launcher's), its pages' sockets relayed over `workerData.port`.
 */
export function main(args: string[]) {
  const port = Number(args[args.indexOf('--port') + 1] ?? 8810) || 8810;
  const wd = workerData as { port?: MessagePort; speed?: number; camera?: 'eyes' | 'chase' } | null;
  const watch = wd?.port ? new Watch(wd.port, wd.speed ?? 1, wd.camera ?? 'eyes') : undefined;
  serve(port, readFileSync('engine/pkg/voxel_engine_bg.wasm'), watch);
  console.log(`MARM agent environment on http://127.0.0.1:${port} (tasks: ${TASKS.map((t) => t.id).join(', ')})`);
}
