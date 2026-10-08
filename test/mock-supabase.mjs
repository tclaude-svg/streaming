// Minimal stand-in for the Supabase endpoints the site uses, for local development and tests.
//   node test/mock-supabase.mjs            -> http://localhost:4010
//   SUPABASE_URL=http://localhost:4010 SUPABASE_ANON_KEY=anon npm run dev
// Logins (password "secret"): staff@test.org (admin), scorer@test.org (scorer), outsider@test.org (not staff).
// Reads are public (hidden games only for staff); writes need a signed-in token.
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
const staff = new Map([['staff@test.org', 'admin'], ['scorer@test.org', 'scorer']]);
const accounts = new Set(['staff@test.org', 'scorer@test.org', 'outsider@test.org']);
const signups = [];
const history = []; // mirrors public.game_history
const covers = new Map(); // name -> { type, bytes } (the "covers" storage folder)
const readRaw = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
let hid = 0;
const SCORE_KEYS = new Set(['home_score', 'away_score', 'updated_at']);
const same = (a, b, skip = new Set(['updated_at'])) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].every((k) => skip.has(k) || JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));
};
function logChange(who, oldRow, newRow) {
  let kind = !oldRow ? 'insert' : !newRow ? 'delete' : null;
  if (!kind) {
    if (same(oldRow, newRow)) return;
    kind = same(oldRow, newRow, SCORE_KEYS) ? 'score' : 'update';
  }
  const id = (newRow || oldRow).id;
  const last = [...history].reverse().find((h) => h.game_id === id);
  if (kind === 'score' && last && last.kind === 'score' && last.changed_by === who && Date.now() - Date.parse(last.changed_at) < 300000) {
    last.new_row = { ...newRow };
    last.changed_at = new Date().toISOString();
    return;
  }
  history.push({ id: (hid += 1), game_id: id, kind, changed_by: who, changed_at: new Date().toISOString(), old_row: oldRow ? { ...oldRow } : null, new_row: newRow ? { ...newRow } : null });
}
const tokens = new Map(); // token -> email
const log = [];
let n = 0;

