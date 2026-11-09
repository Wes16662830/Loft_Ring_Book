import { describe, expect, it } from 'vitest';
import {
  findDuplicateRings,
  formatRing,
  isConsecutive,
  parseFullRing,
  parseRingEntry,
  ringClashes,
  ringStatus,
  sequenceUsage,
  type RingedBird,
} from './rings.ts';

const bird = (id: string, n: number | null, year: number | null = 2026, code: string | null = 'BORD', country: string | null = 'ZA'): RingedBird => ({
  id,
  ring_country: country,
  ring_number: n,
  ring_code: code,
  ring_year: year,
});

describe('parseRingEntry', () => {
  it('parses a pair "2927/2928"', () => {
    const r = parseRingEntry('2927/2928');
    expect(r.numbers).toEqual([2927, 2928]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('parses a single "3901"', () => {
    expect(parseRingEntry('3901')).toEqual({ numbers: [3901], errors: [], warnings: [] });
  });

  it('accepts spaces and commas', () => {
    expect(parseRingEntry(' 3990 3991 ').numbers).toEqual([3990, 3991]);
    expect(parseRingEntry('3990,3991').numbers).toEqual([3990, 3991]);
  });

  it('warns on non-consecutive pairs', () => {
    const r = parseRingEntry('3986/3988');
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/not consecutive/);
  });

  it('warns (does not block) on 3+', () => {
    const r = parseRingEntry('1/2/3');
    expect(r.numbers).toEqual([1, 2, 3]);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /normally 1–2/.test(w))).toBe(true);
  });

  it('rejects empty, letters and repeats', () => {
    expect(parseRingEntry('').errors).toHaveLength(1);
    expect(parseRingEntry('39a1').errors).toHaveLength(1);
    expect(parseRingEntry('3901/3901').errors[0]).toMatch(/twice/);
  });
});

describe('full ring format', () => {
  it('parses "ZA 3979 BORD 2026"', () => {
    expect(parseFullRing('ZA 3979 BORD 2026')).toEqual({ country: 'ZA', number: 3979, code: 'BORD', year: 2026 });
    expect(parseFullRing('za3979bord2026')).toEqual({ country: 'ZA', number: 3979, code: 'BORD', year: 2026 });
    expect(parseFullRing('3979')).toBeNull();
  });

  it('formats a ring', () => {
    expect(formatRing(bird('a', 3979))).toBe('ZA 3979 BORD 2026');
    expect(formatRing(bird('a', null))).toBe('');
  });

  it('isConsecutive', () => {
    expect(isConsecutive([3991, 3990])).toBe(true);
    expect(isConsecutive([3986, 3988])).toBe(false);
  });
});

describe('duplicate detection', () => {
  it('finds birds sharing a full ring', () => {
    const birds = [bird('a', 3901), bird('b', 3901), bird('c', 3902), bird('d', null), bird('e', null)];
    const d = findDuplicateRings(birds);
    expect(d).toHaveLength(1);
    expect(d[0].map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('same number in a different year or code is not a duplicate', () => {
    expect(findDuplicateRings([bird('a', 3901, 2026), bird('b', 3901, 2025)])).toEqual([]);
    expect(findDuplicateRings([bird('a', 3901, 2026, 'BORD'), bird('b', 3901, 2026, 'OUD')])).toEqual([]);
  });

  it('is case-insensitive on letters', () => {
    expect(findDuplicateRings([bird('a', 1, 2026, 'bord'), bird('b', 1, 2026, 'BORD')])).toHaveLength(1);
  });

  it('missing year still counts as a duplicate', () => {
    expect(findDuplicateRings([bird('a', 1, null), bird('b', 1, null)])).toHaveLength(1);
  });

  it('ringClashes warns before saving, ignoring the bird being edited', () => {
    const birds = [bird('a', 3901)];
    const ring = { country: 'ZA', number: 3901, code: 'BORD', year: 2026 };
    expect(ringClashes(birds, ring)).toHaveLength(1);
    expect(ringClashes(birds, ring, 'a')).toHaveLength(0);
  });
});

describe('gap detection', () => {
  const seq = { id: 's', country: 'ZA', code: 'BORD', year: 2026, start_no: 100, end_no: 120 };

  it('reports holes between lowest and highest used ring only', () => {
    const birds = [102, 103, 105, 108].map((n) => bird(String(n), n));
    const u = sequenceUsage(seq, birds);
    expect(u.gaps).toEqual([104, 106, 107]);
    expect(u.remaining).toBe(12);
  });

  it('ignores rings from other years or codes', () => {
    const birds = [bird('a', 101), bird('b', 104), bird('c', 102, 2025), bird('d', 103, 2026, 'OUD')];
    expect(sequenceUsage(seq, birds).gaps).toEqual([102, 103]);
  });

  it('empty sequence has no gaps', () => {
    expect(sequenceUsage(seq, []).gaps).toEqual([]);
  });

  it('ringStatus says gap, unused, recorded or unknown', () => {
    const birds = [bird('a', 101), bird('b', 104)];
    expect(ringStatus(101, [seq], birds).kind).toBe('recorded');
    expect(ringStatus(102, [seq], birds).kind).toBe('gap');
    expect(ringStatus(110, [seq], birds).kind).toBe('unused');
    expect(ringStatus(500, [seq], birds).kind).toBe('unknown');
  });
});
