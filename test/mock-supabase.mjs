// Minimal stand-in for the Supabase endpoints the site uses, for local development and tests.
//   node test/mock-supabase.mjs            -> http://localhost:4010
//   SUPABASE_URL=http://localhost:4010 SUPABASE_ANON_KEY=anon npm run dev
// Staff login: staff@test.org / secret. Reads are public; writes need a signed-in token.
// It mimics the rules of supabase/schema.sql, not Supabase itself.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { toRow } from '../src/data.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const seed = JSON.parse(await readFile(join(root, 'data/games.json'), 'utf8')).games;
const port = process.env.MOCK_PORT || 4010;

const rows = new Map(seed.map((g) => [g.id, toRow(g)]));
const tokens = new Set();
const log = [];
let n = 0;

const send = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d ? JSON.parse(d) : {})); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  log.push({ method: req.method, path: url.pathname + url.search, auth: auth.startsWith('tok-') ? 'user' : auth ? 'anon' : 'none' });

  if (url.pathname === '/__log') return send(res, 200, log);
  if (url.pathname === '/__rows') return send(res, 200, [...rows.values()]);

  if (url.pathname === '/auth/v1/token') {
    const b = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      if (b.email !== 'staff@test.org' || b.password !== 'secret') return send(res, 400, { error_description: 'Invalid login credentials' });
    } else if (grant === 'refresh_token') {
      if (b.refresh_token !== 'refresh-1') return send(res, 400, { error_description: 'Invalid refresh token' });
    } else return send(res, 400, { error_description: 'unsupported grant' });
    const t = `tok-${(n += 1)}`;
    tokens.add(t);
    return send(res, 200, { access_token: t, refresh_token: 'refresh-1', expires_in: Number(process.env.MOCK_EXPIRES || 3600), user: { email: 'staff@test.org' } });
  }

  if (url.pathname === '/rest/v1/games') {
    if (req.method === 'GET') return send(res, 200, [...rows.values()].sort((a, b) => new Date(a.start) - new Date(b.start)));
    if (!tokens.has(auth)) return send(res, 401, { message: 'new row violates row-level security policy for table "games"' });
    if (req.method === 'POST') {
      const row = await readBody(req);
      if (!row.id || !row.opponent) return send(res, 400, { message: 'invalid row' });
      rows.set(row.id, { ...rows.get(row.id), ...row });
      return send(res, 201);
    }
    if (req.method === 'DELETE') {
      rows.delete((url.searchParams.get('id') || '').replace(/^eq\./, ''));
      return send(res, 204);
    }
  }
  send(res, 404, { message: 'not found' });
}).listen(port, () => console.log(`Mock Supabase: http://localhost:${port}`));
