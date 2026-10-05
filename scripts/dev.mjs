// Tiny dev server: builds, serves dist/ on http://localhost:3000, rebuilds on changes.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const port = process.env.PORT || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ics': 'text/calendar', '.txt': 'text/plain' };

const build = () => spawnSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
build();
let t;
for (const dir of ['src', 'data']) watch(join(root, dir), { recursive: true }, () => { clearTimeout(t); t = setTimeout(build, 150); });

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, p);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* fall through */ }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`Dev server: http://localhost:${port}`));