const SCORER_FIELDS = new Set(['status', 'home_score', 'away_score', 'replay_id']);
const fillReplay = (r) => (r.status === 'final' && !r.replay_id && r.stream_id ? { ...r, replay_id: r.stream_id } : r);

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
const rls = (res) => send(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
const eqParam = (url, k) => (url.searchParams.get(k) || '').replace(/^eq\./, '');

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  log.push({ method: req.method, path: url.pathname + url.search, auth: auth.startsWith('tok-') ? 'user' : auth ? 'anon' : 'none' });

  if (url.pathname === '/__log') return send(res, 200, log);
  if (url.pathname === '/__rows') return send(res, 200, [...rows.values()]);
  if (url.pathname === '/__staff') return send(res, 200, Object.fromEntries(staff));
  if (url.pathname === '/__signups') return send(res, 200, signups);
  if (url.pathname === '/__history') return send(res, 200, history);
  if (url.pathname === '/__covers') return send(res, 200, [...covers].map(([name, f]) => ({ name, type: f.type, size: f.bytes.length })));

  const pub = /^\/storage\/v1\/object\/public\/covers\/([\w.-]+)$/.exec(url.pathname);
  if (pub && req.method === 'GET') {
    const f = covers.get(pub[1]);
    if (!f) return send(res, 404, { message: 'Object not found' });
    res.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin': '*' });
    return res.end(f.bytes);
  }

  if (url.pathname === '/auth/v1/token') {
    const b = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    let email;
    if (grant === 'password') {
      if (!accounts.has(b.email) || b.password !== 'secret') return send(res, 400, { error_description: 'Invalid login credentials' });
      email = b.email;
    } else if (grant === 'refresh_token') {
      const m = /^refresh-(.+)$/.exec(b.refresh_token || '');
      if (!m || !accounts.has(m[1])) return send(res, 400, { error_description: 'Invalid refresh token' });
      email = m[1];
    } else return send(res, 400, { error_description: 'unsupported grant' });
    const t = `tok-${(n += 1)}`;
    tokens.set(t, email);
    return send(res, 200, { access_token: t, refresh_token: `refresh-${email}`, expires_in: Number(process.env.MOCK_EXPIRES || 3600), user: { email } });
  }

  if (url.pathname === '/auth/v1/signup') {
    const b = await readBody(req);
    const email = String(b.email || '').toLowerCase();
    if (!staff.has(email)) return send(res, 500, { code: 500, msg: 'Database error saving new user' });
    signups.push(email);
    return send(res, 200, { id: `user-${email}`, email, confirmation_sent_at: new Date().toISOString() });
  }

  const me = tokens.get(auth) || null;
  const role = me ? staff.get(me) || null : null;

  const up = /^\/storage\/v1\/object\/covers\/([\w.-]+)$/.exec(url.pathname);
  if (up && req.method === 'POST') {
    const bytes = await readRaw(req);
    if (role !== 'admin') return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const type = req.headers['content-type'] || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return send(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
    if (bytes.length > 5242880) return send(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    if (covers.has(up[1])) return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    covers.set(up[1], { type, bytes });
    return send(res, 200, { Key: `covers/${up[1]}` });
  }

  if (url.pathname === '/rest/v1/rpc/staff_role') {
    if (!me) return send(res, 401, { code: 'PGRST301', message: 'JWT expired or invalid' });
    return send(res, 200, role);
  }

  if (url.pathname === '/rest/v1/games') {
    if (req.method === 'GET') {
      const all = [...rows.values()].filter((r) => role || !r.hidden);
      return send(res, 200, all.sort((a, b) => new Date(a.start) - new Date(b.start)));
    }
    if (!me) return send(res, 401, { message: 'JWT required' });
    if (req.method === 'POST') {
      if (role !== 'admin') return rls(res);
      const row = await readBody(req);
      if (!row.id || !row.opponent) return send(res, 400, { message: 'invalid row' });
      if (rows.has(row.id)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "games_pkey"' });
      rows.set(row.id, fillReplay({ hidden: false, ...row }));
      logChange(me, null, rows.get(row.id));
      return send(res, 201);
    }
    if (req.method === 'PATCH') {
      if (!role) return send(res, 204); // update policy matches no rows
      const id = eqParam(url, 'id');
      const old = rows.get(id);
      if (!old) return send(res, 204);
      const patch = await readBody(req);
      if (role === 'scorer') {
        for (const [k, v] of Object.entries(patch)) {
          if (!SCORER_FIELDS.has(k) && JSON.stringify(v ?? null) !== JSON.stringify(old[k] ?? null)) {
            return send(res, 400, { code: 'P0001', message: 'Scorers can only change the score, the game status and the replay link' });
          }
        }
      }
      rows.set(id, fillReplay({ ...old, ...patch, id }));
      logChange(me, old, rows.get(id));
      return send(res, 204);
    }
    if (req.method === 'DELETE') {
      const id = eqParam(url, 'id');
      if (role === 'admin' && rows.has(id)) { logChange(me, rows.get(id), null); rows.delete(id); }
      return send(res, 204);
    }
  }

  if (url.pathname === '/rest/v1/game_history') {
    if (!me) return send(res, 401, { message: 'JWT required' });
    if (req.method !== 'GET') return rls(res);
    if (role !== 'admin') return send(res, 200, []);
    return send(res, 200, [...history].sort((a, b) => b.changed_at.localeCompare(a.changed_at) || b.id - a.id).slice(0, 60));
  }

  if (url.pathname === '/rest/v1/staff') {
    if (!me) return send(res, 401, { message: 'JWT required' });
    if (req.method === 'GET') {
      if (role !== 'admin') return send(res, 200, []);
      return send(res, 200, [...staff].map(([email, r]) => ({ email, role: r })).sort((a, b) => a.email.localeCompare(b.email)));
    }
    if (role !== 'admin') return req.method === 'POST' ? rls(res) : send(res, 204);
    if (req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '');
      if (email !== email.toLowerCase().trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { code: '23514', message: 'new row violates check constraint "staff_email_check"' });
      if (staff.has(email)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "staff_pkey"' });
      staff.set(email, b.role === 'admin' ? 'admin' : 'scorer');
      return send(res, 201);
    }
    const email = eqParam(url, 'email');
    if (email === me || !staff.has(email)) return send(res, 204); // own row: policy matches nothing
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      if (b.role !== 'admin' && b.role !== 'scorer') return send(res, 400, { code: '23514', message: 'new row violates check constraint "staff_role_check"' });
      staff.set(email, b.role);
      return send(res, 204);
    }
    if (req.method === 'DELETE') { staff.delete(email); return send(res, 204); }
  }
  send(res, 404, { message: 'not found' });
}).listen(port, () => console.log(`Mock Supabase: http://localhost:${port}`));
