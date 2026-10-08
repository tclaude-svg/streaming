// Fingerprint of the games a build rendered. The build writes it to dist/build-sig.json and
// scripts/check-rebuild.mjs compares it with the database to decide whether a rebuild is needed.
import { createHash } from 'node:crypto';

const FIELDS = ['id', 'team', 'opponent', 'venue', 'start', 'status', 'homeScore', 'awayScore', 'streamId', 'replayId', 'cover'];

export function gamesSignature(games) {
  const rows = [...games]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    // Same instant written two ways ("…+05:00" vs "…Z") must not count as a change.
    .map((g) => FIELDS.map((k) => (k === 'start' ? new Date(g.start).toISOString() : g[k] ?? null)));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
