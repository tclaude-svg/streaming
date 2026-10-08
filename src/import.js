// Fixture import: turns rows pasted from a spreadsheet (Excel, Google Sheets, Numbers) or a CSV file
// into games the admin can add in one go. Pure functions only, so Node tests can import this file.
//
// Columns, with or without a header row:
//   date, time, sport, level, opponent, venue (optional), stream link (optional)
// A single "team" column such as "Football Varsity" or "football-jv" can replace sport + level.
// Dates: 2026-10-17, 17/10/2026, 17.10.2026 or 17-10-2026 (day first; month first is recognised
// when the day is above 12). Times: 15:30, 3:30 pm, 1530. All times are Tashkent time.
import { parseYouTubeId, fromTashkentInput, makeId, slug } from './data.js';

/* ---------- splitting text into rows ---------- */

// Splits CSV/TSV text into rows of cells. Handles quoted cells ("a, b", "say ""hi""") and line breaks inside quotes.
export function splitRows(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n').find((l) => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((x) => x !== ''));
}

/* ---------- columns ---------- */

const HEADERS = {
  date: ['date', 'day', 'game date', 'match date'],
  time: ['time', 'start', 'start time', 'kick off', 'kickoff', 'tip off', 'tipoff'],
  sport: ['sport'],
  level: ['level', 'division', 'squad'],
  team: ['team', 'sport and level', 'sport/level'],
  opponent: ['opponent', 'opponents', 'vs', 'against', 'away team', 'versus'],
  venue: ['venue', 'location', 'place', 'field', 'court'],
  stream: ['stream', 'stream link', 'youtube', 'youtube link', 'link', 'live link']
};
const DEFAULT_ORDER = ['date', 'time', 'sport', 'level', 'opponent', 'venue', 'stream'];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z/ ]/g, ' ').replace(/\s+/g, ' ').trim();

// Maps column positions to field names. Returns { columns, hasHeader }.
export function detectColumns(firstRow) {
  const columns = firstRow.map((h) => {
    const n = norm(h);
    return Object.keys(HEADERS).find((k) => HEADERS[k].includes(n)) || null;
  });
  const hasHeader = columns.includes('opponent') || columns.filter(Boolean).length >= 3;
  return hasHeader ? { columns, hasHeader } : { columns: DEFAULT_ORDER.slice(0, Math.max(firstRow.length, 5)), hasHeader: false };
}

/* ---------- values ---------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

// "YYYY-MM-DD" or null.
export function parseDate(s) {
  const t = String(s ?? '').trim();
  let y, m, d, mm;
  if ((mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) [, y, m, d] = mm.map(Number);
  else if ((mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t))) {
    let [, a, b, yy] = mm.map(Number);
    if (a <= 12 && b > 12) [a, b] = [b, a]; // month-first date such as 10/17/2026
    d = a; m = b; y = yy < 100 ? 2000 + yy : yy;
  } else if ((mm = /^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(t))) {
    d = Number(mm[1]); m = MONTHS[mm[2].toLowerCase().slice(0, mm[2].toLowerCase().startsWith('sept') ? 4 : 3)]; y = Number(mm[3]);
  } else if ((mm = /^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t))) {
    m = MONTHS[mm[1].toLowerCase().slice(0, mm[1].toLowerCase().startsWith('sept') ? 4 : 3)]; d = Number(mm[2]); y = Number(mm[3]);
  } else return null;
  if (!m || m < 1 || m > 12 || d < 1 || y < 2000 || y > 2100) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// "HH:MM" (24-hour) or null.
export function parseTime(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const mm = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(t);
  if (!mm) return null;
  let h = Number(mm[1]);
  const min = Number(mm[2] ?? 0);
  const ap = mm[3]?.[0];
  if (ap) { if (h < 1 || h > 12) return null; if (ap === 'p' && h !== 12) h += 12; if (ap === 'a' && h === 12) h = 0; }
  else if (mm[2] === undefined && mm[1].length <= 2 && h < 24) { /* "15" means 15:00 */ }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const SPORTS = { football: 'football', soccer: 'football', basketball: 'basketball', bball: 'basketball', volleyball: 'volleyball', vball: 'volleyball' };
const LEVELS = { varsity: 'varsity', v: 'varsity', 'junior varsity': 'jv', jv: 'jv', 'j v': 'jv' };

// Team slug such as "football-jv" from sport and level cells (or one combined cell), or null.
export function parseTeam(sportCell, levelCell, teamSlugs) {
  const words = norm(`${sportCell ?? ''} ${levelCell ?? ''}`.replace(/[-_]/g, ' '));
  const sport = Object.keys(SPORTS).find((k) => new RegExp(`\\b${k}\\b`).test(words));
  const rest = sport ? words.replace(new RegExp(`\\b${sport}\\b`), ' ').replace(/\s+/g, ' ').trim() : words;
  const levelKey = ['junior varsity', 'j v', 'varsity', 'jv', 'v'].find((k) => new RegExp(`\\b${k}\\b`).test(rest));
  if (!sport || !levelKey) return null;
  const slug = `${SPORTS[sport]}-${LEVELS[levelKey]}`;
  return teamSlugs.includes(slug) ? slug : null;
}

/* ---------- whole import ---------- */

// Returns { rows: [{ line, game, errors[], duplicate }], hasHeader }.
// `existing` are the games already in the database: a row for the same team, start time and opponent
// is marked as a duplicate (so re-importing the same sheet adds nothing), and new ids never clash.
export function parseFixtures(text, { teamSlugs, existing = [], defaultVenue = 'Home field' }) {
  const key = (g) => `${g.team}|${new Date(g.start).getTime()}|${slug(g.opponent)}`;
  const existingKeys = new Set(existing.map(key));
  const existingIds = existing.map((g) => g.id);
  const all = splitRows(text);
  if (!all.length) return { rows: [], hasHeader: false };
  const { columns, hasHeader } = detectColumns(all[0]);
  const body = hasHeader ? all.slice(1) : all;
  const taken = [...existingIds];
  const rows = body.map((cells, i) => {
    const v = {};
    columns.forEach((k, j) => { if (k && v[k] === undefined) v[k] = cells[j] ?? ''; });
    const errors = [];
    const date = parseDate(v.date);
    if (!date) errors.push('date');
    const time = parseTime(v.time);
    if (!time) errors.push('time');
    const team = parseTeam(v.team ?? v.sport, v.team ? '' : v.level, teamSlugs);
    if (!team) errors.push('team');
    const opponent = String(v.opponent ?? '').trim().slice(0, 80);
    if (!opponent) errors.push('opponent');
    const streamId = parseYouTubeId(v.stream);
    if (streamId === null) errors.push('stream');
    const venue = String(v.venue ?? '').trim().slice(0, 80) || defaultVenue;
    let game = null;
    let duplicate = false;
    if (!errors.length) {
      const start = fromTashkentInput(`${date}T${time}`);
      const base = { team, opponent, venue, start, status: 'scheduled', homeScore: null, awayScore: null, streamId: streamId || null, replayId: null, cover: null, hidden: false };
      duplicate = existingKeys.has(key(base));
      game = { ...base, id: makeId(base, taken) };
      if (!duplicate) { taken.push(game.id); existingKeys.add(key(base)); }
    }
    return { line: i + 1 + (hasHeader ? 1 : 0), game, errors, duplicate, cells };
  });
  return { rows, hasHeader };
}
