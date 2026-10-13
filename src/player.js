// Player login (placeholder). Players sign in to see their own statistics.
//
// Not linked from the public site: the live streams, schedule and replays stay open to everyone
// without an account. Statistics are not built yet; the stat tiles below show "—" until the
// `player_stats` table (supabase/schema.sql) is filled and wired up here.
import S from './strings.js';
import * as R from './render.js';
import { loadConfig, hasBackend } from './data.js';

const T = S.player;
const { esc } = R;
const SESSION_KEY = 'tis-owls-player-session';

// The statistics a player will see. Keys match the columns planned for `player_stats`.
export const STAT_KEYS = ['points', 'assists', 'rebounds', 'steals', 'blocks', 'games'];

let root;
let sb = null;
let session = null;
let error = '';

async function signIn(email, password) {
  const base = sb.url.replace(/\/$/, '');
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `status ${r.status}`);
  session = { access_token: j.access_token, email: j.user?.email || email };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private browsing */ }
}

function signOut() {
  session = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function statsView(email, stats = {}) {
  const tiles = STAT_KEYS.map((k) => `<div class="adm-field"><p class="adm-help">${esc(T.stats[k])}</p><p class="page-title">${esc(stats[k] ?? '—')}</p></div>`).join('');
  return `<div class="adm-top"><div><h1 class="page-title">${T.statsTitle}</h1><p class="lede">${T.signedInAs} ${esc(email)}</p></div>
  <div class="adm-actions"><button class="btn btn-ghost" type="button" data-act="signout">${T.signOut}</button></div></div>
<p class="adm-msg">${T.statsComingSoon}</p>
<div class="adm-pair">${tiles}</div>`;
}

export function signInView({ enabled }) {
  const dis = enabled ? '' : ' disabled';
  return `<div class="adm-signin">
  <h1 class="page-title">${T.signInTitle}</h1>
  <p class="lede">${T.intro}</p>
  ${enabled ? '' : `<p class="adm-msg">${T.notReady}</p>`}
  <form class="adm-form" novalidate data-signin>
    <div class="adm-field"><label for="email">${T.email}</label><input class="adm-input" id="email" name="email" type="email" autocomplete="username" required${dis}></div>
    <div class="adm-field"><label for="password">${T.password}</label><input class="adm-input" id="password" name="password" type="password" autocomplete="current-password" required${dis}></div>
    ${error ? `<p class="adm-error" role="alert">${esc(`${T.signInFailed} ${error}`)}</p>` : ''}
    <div class="adm-actions"><button class="btn btn-primary" type="submit"${dis}>${T.signIn}</button></div>
  </form>
  <p class="adm-help">${T.publicNote}</p>
</div>`;
}

function render() {
  root.innerHTML = session ? statsView(session.email) : signInView({ enabled: Boolean(sb) });
}

export async function mountPlayer(el) {
  root = el;
  const cfg = await loadConfig();
  sb = hasBackend(cfg) ? cfg.supabase : null;
  try { session = sb ? JSON.parse(sessionStorage.getItem(SESSION_KEY)) : null; } catch { session = null; }
  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-signin]') || !sb) return;
    e.preventDefault();
    const f = new FormData(e.target);
    try { await signIn(String(f.get('email')).trim(), String(f.get('password'))); error = ''; } catch (err) { error = err.message; }
    render();
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="signout"]')) { signOut(); render(); }
  });
  render();
}

const playerRoot = typeof document === 'undefined' ? null : document.getElementById('player-root');
if (playerRoot) mountPlayer(playerRoot);
