import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const cache = new Map();
const limits = new Map();
const TTL_MS = 10 * 60_000;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
const headers = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY'
};
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
}
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { 'Accept': 'application/json', 'User-Agent': 'minecraft-head-studio/0.1' } });
  if (!response.ok) throw Object.assign(new Error(response.status === 404 ? 'Minecraft player not found' : 'Minecraft service unavailable'), { status: response.status });
  return response.json();
}
async function loadSkin(name) {
  const nameLower = name.toLowerCase(), hit = cache.get(nameLower);
  if (hit && hit.expire > Date.now()) return hit;
  let account;
  try { account = await getJson(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`); }
  catch (e) {
    if (e.status === 404) throw e;
    account = await getJson(`https://api.mojang.com/users/profiles/minecraft/${name}`);
  }
  if (!/^[\da-f]{32}$/i.test(account?.id || '')) throw new Error('Unexpected player profile');
  const profile = await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${account.id}`);
  const entry = profile?.properties?.find(x => x.name === 'textures');
  if (typeof entry?.value !== 'string' || entry.value.length > 20000) throw new Error('Player skin texture missing');
  const parsed = JSON.parse(Buffer.from(entry.value, 'base64').toString('utf8'));
  const raw = parsed?.textures?.SKIN?.url;
  if (typeof raw !== 'string') throw new Error('Player has no skin texture');
  const skinUrl = raw.replace(/^http:\/\//, 'https://');
  // Only allow Mojang's known texture CDN to prevent arbitrary URL fetching.
  if (!/^https:\/\/textures\.minecraft\.net\/texture\/[\da-f]{32,128}$/i.test(skinUrl)) throw new Error('Unexpected skin URL host');
  const response = await fetch(skinUrl, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 2_000_000) throw new Error('Skin download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 2_000_000 || bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Downloaded skin is not a valid PNG');
  const result = { bytes, username: account.name || name, expire: Date.now() + TTL_MS };
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(nameLower, result);
  return result;
}
function permitted(ip) {
  const now = Date.now(); const entry = limits.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count++;
  limits.set(ip, entry);
  if (limits.size > 500) limits.clear();
  return entry.count <= 20;
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }));
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/health') return send(res, 200, JSON.stringify({ status: 'ok', version: '0.1.0' }));
    if (u.pathname.startsWith('/api/skin/')) {
      const name = decodeURIComponent(u.pathname.slice('/api/skin/'.length));
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return send(res, 400, JSON.stringify({ error: 'Enter a valid Java Edition username (3–16 letters, numbers or underscores)' }));
      if (!permitted(req.socket.remoteAddress || 'unknown')) return send(res, 429, JSON.stringify({ error: 'Too many skin lookups. Try again in a minute.' }));
      try {
        const result = await loadSkin(name);
        res.writeHead(200, { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'X-Minecraft-Username': result.username.replace(/[^A-Za-z0-9_]/g, '') });
        return res.end(req.method === 'HEAD' ? undefined : result.bytes);
      } catch (err) { return send(res, err.status === 404 ? 404 : 502, JSON.stringify({ error: err.message || 'Skin lookup failed' })); }
    }
    const files = new Map([['/','index.html'], ['/index.html','index.html'], ['/favicon.svg','favicon.svg'], ['/src/app.js','src/app.js'], ['/src/model.js','src/model.js'], ['/src/render.js','src/render.js'], ['/src/export.js','src/export.js'], ['/src/styles.css','src/styles.css']]);
    const rel = files.get(u.pathname);
    if (!rel) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    const target = path.join(root, rel);
    const bytes = await readFile(target);
    res.writeHead(200, { ...headers, 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': rel === 'index.html' ? 'no-store' : 'public, max-age=600' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (err) {
    console.error('Request failed:', err?.message);
    send(res, 500, JSON.stringify({ error: 'Internal server error' }));
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Minecraft Head Studio listening on :${port}`));
