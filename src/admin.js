// Staff admin: add games, paste stream links, mark a game live, update the score.
//
// Two back ends behind the same small interface (load / save / remove):
//   - Preview mode (default): changes live in this browser only; "Download games.json" exports them.
//   - Database mode: Supabase email sign-in plus the `games` table (see supabase/schema.sql and
//     docs/ADMIN.md). Enabled by putting the project URL and anon key in site.config.json.
import S from './strings.js';
import * as R from './render.js';
import {
  loadConfig, loadTeams, staticGames, hasBackend, fromRow, toRow,
  parseYouTubeId, toTashkentInput, fromTashkentInput, makeId, isSafeCover
} from './data.js';

const T = S.admin;
const { esc } = R;
let root; // the element the admin renders into (set by mountAdmin)

/* ---------- back ends ---------- */

function previewBackend() {
  const KEY = 'tis-owls-admin-draft-v1';
  let all = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private browsing */ } };
  return {
    mode: 'preview',
    signedIn: () => true,
    async load() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignore */ }
      all = Array.isArray(saved) ? saved : await staticGames();
      return all.map((g) => ({ ...g }));
    },
    async save(g) {
      const i = all.findIndex((x) => x.id === g.id);
      if (i >= 0) all[i] = { ...g }; else all.push({ ...g });
      persist();
    },
    async remove(id) { all = all.filter((x) => x.id !== id); persist(); },
    async reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } return this.load(); },
    download() {
      const doc = {
        _note: 'Times are Tashkent time (UTC+5). status: scheduled | live | final. All MVP games are home games, so the Owls are always home. streamId/replayId are YouTube video IDs.',
        games: [...all].sort(R.byStart)
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'games.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };
}

function databaseBackend(sb) {
  const SESSION_KEY = 'tis-owls-admin-session';
  const base = sb.url.replace(/\/$/, '');
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* ignore */ }

  const headers = (token) => ({ apikey: sb.anonKey, 'Content-Type': 'application/json', Authorization: `Bearer ${token || sb.anonKey}` });
  const keep = (s) => { session = s; try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

  async function authRequest(grant, body) {
    const r = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `status ${r.status}`);
    keep({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + Math.max(30, (j.expires_in || 3600) - 60) * 1000,
      email: j.user?.email || ''
    });
  }

  async function token() {
    if (!session) throw new Error('signed-out');
    if (Date.now() > session.expires_at) {
      try { await authRequest('refresh_token', { refresh_token: session.refresh_token }); } catch { keep(null); throw new Error('signed-out'); }
    }
    return session.access_token;
  }

  async function rest(path, opts = {}) {
    const r = await fetch(`${base}/rest/v1/${path}`, { ...opts, headers: { ...headers(await token()), ...(opts.headers || {}) } });
    if (r.status === 401) { keep(null); throw new Error('signed-out'); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || `status ${r.status}`);
    }
    return r.json().catch(() => null);
  }

  return {
    mode: 'database',
    signedIn: () => Boolean(session),
    email: () => session?.email || '',
    signIn: (email, password) => authRequest('password', { email, password }),
    signOut: () => keep(null),
    async load() { return (await rest('games?select=*&order=start.asc')).map(fromRow); },
    save: (g) => rest('games?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(toRow(g)) }),
    remove: (id) => rest(`games?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  };
}

/* ---------- state ---------- */

let backend;
let games = [];
let teamsList = [];
let teams = {};
let view = { name: 'list', id: null };
let message = '';
let formError = null;
let signInError = '';
const timers = {};

const teamOf = (g) => teams[g.team];
const titleOf = (g) => R.gameTitle(g);
const whenOf = (g) => `${R.dayLabel(g.start)} · ${R.timeLabel(g.start)}`;
const ytUrl = (id) => (id ? `https://www.youtube.com/watch?v=${id}` : '');

function setMessage(text) {
  message = text;
  const el = document.getElementById('adm-msg');
  if (el) el.textContent = text;
}

function handleError(e, prefix = T.saveFailed) {
  if (e.message === 'signed-out') { view = { name: 'list', id: null }; render(); return; }
  setMessage(`${prefix} ${e.message}`);
}

/* ---------- views ---------- */

function topBar() {
  const mode = backend.mode === 'preview'
    ? `<span class="adm-mode">${T.modePreview}</span>`
    : `<span class="adm-mode">${T.modeSignedIn} ${esc(backend.email())}</span>`;
  const tools = backend.mode === 'preview'
    ? `<button class="btn btn-ghost" type="button" data-act="download">${T.download}</button><button class="btn btn-ghost" type="button" data-act="reset">${T.reset}</button>`
    : `<button class="btn btn-ghost" type="button" data-act="signout">${T.signOut}</button>`;
  return `<div class="adm-top">
  <div><h1 class="page-title">${T.title}</h1><p class="adm-modeline">${mode}</p></div>
  <div class="adm-tools"><button class="btn btn-primary" type="button" data-act="new">${T.add}</button>${tools}</div>
</div>
${backend.mode === 'preview' ? `<p class="adm-note">${T.previewNote}</p>` : ''}
<p id="adm-msg" class="adm-msg" role="status" aria-live="polite">${esc(message)}</p>`;
}

function stepper(g, side) {
  const isHome = side === 'home';
  const name = isHome ? S.owls : g.opponent;
  const val = (isHome ? g.homeScore : g.awayScore) ?? 0;
  return `<div class="adm-side">
  <span class="adm-side-name">${esc(name)}</span>
  <div class="adm-stepper">
    <button type="button" class="adm-step" data-act="score" data-id="${esc(g.id)}" data-side="${side}" data-delta="-1" aria-label="${esc(name)} ${T.scoreDown}">−</button>
    <output class="adm-num" data-out="${side}" aria-label="${esc(name)} score">${val}</output>
    <button type="button" class="adm-step" data-act="score" data-id="${esc(g.id)}" data-side="${side}" data-delta="1" aria-label="${esc(name)} ${T.scoreUp}">+</button>
  </div>
</div>`;
}

function card(g) {
  const t = teamOf(g);
  const live = g.status === 'live';
  const final = g.status === 'final';
  const link = live ? (g.streamId ? '' : T.noStream) : final ? (g.replayId ? '' : T.noReplay) : '';
  const score = final ? `<b class="adm-final">${g.homeScore ?? '–'}<i>–</i>${g.awayScore ?? '–'}</b>` : '';
  return `<article class="adm-card${live ? ' is-live' : ''}" data-id="${esc(g.id)}">
  <div class="adm-card-head">
    <div>
      <p class="eyebrow">${live ? R.liveBadge() : ''}${esc(t ? R.teamLabelLong(t) : g.team)}</p>
      <h3 class="adm-title">${esc(titleOf(g))}</h3>
      <p class="meta">${esc(whenOf(g))} · ${esc(g.venue)}${link ? ` · <span class="adm-warn">${link}</span>` : ''}</p>
    </div>
    ${score}
  </div>
  ${live ? `<div class="adm-score">${stepper(g, 'home')}${stepper(g, 'away')}</div>` : ''}
  <div class="adm-actions">
    ${g.status === 'scheduled' ? `<button class="btn btn-primary" type="button" data-act="golive" data-id="${esc(g.id)}">${T.goLive}</button>` : ''}
    ${live ? `<button class="btn btn-primary" type="button" data-act="end" data-id="${esc(g.id)}">${T.endGame}</button>` : ''}
    <button class="btn btn-ghost" type="button" data-act="edit" data-id="${esc(g.id)}">${T.edit}</button>
    <a class="btn btn-ghost" href="${R.gameUrl(g)}" target="_blank" rel="noopener">${T.openPage}</a>
  </div>
</article>`;
}

function listView() {
  const live = games.filter((g) => g.status === 'live').sort(R.byStart);
  const ups = games.filter((g) => g.status === 'scheduled').sort(R.byStart);
  const fin = R.finished(games);
  const block = (title, list) =>
    `<section class="section"><div class="section-head"><h2>${title}</h2></div><div class="adm-list">${list.map(card).join('') || `<p class="empty">${T.none}</p>`}</div></section>`;
  return `${topBar()}${live.length ? block(T.sections.live, live) : ''}${block(T.sections.upcoming, ups)}${block(T.sections.finished, fin)}`;
}

function field(label, control, { help = '', error = '', id }) {
  return `<div class="adm-field${error ? ' has-error' : ''}">
  <label for="${id}">${label}</label>
  ${control}
  ${help ? `<p class="adm-help" id="${id}-help">${help}</p>` : ''}
  ${error ? `<p class="adm-error" id="${id}-err" role="alert">${error}</p>` : ''}
</div>`;
}

function formView() {
  const existing = view.id ? games.find((g) => g.id === view.id) : null;
  const e = formError?.errors || {};
  const v = formError?.values || (existing
    ? {
        team: existing.team, opponent: existing.opponent, venue: existing.venue, start: toTashkentInput(existing.start), status: existing.status,
        homeScore: existing.homeScore ?? '', awayScore: existing.awayScore ?? '', stream: ytUrl(existing.streamId), replay: ytUrl(existing.replayId), cover: existing.cover || ''
      }
    : { team: teamsList[0]?.slug, opponent: '', venue: 'Home field', start: '', status: 'scheduled', homeScore: '', awayScore: '', stream: '', replay: '', cover: '' });
  const input = (id, type, value, extra = '') =>
    `<input class="adm-input" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}>`;
  const teamOptions = teamsList.map((t) => `<option value="${t.slug}"${t.slug === v.team ? ' selected' : ''}>${esc(R.teamLabelLong(t))}</option>`).join('');
  const statusOptions = ['scheduled', 'live', 'final'].map((k) => `<option value="${k}"${k === v.status ? ' selected' : ''}>${S.status[k]}</option>`).join('');
  const F = T.form;
  return `<div class="adm-top"><div><p class="crumb"><a href="#" data-act="cancel">← ${T.title}</a></p><h1 class="page-title">${existing ? F.editTitle : F.newTitle}</h1></div></div>
<p id="adm-msg" class="adm-msg" role="status" aria-live="polite">${esc(message)}</p>
<form class="adm-form" novalidate data-form>
  ${field(F.team, `<select class="adm-input" id="team" name="team">${teamOptions}</select>`, { id: 'team' })}
  ${field(F.opponent, input('opponent', 'text', v.opponent, `required maxlength="80" autocomplete="off"${e.opponent ? ' aria-invalid="true" aria-describedby="opponent-err"' : ''}`), { id: 'opponent', error: e.opponent })}
  ${field(F.venue, input('venue', 'text', v.venue, 'maxlength="80"'), { id: 'venue' })}
  ${field(F.start, input('start', 'datetime-local', v.start, `required${e.start ? ' aria-invalid="true" aria-describedby="start-err"' : ''}`), { id: 'start', error: e.start })}
  ${field(F.status, `<select class="adm-input" id="status" name="status">${statusOptions}</select>`, { id: 'status' })}
  <div class="adm-pair">
    ${field(F.homeScore, input('homeScore', 'number', v.homeScore, `min="0" step="1" inputmode="numeric"${e.score ? ' aria-invalid="true"' : ''}`), { id: 'homeScore', error: e.score })}
    ${field(F.awayScore, input('awayScore', 'number', v.awayScore, 'min="0" step="1" inputmode="numeric"'), { id: 'awayScore' })}
  </div>
  ${field(F.stream, input('stream', 'text', v.stream, `inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=…"${e.stream ? ' aria-invalid="true" aria-describedby="stream-err"' : ' aria-describedby="stream-help"'}`), { id: 'stream', help: F.streamHelp, error: e.stream })}
  ${field(F.replay, input('replay', 'text', v.replay, `inputmode="url" autocomplete="off" placeholder="https://youtu.be/…"${e.replay ? ' aria-invalid="true" aria-describedby="replay-err"' : ' aria-describedby="replay-help"'}`), { id: 'replay', help: F.replayHelp, error: e.replay })}
  ${field(F.cover, input('cover', 'text', v.cover, `inputmode="url" autocomplete="off" maxlength="500"${e.cover ? ' aria-invalid="true" aria-describedby="cover-err"' : ''}`), { id: 'cover', error: e.cover })}
  <div class="adm-actions adm-form-actions">
    <button class="btn btn-primary" type="submit">${F.save}</button>
    <button class="btn btn-ghost" type="button" data-act="cancel">${F.cancel}</button>
    ${existing ? `<button class="btn btn-danger" type="button" data-act="delete" data-id="${esc(existing.id)}">${F.remove}</button>` : ''}
  </div>
</form>`;
}

function signInView() {
  return `<div class="adm-signin">
  <h1 class="page-title">${T.signInTitle}</h1>
  <form class="adm-form" novalidate data-signin>
    ${field(T.email, `<input class="adm-input" id="email" name="email" type="email" autocomplete="username" required>`, { id: 'email' })}
    ${field(T.password, `<input class="adm-input" id="password" name="password" type="password" autocomplete="current-password" required>`, { id: 'password' })}
    ${signInError ? `<p class="adm-error" role="alert">${esc(signInError)}</p>` : ''}
    <div class="adm-actions"><button class="btn btn-primary" type="submit">${T.signIn}</button></div>
  </form>
</div>`;
}

function render() {
  if (backend.mode === 'database' && !backend.signedIn()) root.innerHTML = signInView();
  else root.innerHTML = view.name === 'form' ? formView() : listView();
  const first = root.querySelector('[aria-invalid="true"]') || (view.name === 'form' ? root.querySelector('#opponent') : null);
  if (first && formError) first.focus();
}

/* ---------- actions ---------- */

async function persist(g, okMessage = T.saved) {
  setMessage(T.saving);
  try { await backend.save(g); setMessage(okMessage); } catch (e) { handleError(e); }
}

function bumpScore(id, side, delta) {
  const g = games.find((x) => x.id === id);
  if (!g) return;
  const key = side === 'home' ? 'homeScore' : 'awayScore';
  g[key] = Math.max(0, (g[key] ?? 0) + delta);
  const out = root.querySelector(`[data-id="${CSS.escape(id)}"] [data-out="${side}"]`);
  if (out) out.textContent = String(g[key]);
  setMessage(T.saving);
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => persist(g), 400);
}

async function setStatus(id, status, hint) {
  const g = games.find((x) => x.id === id);
  if (!g) return;
  clearTimeout(timers[id]);
  g.status = status;
  g.homeScore ??= 0;
  g.awayScore ??= 0;
  render();
  await persist(g, hint);
}

function readForm(form) {
  const f = new FormData(form);
  const val = (k) => String(f.get(k) ?? '').trim();
  const errors = {};
  const values = Object.fromEntries(['team', 'opponent', 'venue', 'start', 'status', 'homeScore', 'awayScore', 'stream', 'replay', 'cover'].map((k) => [k, val(k)]));
  if (!values.opponent) errors.opponent = T.errors.opponent;
  if (!values.start || Number.isNaN(new Date(fromTashkentInput(values.start)).getTime())) errors.start = T.errors.start;
  const streamId = parseYouTubeId(values.stream);
  const replayId = parseYouTubeId(values.replay);
  if (streamId === null) errors.stream = T.errors.youtube;
  if (replayId === null) errors.replay = T.errors.youtube;
  if (values.cover && !isSafeCover(values.cover)) errors.cover = T.errors.cover;
  const score = (s) => (s === '' ? null : /^\d{1,3}$/.test(s) ? Number(s) : NaN);
  const homeScore = score(values.homeScore);
  const awayScore = score(values.awayScore);
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) errors.score = T.errors.score;
  return { errors, values, data: { homeScore, awayScore, streamId: streamId || null, replayId: replayId || null } };
}

async function submitForm(form) {
  const { errors, values, data } = readForm(form);
  if (Object.keys(errors).length) { formError = { errors, values }; render(); return; }
  formError = null;
  const existing = view.id ? games.find((g) => g.id === view.id) : null;
  const next = {
    ...(existing || {}),
    team: values.team,
    opponent: values.opponent,
    venue: values.venue || 'Home field',
    start: fromTashkentInput(values.start),
    status: values.status,
    ...data,
    cover: values.cover || null
  };
  if (next.status === 'live' || next.status === 'final') { next.homeScore ??= 0; next.awayScore ??= 0; }
  next.id = existing ? existing.id : makeId(next, games.map((g) => g.id));
  setMessage(T.saving);
  try {
    await backend.save(next);
    if (existing) Object.assign(existing, next); else games.push(next);
    view = { name: 'list', id: null };
    message = T.saved;
    render();
  } catch (e) { handleError(e); }
}

async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  if (act === 'cancel') { e.preventDefault(); formError = null; view = { name: 'list', id: null }; message = ''; render(); }
  else if (act === 'new') { formError = null; view = { name: 'form', id: null }; message = ''; render(); }
  else if (act === 'edit') { formError = null; view = { name: 'form', id }; message = ''; render(); }
  else if (act === 'score') bumpScore(id, el.dataset.side, Number(el.dataset.delta));
  else if (act === 'golive') await setStatus(id, 'live', T.liveHint);
  else if (act === 'end') await setStatus(id, 'final', T.endedHint);
  else if (act === 'delete') {
    if (!confirm(T.form.removeConfirm)) return;
    try { await backend.remove(id); games = games.filter((g) => g.id !== id); view = { name: 'list', id: null }; message = T.saved; render(); } catch (err) { handleError(err); }
  } else if (act === 'download') backend.download();
  else if (act === 'reset') {
    if (!confirm(T.resetConfirm)) return;
    games = await backend.reset();
    message = '';
    render();
  } else if (act === 'signout') { backend.signOut(); signInError = ''; render(); }
}

async function onSubmit(e) {
  e.preventDefault();
  if (e.target.matches('[data-form]')) await submitForm(e.target);
  else if (e.target.matches('[data-signin]')) {
    const f = new FormData(e.target);
    try {
      await backend.signIn(String(f.get('email')).trim(), String(f.get('password')));
      signInError = '';
      root.textContent = T.loading;
      games = await backend.load();
      view = { name: 'list', id: null };
      message = '';
    } catch (err) { signInError = `${T.signInFailed} ${err.message}`; }
    render();
  }
}

/* ---------- boot ---------- */

async function boot() {
  root.textContent = T.loading;
  try {
    const cfg = await loadConfig();
    teamsList = await loadTeams();
    teams = R.teamMap(teamsList);
    backend = hasBackend(cfg) ? databaseBackend(cfg.supabase) : previewBackend();
    if (backend.signedIn()) games = await backend.load();
    render();
  } catch (e) {
    if (backend?.mode === 'database' && e.message === 'signed-out') { render(); return; }
    root.innerHTML = `<p class="adm-error" role="alert">${esc(`${T.loadFailed} ${e.message}`)}</p>`;
  }
}

export function mountAdmin(el) {
  root = el;
  backend = undefined;
  games = [];
  view = { name: 'list', id: null };
  message = '';
  formError = null;
  signInError = '';
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return boot();
}

// On the real /admin/ page the element exists at load time; the preview bundle mounts it itself.
const adminRoot = typeof document === 'undefined' ? null : document.getElementById('admin-root');
if (adminRoot && !globalThis.__TIS_PREVIEW__) mountAdmin(adminRoot);
