# MARM: Multi-agent Rust in Minecraft

A Minecraft-style survival world in the browser, by Sean Hardesty Lewis. You mine with tools of five tiers,
craft at a 2×2 grid and a crafting table, smelt in furnaces, carry water and lava in buckets, light a
Nether portal with flint and steel, and find a stronghold with eyes of ender to go to the End. Mobs come
out at night for anyone playing survival.

Play it at **https://marmcraft.github.io**.

- **Singleplayer** runs entirely in the page. The world, your inventory and where you were are kept in
  this browser's localStorage.
- **Multiplayer** connects to a game server run on our own PC, reached through a Cloudflare quick
  tunnel. Its address is the one setting in `source/src/server-settings.ts`.

## This repository

- The site itself, built (`index.html`, `assets/`): what GitHub Pages serves.
- `source/`: the code. A Rust voxel engine compiled to WebAssembly (`source/engine`), the TypeScript
  platform (`source/src/platform`) and the world (`source/src/games/sandbox`).

## Running it

Node 22.13 or newer, Rust with `wasm-pack`.

```bash
cd source
npm install
npm run dev
```

The multiplayer server and its tunnel (needs `cloudflared`), writing the tunnel's address into the
settings; then rebuild (`npm run build`) and publish the site:

```bash
npm run multiplayer -- --write
```
