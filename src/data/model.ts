// Pure, indexed view over all data plus the derived queries the screens need.
import { formatRing, isConsecutive, normaliseName, parseFullRing, ringStatus, sequenceUsage, type RingStatus } from '../lib/rings.ts';
import type { AllData, Bird, Box, Clutch, Comment, Pairing, RingSequenceRow, Season } from './types.ts';

export interface Model {
  data: AllData;
  bird: Map<string, Bird>;
  pairing: Map<string, Pairing>;
  clutch: Map<string, Clutch>;
  box: Map<string, Box>;
  season: Map<string, Season>;
  clutchesOf: Map<string, Clutch[]>;
  youngstersOf: Map<string, Bird[]>;
  pairingsOf: Map<string, Pairing[]>;
  offspringOf: Map<string, Bird[]>;
  commentsOfBird: Map<string, Comment[]>;
  commentsOfPairing: Map<string, Comment[]>;
  activeSeason: Season | null;
}

function group<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return m;
}

const byRing = (a: Bird, b: Bird) => (a.ring_number ?? 0) - (b.ring_number ?? 0);

export function buildModel(data: AllData): Model {
  const youngstersOf = group(data.birds, (b) => b.clutch_id);
  youngstersOf.forEach((g) => g.sort(byRing));
  const clutchesOf = group(data.clutches, (c) => c.pairing_id);
  clutchesOf.forEach((g) => g.sort((a, b) => a.round_no - b.round_no));
  const pairingsOf = new Map<string, Pairing[]>();
  for (const p of data.pairings) {
    for (const id of [p.cock_id, p.hen_id]) {
      const g = pairingsOf.get(id);
      if (g) g.push(p);
      else pairingsOf.set(id, [p]);
    }
  }
  const offspringOf = new Map<string, Bird[]>();
  for (const b of data.birds) {
    for (const id of [b.sire_id, b.dam_id]) {
      if (!id) continue;
      const g = offspringOf.get(id);
      if (g) g.push(b);
      else offspringOf.set(id, [b]);
    }
  }
  offspringOf.forEach((g) => g.sort(byRing));
  const byDate = (a: Comment, b: Comment) => b.created_at.localeCompare(a.created_at);
  const commentsOfBird = group(data.comments, (c) => c.bird_id);
  const commentsOfPairing = group(data.comments, (c) => c.pairing_id);
  commentsOfBird.forEach((g) => g.sort(byDate));
  commentsOfPairing.forEach((g) => g.sort(byDate));
  const seasons = [...data.seasons].sort((a, b) => b.year - a.year);
  return {
    data,
    bird: new Map(data.birds.map((b) => [b.id, b])),
    pairing: new Map(data.pairings.map((p) => [p.id, p])),
    clutch: new Map(data.clutches.map((c) => [c.id, c])),
    box: new Map(data.boxes.map((b) => [b.id, b])),
    season: new Map(data.seasons.map((s) => [s.id, s])),
    clutchesOf,
    youngstersOf,
    pairingsOf,
    offspringOf,
    commentsOfBird,
    commentsOfPairing,
    activeSeason: seasons.find((s) => s.is_active) ?? seasons[0] ?? null,
  };
}

export function birdLabel(b: Bird | null | undefined): string {
  if (!b) return '—';
  const ring = formatRing(b);
  if (ring && b.name) return `${ring} · ${b.name}`;
  return ring || b.name || '(unnamed)';
}

export function pairingTitle(m: Model, p: Pairing): string {
  return (p.box_id && m.box.get(p.box_id)?.name) || p.block || `Pair ${p.sort_order || ''}`.trim();
}

/** The pair and round a youngster came from. */
export function originOf(m: Model, b: Bird): { pairing: Pairing; clutch: Clutch } | null {
  const clutch = b.clutch_id ? m.clutch.get(b.clutch_id) : undefined;
  const pairing = clutch ? m.pairing.get(clutch.pairing_id) : undefined;
  return clutch && pairing ? { pairing, clutch } : null;
}

export function nestMates(m: Model, b: Bird): Bird[] {
  return b.clutch_id ? (m.youngstersOf.get(b.clutch_id) ?? []).filter((x) => x.id !== b.id) : [];
}

/** Pairings a bird appears in, sorted by season year then pairing number. */
export function pairingsOfBird(m: Model, birdId: string): Pairing[] {
  const year = (p: Pairing) => m.season.get(p.season_id)?.year ?? 0;
  return [...(m.pairingsOf.get(birdId) ?? [])].sort((a, b) => year(a) - year(b) || a.pairing_no - b.pairing_no);
}

/** Pairings of a bird that come after the given pairing (later pairing number or later season). */
export function laterPairings(m: Model, birdId: string, after: Pairing): Pairing[] {
  const ay = m.season.get(after.season_id)?.year ?? 0;
  return pairingsOfBird(m, birdId).filter((p) => {
    if (p.id === after.id) return false;
    const y = m.season.get(p.season_id)?.year ?? 0;
    return y > ay || (y === ay && p.pairing_no > after.pairing_no);
  });
}

