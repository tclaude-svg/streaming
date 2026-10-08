// Rebuilds the live site only when the database has changed since the last build.
// Run on a schedule by .github/workflows/rebuild.yml (see docs/ADMIN.md, "Automatic rebuilds").
//
// Needs: CF_DEPLOY_HOOK (Cloudflare Pages deploy hook URL). The database address and public key come
// from site.config.json; SUPABASE_URL / SUPABASE_ANON_KEY override them if set.
// Optional: SITE_URL (defaults to siteUrl in site.config.json), DRY_RUN=1 to only report.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSupabaseGames } from '../src/data.js';
import { gamesSignature } from './signature.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const { CF_DEPLOY_HOOK, DRY_RUN } = process.env;
const SUPABASE_URL = process.env.SUPABASE_URL || cfg.supabase?.url;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || cfg.supabase?.anonKey;
const siteUrl = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('No database configured (SUPABASE_URL / SUPABASE_ANON_KEY); nothing to check.');
  process.exit(0);
}

const games = await fetchSupabaseGames({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
const current = gamesSignature(games);

let deployed = null;
try {
  const r = await fetch(`${siteUrl}/build-sig.json`, { cache: 'no-store' });
  if (r.ok) deployed = (await r.json()).games;
} catch { /* site unreachable: treat as changed */ }

if (deployed === current) {
  console.log(`Up to date (${games.length} games).`);
  process.exit(0);
}

console.log(`Database changed since the last build (${deployed ? 'signature differs' : 'no signature on the live site'}).`);
if (DRY_RUN) { console.log('DRY_RUN set: not triggering a build.'); process.exit(0); }
if (!CF_DEPLOY_HOOK) { console.error('CF_DEPLOY_HOOK is not set; cannot trigger a build.'); process.exit(1); }

const r = await fetch(CF_DEPLOY_HOOK, { method: 'POST' });
if (!r.ok) { console.error(`Deploy hook failed (${r.status}).`); process.exit(1); }
console.log('Rebuild triggered.');
