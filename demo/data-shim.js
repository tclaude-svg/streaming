// Replaces src/data.js inside the single-file preview: no network, sample data, and the same
// browser draft the admin writes to, so what staff change in the admin shows on the public pages.
export * from '../src/data.js';
import sample from '../data/games.json';
import teamList from '../data/teams.json';

export const DRAFT_KEY = 'tis-owls-admin-draft-v1';
const DAY = 86400000;

export const loadConfig = async () => ({ name: 'TIS Owls Live', siteUrl: 'https://live.tashschool.org' });
export const loadTeams = async () => teamList.map((t) => ({ ...t }));

// Sample fixtures, moved in whole days so the next game is always about two days away.
export async function staticGames() {
  const games = sample.games.map((g) => ({ ...g }));
  const next = games.filter((g) => g.status === 'scheduled').sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  if (!next) return games;
  const shift = Math.round((Date.now() + 2 * DAY - new Date(next.start)) / DAY) * DAY;
  return games.map((g) => ({ ...g, start: new Date(new Date(g.start).getTime() + shift).toISOString() }));
}

export async function loadGames() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (Array.isArray(saved)) return saved;
  } catch { /* no draft yet */ }
  return staticGames();
}

export function saveDraft(games) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(games)); } catch { /* private browsing */ }
}
export function resetDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