export function youngstersOfPairing(m: Model, p: Pairing): Bird[] {
  return (m.clutchesOf.get(p.id) ?? []).flatMap((c) => m.youngstersOf.get(c.id) ?? []);
}

export type PairFlag = { level: 'warn' | 'info'; text: string };

export function pairFlags(m: Model, p: Pairing): PairFlag[] {
  const flags: PairFlag[] = [];
  const clutches = m.clutchesOf.get(p.id) ?? [];
  const total = youngstersOfPairing(m, p).length;
  if (total === 0 && p.pairing_no === 1) flags.push({ level: 'info', text: 'No youngsters' });
  for (const c of clutches) {
    const ys = m.youngstersOf.get(c.id) ?? [];
    const nums = ys.map((y) => y.ring_number).filter((n): n is number => n != null);
    if (ys.length >= 3) flags.push({ level: 'warn', text: `Round ${c.round_no}: ${ys.length} youngsters` });
    if (nums.length >= 2 && !isConsecutive(nums)) flags.push({ level: 'warn', text: `Round ${c.round_no}: rings not consecutive` });
    if (ys.length === 1) flags.push({ level: 'info', text: `Round ${c.round_no}: single` });
  }
  return flags;
}

export function sequences(m: Model): RingSequenceRow[] {
  return [...m.data.ring_sequences].sort((a, b) => b.year - a.year || a.start_no - b.start_no);
}

// ---------------------------------------------------------------------------
// Lookup

export type LookupResult =
  | { kind: 'empty' }
  | { kind: 'exact'; birds: Bird[] }
  | { kind: 'partial'; birds: Bird[]; status: RingStatus | null; number: number }
  | { kind: 'text'; birds: Bird[]; pairings: Pairing[] };

export function lookup(m: Model, raw: string): LookupResult {
  const q = raw.trim();
  if (!q) return { kind: 'empty' };

  const full = parseFullRing(q);
  if (full) {
    const birds = m.data.birds.filter(
      (b) =>
        b.ring_number === full.number &&
        (b.ring_country ?? '').toUpperCase() === full.country &&
        (b.ring_code ?? '').toUpperCase() === full.code &&
        b.ring_year === full.year,
    );
    if (birds.length) return { kind: 'exact', birds };
    return { kind: 'partial', birds: [], status: ringStatus(full.number, sequences(m), m.data.birds, full.year), number: full.number };
  }

  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const exact = m.data.birds.filter((b) => b.ring_number === n);
    if (exact.length) {
      const y = m.activeSeason?.year;
      exact.sort((a, b) => Number(b.ring_year === y) - Number(a.ring_year === y) || (b.ring_year ?? 0) - (a.ring_year ?? 0));
      return { kind: 'exact', birds: exact };
    }
    const partial = m.data.birds
      .filter((b) => b.ring_number != null && String(b.ring_number).includes(q))
      .sort((a, b) => {
        const ap = String(a.ring_number).startsWith(q) ? 0 : 1;
        const bp = String(b.ring_number).startsWith(q) ? 0 : 1;
        return ap - bp || byRing(a, b);
      })
      .slice(0, 60);
    return { kind: 'partial', birds: partial, status: ringStatus(n, sequences(m), m.data.birds), number: n };
  }

  const nq = normaliseName(q);
  const birds = m.data.birds
    .filter((b) => (b.name && normaliseName(b.name).includes(nq)) || (b.colour && normaliseName(b.colour).includes(nq)))
    .sort((a, b) => {
      const as = normaliseName(a.name ?? '').startsWith(nq) ? 0 : 1;
      const bs = normaliseName(b.name ?? '').startsWith(nq) ? 0 : 1;
      return as - bs || (a.name ?? '').localeCompare(b.name ?? '');
    })
    .slice(0, 60);
  const ids = new Set(birds.map((b) => b.id));
  const pairings = m.data.pairings.filter((p) => {
    const box = p.box_id ? m.box.get(p.box_id)?.name : null;
    return ids.has(p.cock_id) || ids.has(p.hen_id) || (box && box.toLowerCase() === q.toLowerCase());
  });
  return { kind: 'text', birds, pairings };
}

// ---------------------------------------------------------------------------
// Stats

export function seasonStats(m: Model, seasonId: string | null) {
  const pairs = m.data.pairings.filter((p) => p.season_id === seasonId);
  const rows = pairs
    .map((p) => {
      const clutches = m.clutchesOf.get(p.id) ?? [];
      return {
        pairing: p,
        youngsters: youngstersOfPairing(m, p).length,
        rounds: clutches.length,
        singles: clutches.filter((c) => (m.youngstersOf.get(c.id) ?? []).length === 1),
      };
    })
    .sort((a, b) => b.youngsters - a.youngsters || a.pairing.pairing_no - b.pairing.pairing_no);
  const usage = sequences(m).map((s) => sequenceUsage(s, m.data.birds));
  return {
    rows,
    totalYoungsters: rows.reduce((s, r) => s + r.youngsters, 0),
    zero: rows.filter((r) => r.youngsters === 0),
    singles: rows.flatMap((r) => r.singles.map((c) => ({ pairing: r.pairing, clutch: c }))),
    usage,
  };
}
