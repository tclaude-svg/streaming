// Data access shared by the public site, the admin area and the build script.
// No browser-only globals are touched at import time, so Node can import it too.

export const TZ = 'Asia/Tashkent';
const TZ_OFFSET = '+05:00'; // Tashkent has no daylight saving time

/* ---------- config and static files ---------- */

export async function loadConfig() {
  try {
    const r = await fetch('/config.json', { cache: 'no-store' });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

export const loadTeams = () => fetch('/data/teams.json', { cache: 'no-store' }).then((r) => r.json());
export const staticGames = () => fetch('/data/games.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => j.games);

/* ---------- Supabase rows <-> game objects ---------- */

// A cover image address is placed inside CSS url(...) on the page, so only plain https
// addresses are accepted: no spaces, quotes, parentheses, semicolons or backslashes.
// The same rule is enforced by the database (games_cover_check in supabase/schema.sql).
export const isSafeCover = (s) =>
  typeof s === 'string' && s.length <= 500 && /^https:\/\/[A-Za-z0-9._~:/?#@!$&*+,=%-]+$/.test(s);

export const fromRow = (r) => ({
  id: r.id, team: r.team, opponent: r.opponent, venue: r.venue, start: r.start, status: r.status,
  homeScore: r.home_score, awayScore: r.away_score, streamId: r.stream_id, replayId: r.replay_id,
  cover: isSafeCover(r.cover) ? r.cover : null, hidden: Boolean(r.hidden)
});

export const toRow = (g) => ({
  id: g.id, team: g.team, opponent: g.opponent, venue: g.venue, start: g.start, status: g.status,
  home_score: g.homeScore ?? null, away_score: g.awayScore ?? null,
  stream_id: g.streamId || null, replay_id: g.replayId || null, cover: g.cover || null, hidden: Boolean(g.hidden)
});

// Mirrors the database rule: a finished game with no replay link uses its live stream's video,
// because a YouTube live stream becomes its own replay.
export function withReplayFallback(g) {
  return g.status === 'final' && !g.replayId && g.streamId ? { ...g, replayId: g.streamId } : g;
}

export const isVisible = (g) => !g.hidden;

export const hasBackend = (cfg) => Boolean(cfg?.supabase?.url && cfg?.supabase?.anonKey);

// Public read (row level security allows SELECT for everyone).
export async function fetchSupabaseGames(sb) {
  const base = sb.url.replace(/\/$/, '');
  const r = await fetch(`${base}/rest/v1/games?select=*&order=start.asc`, {
    headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}` },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`Supabase read failed (${r.status})`);
  return (await r.json()).map(fromRow);
}

// Games for the public site: the database when configured, otherwise data/games.json.
export async function loadGames(cfg = {}) {
  if (hasBackend(cfg)) {
    try { return await fetchSupabaseGames(cfg.supabase); } catch { /* fall back to the static file */ }
  }
  return (await staticGames()).filter(isVisible);
}

/* ---------- YouTube links ---------- */

// '' for empty input, the 11-character video id for a recognised link or id, null when invalid.
export function parseYouTubeId(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = (u.pathname.match(/^\/(?:live|embed|shorts|v)\/([\w-]{11})/) || [])[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/* ---------- Tashkent time (admin form <-> stored ISO) ---------- */

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// ISO instant -> "YYYY-MM-DDTHH:mm" in Tashkent time, the value of a datetime-local input.
export function toTashkentInput(iso) {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// datetime-local value typed in Tashkent time -> ISO string with the +05:00 offset.
export const fromTashkentInput = (v) => `${v}:00${TZ_OFFSET}`;

/* ---------- ids ---------- */

export const slug = (s) =>
  String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Stable, readable id such as 2026-10-17-football-varsity-westbridge-academy. Never changes after creation.
export function makeId({ start, team, opponent }, existingIds = []) {
  const base = `${toTashkentInput(start).slice(0, 10)}-${team}-${slug(opponent) || 'game'}`;
  let id = base;
  for (let n = 2; existingIds.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}
