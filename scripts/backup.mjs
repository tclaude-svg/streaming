// Saves the games from the database to backups/games-<date>.json, in the same shape as data/games.json,
// so a lost or broken database can be refilled (or the site built from the file).
// Run weekly by .github/workflows/backup.yml. Uses the public key, so it saves what visitors can see:
// hidden (taken-down) games, the staff list and the change history are not included.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSupabaseGames } from '../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const url = process.env.SUPABASE_URL || cfg.supabase?.url;
const anonKey = process.env.SUPABASE_ANON_KEY || cfg.supabase?.anonKey;
if (!url || !anonKey) { console.error('No database configured; nothing to back up.'); process.exit(1); }

const games = await fetchSupabaseGames({ url, anonKey });
const day = new Date().toISOString().slice(0, 10);
const out = join(root, 'backups', `games-${day}.json`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({
  _note: `Backup of ${games.length} games taken ${new Date().toISOString()} from ${url}. Same shape as data/games.json; times are Tashkent time.`,
  games
}, null, 2) + '\n');
console.log(`Saved ${games.length} games to backups/games-${day}.json`);
