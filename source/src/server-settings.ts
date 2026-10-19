/**
 * SERVER SETTINGS
 *
 * Where Multiplayer connects: the game server running on our own PC, reached through a Cloudflare quick tunnel.
 * `npm run multiplayer -- --write` starts both (the server on port 8798, `cloudflared tunnel --url
 * http://localhost:8798` in front of it) and writes the tunnel's address here (wss://<words>.trycloudflare.com);
 * then rebuild and publish the site. A quick tunnel's address changes each time cloudflared starts, so this
 * changes with it.
 *
 * Singleplayer needs none of this: it runs in the page.
 */
export const MULTIPLAYER_SERVER = 'wss://drug-effectively-nearly-rotary.trycloudflare.com';
