// Ring number logic shared by the app, the seed generator and the tests.
// A full ring reads: country, number, letters, year — e.g. "ZA 3979 BORD 2026".

export interface RingParts {
  country: string;
  number: number;
  code: string;
  year: number;
}

export interface RingDefaults {
  country: string;
  code: string;
  year: number;
}

export const DEFAULT_RING: RingDefaults = { country: 'ZA', code: 'BORD', year: 2026 };

const FULL_RING = /^([A-Za-z]{2,3})\s*-?\s*(\d{1,7})\s*-?\s*([A-Za-z]{1,8})\s*-?\s*(\d{4})$/;

/** Parse "ZA 3979 BORD 2026" (spacing and case are forgiving). Returns null if it isn't a full ring. */
export function parseFullRing(input: string): RingParts | null {
  const m = input.trim().match(FULL_RING);
  if (!m) return null;
  return {
    country: m[1].toUpperCase(),
    number: Number(m[2]),
    code: m[3].toUpperCase(),
    year: Number(m[4]),
  };
}

export function formatRing(r: {
  ring_country: string | null;
  ring_number: number | null;
  ring_code: string | null;
  ring_year: number | null;
}): string {
  if (r.ring_number == null) return '';
  return [r.ring_country, r.ring_number, r.ring_code, r.ring_year].filter((x) => x != null && x !== '').join(' ');
}

export interface RingEntryResult {
  numbers: number[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse what is typed into "Add rings": "3901", "2927/2928", "3990 3991", "3990,3991".
 * Clutches normally hold 1–2 youngsters: 3+ is a warning, not an error.
 */
export function parseRingEntry(input: string): RingEntryResult {
  const result: RingEntryResult = { numbers: [], errors: [], warnings: [] };
  const trimmed = input.trim();
  if (!trimmed) {
    result.errors.push('Enter at least one ring number.');
    return result;
  }
  const tokens = trimmed.split(/[\s/,;]+/).filter(Boolean);
  for (const t of tokens) {
    if (!/^\d{1,7}$/.test(t)) {
      result.errors.push(`"${t}" is not a ring number (digits only).`);
      continue;
    }
    result.numbers.push(Number(t));
  }
  if (result.errors.length) return result;

  const seen = new Set<number>();
  for (const n of result.numbers) {
    if (seen.has(n)) result.errors.push(`${n} is entered twice.`);
    seen.add(n);
  }
  if (result.numbers.length >= 3) {
    result.warnings.push(`${result.numbers.length} youngsters in one round — a clutch is normally 1–2.`);
  }
  if (result.numbers.length >= 2 && !isConsecutive(result.numbers)) {
    result.warnings.push(`${result.numbers.join('/')} are not consecutive — check for a typo.`);
  }
  return result;
}

export function isConsecutive(numbers: number[]): boolean {
  const s = [...numbers].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] !== 1) return false;
  return true;
}

export interface RingedBird {
  id: string;
  ring_country: string | null;
  ring_number: number | null;
  ring_code: string | null;
  ring_year: number | null;
}

export function ringKey(r: { ring_country: string | null; ring_number: number | null; ring_code: string | null; ring_year: number | null }): string {
  return `${(r.ring_country ?? '').toUpperCase()}|${r.ring_number ?? ''}|${(r.ring_code ?? '').toUpperCase()}|${r.ring_year ?? ''}`;
}

/** Groups of birds that share the same full ring. Birds without a ring number are ignored. */
export function findDuplicateRings<T extends RingedBird>(birds: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const b of birds) {
    if (b.ring_number == null) continue;
    const k = ringKey(b);
    const g = groups.get(k);
    if (g) g.push(b);
    else groups.set(k, [b]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Existing birds that would clash with a new ring. */
export function ringClashes<T extends RingedBird>(birds: T[], ring: RingParts, ignoreId?: string): T[] {
  const k = ringKey({ ring_country: ring.country, ring_number: ring.number, ring_code: ring.code, ring_year: ring.year });
  return birds.filter((b) => b.id !== ignoreId && b.ring_number != null && ringKey(b) === k);
}

export interface RingSequence {
  id: string;
  country: string;
  code: string;
  year: number;
  start_no: number;
  end_no: number;
  notes?: string | null;
}

export interface SequenceUsage {
  sequence: RingSequence;
  used: number[];
  /** Missing numbers between the lowest and highest used ring in the sequence. */
  gaps: number[];
  /** Numbers above the highest used ring — not yet issued. */
  remaining: number;
}

function inSequence(seq: RingSequence, b: RingedBird): boolean {
  return (
    b.ring_number != null &&
    (b.ring_country ?? '').toUpperCase() === seq.country.toUpperCase() &&
    (b.ring_code ?? '').toUpperCase() === seq.code.toUpperCase() &&
    b.ring_year === seq.year &&
    b.ring_number >= seq.start_no &&
    b.ring_number <= seq.end_no
  );
}

/**
 * Gap detection. A gap is a number inside a ring sequence, between the lowest and highest
 * ring actually used from it, that isn't recorded on any bird (unused, lost or not logged).
 * Numbers above the highest used ring are "not yet used", not gaps.
 */
export function sequenceUsage(seq: RingSequence, birds: RingedBird[]): SequenceUsage {
  const used = [...new Set(birds.filter((b) => inSequence(seq, b)).map((b) => b.ring_number as number))].sort((a, b) => a - b);
  const gaps: number[] = [];
  if (used.length) {
    const set = new Set(used);
    for (let n = used[0]; n <= used[used.length - 1]; n++) if (!set.has(n)) gaps.push(n);
  }
  const top = used.length ? used[used.length - 1] : seq.start_no - 1;
  return { sequence: seq, used, gaps, remaining: seq.end_no - top };
}

export type RingStatus =
  | { kind: 'recorded' }
  | { kind: 'gap'; sequence: RingSequence }
  | { kind: 'unused'; sequence: RingSequence }
  | { kind: 'unknown' };

/** What can be said about a ring number that may or may not be recorded. */
export function ringStatus(number: number, sequences: RingSequence[], birds: RingedBird[], year?: number): RingStatus {
  if (birds.some((b) => b.ring_number === number && (year == null || b.ring_year === year))) return { kind: 'recorded' };
  const seqs = sequences.filter((s) => number >= s.start_no && number <= s.end_no && (year == null || s.year === year));
  for (const s of seqs) {
    const u = sequenceUsage(s, birds);
    if (u.gaps.includes(number)) return { kind: 'gap', sequence: s };
  }
  if (seqs.length) return { kind: 'unused', sequence: seqs[0] };
  return { kind: 'unknown' };
}

/** Normalise a bird name for matching: trimmed, inner whitespace collapsed, case-insensitive. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
