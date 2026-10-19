#!/usr/bin/env node
// MARM's multiplayer server, on this PC, reachable from anywhere through a Cloudflare quick tunnel:
// the game server (scripts/server.mjs) on --port (8798), and `cloudflared tunnel --url` in front of it.
// It prints the tunnel's address as the site wants it (wss://<words>.trycloudflare.com), to put in
// src/server-settings.ts (MULTIPLAYER_SERVER), or writes it there itself with --write. Ctrl+C stops both.
//
//   npm run multiplayer
//   npm run multiplayer -- --port 8798 --write
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const port = Number(flag('port', process.env.PORT ?? 8798));
const root = fileURLToPath(new URL('..', import.meta.url));
const settings = `${root}src/server-settings.ts`;

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/server.mjs', 'sandbox', '--port', String(port)], { cwd: root, stdio: 'inherit' });
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { cwd: root });

let said = false;
const watch = (chunk) => {
  const text = chunk.toString();
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || said) return;
  said = true;
  const wss = m[0].replace(/^https/, 'wss');
  console.log(`\n  MARM multiplayer is up: ${wss}\n  (the site's MULTIPLAYER_SERVER, in src/server-settings.ts)\n`);
  if (args.includes('--write')) {
    const src = readFileSync(settings, 'utf8').replace(/MULTIPLAYER_SERVER = '[^']*'/, `MULTIPLAYER_SERVER = '${wss}'`);
    writeFileSync(settings, src);
    console.log(`  written to ${settings}: rebuild and publish the site for it to use this one.\n`);
  }
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);
tunnel.on('error', (err) => {
  console.error(`cloudflared didn't start (${err.message}): install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`);
});

const stop = () => {
  tunnel.kill();
  server.kill('SIGINT');
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', () => (tunnel.kill(), process.exit(0)));
