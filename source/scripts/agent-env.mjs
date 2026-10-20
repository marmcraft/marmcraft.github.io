#!/usr/bin/env node
// MARM's agent environment over HTTP (src/agent/server.ts), for the Python agent (agent/). Vite's SSR loader
// compiles the TypeScript and resolves @platform / @engine the same way the dev server does.
//
//   node --disable-warning=ExperimentalWarning scripts/agent-env.mjs --port 8810
//
// Watch mode (src/agent/watch.ts), to show an episode on MARM's client and record it:
//
//   node --disable-warning=ExperimentalWarning scripts/agent-env.mjs --port 8812 --watch 8813 [--speed 1] [--camera eyes|chase]
//
// The environment then runs in a worker thread (it blocks while an action plays out); this thread keeps the pages'
// sockets (ws://127.0.0.1:8813/sandbox: open the dev site in multiplayer with ?server=ws://127.0.0.1:8813) and
// takes their recordings (POST /media?name=<file>.webm, saved in agent/media/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { MessageChannel, Worker, isMainThread, workerData } from 'node:worker_threads';
import { createServer } from 'vite';

const args = isMainThread ? process.argv.slice(2) : workerData.args;
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const watchPort = Number(flag('--watch', 0));

if (isMainThread && watchPort) {
  const { WebSocketServer } = await import('ws');
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL(import.meta.url), { workerData: { args, port: port2, speed: Number(flag('--speed', 1)), camera: flag('--camera', 'eyes') }, transferList: [port2] });
  worker.on('error', (err) => {
    console.error(err);
    process.exit(3);
  });
  worker.on('exit', (code) => process.exit(code || 3));
  const sockets = new Map();
  port1.on('message', (m) => {
    const ws = sockets.get(m.c);
    if (!ws) return;
    if (m.t === 'send') ws.send(m.text);
    else ws.close(4000, m.reason);
  });
  const http = createHttp((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/media') {
      const name = (url.searchParams.get('name') ?? `episode-${Date.now()}.webm`).replace(/[^\w.-]/g, '_');
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => {
        mkdirSync('agent/media', { recursive: true });
        const data = Buffer.concat(parts);
        writeFileSync(`agent/media/${name}`, data);
        console.log(`saved agent/media/${name} (${(data.length / 1e6).toFixed(1)} MB)`);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ saved: `agent/media/${name}`, bytes: data.length }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http });
  let next = 1;
  wss.on('connection', (ws) => {
    const c = `w${next++}`;
    sockets.set(c, ws);
    port1.postMessage({ t: 'connect', c });
    ws.on('message', (d) => port1.postMessage({ t: 'command', c, text: String(d) }));
    ws.on('close', () => {
      sockets.delete(c);
      port1.postMessage({ t: 'disconnect', c });
    });
  });
  http.listen(watchPort, '127.0.0.1', () => console.log(`watch: ws://127.0.0.1:${watchPort} (pages), POST http://127.0.0.1:${watchPort}/media (recordings)`));
} else {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'warn',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { main } = await vite.ssrLoadModule('/src/agent/server.ts');
  main(args);
}
