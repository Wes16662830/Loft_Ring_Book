import { describe, expect, it } from 'vitest';
import { findDuplicateRings, sequenceUsage } from '../../src/lib/rings.ts';
import { buildSeedPlan, SEQUENCES } from './generate-seed.ts';
import { DEFAULT_RING } from '../../src/lib/rings.ts';

describe('seed totals', () => {
  const plan = buildSeedPlan();
  const youngsters = plan.birds.filter((b) => b.ring_number != null);

  it('parses without errors', () => {
    expect(plan.parseIssues).toEqual([]);
  });

  it('has 38 pairs in pairing 1 and 33 in pairing 2', () => {
    expect(plan.pairings.filter((p) => p.pairing_no === 1)).toHaveLength(38);
    expect(plan.pairings.filter((p) => p.pairing_no === 2)).toHaveLength(33);
  });

  it('has 122 youngsters and no duplicate rings', () => {
    expect(youngsters).toHaveLength(122);
    expect(findDuplicateRings(youngsters)).toEqual([]);
  });

  it('finds exactly the expected gaps in the 3901–3988 run', () => {
    const seq = { id: 's', country: DEFAULT_RING.country, code: DEFAULT_RING.code, year: DEFAULT_RING.year, start_no: 3901, end_no: 4000 };
    const u = sequenceUsage(seq, youngsters);
    expect(u.used[0]).toBe(3901);
    expect(u.used[u.used.length - 1]).toBe(3988);
    expect(u.gaps).toEqual([3963, 3964, 3969, 3970, 3971, 3972, 3987]);
  });

  it('finds no gaps in the 2910–2950 run', () => {
    const s = SEQUENCES[0];
    const seq = { id: s.id, country: 'ZA', code: 'BORD', year: 2026, start_no: s.start, end_no: s.end };
    expect(sequenceUsage(seq, youngsters).gaps).toEqual([]);
  });

  it('creates parents with a name and no ring, matched across pairings by name', () => {
    const parents = plan.birds.filter((b) => b.ring_number == null);
    expect(parents.every((b) => b.name && b.ring_number == null)).toBe(true);
    // "Grizzle" is cock of L1 (pairing 1) and Block 1 (pairing 2): one bird.
    const grizzle = parents.filter((b) => b.name === 'Grizzle');
    expect(grizzle).toHaveLength(1);
    const grizzlePairs = plan.pairings.filter((p) => p.cock_id === grizzle[0].id);
    expect(grizzlePairs.map((p) => p.pairing_no)).toEqual([1, 2]);
  });

  it('flags the R7 non-consecutive round and does not fix it', () => {
    expect(plan.notes.some((n) => n.includes('R7') && n.includes('3986/3988'))).toBe(true);
    expect(youngsters.some((b) => b.ring_number === 3988)).toBe(true);
    expect(youngsters.some((b) => b.ring_number === 3987)).toBe(false);
  });

  it('keeps the suspected duplicate hens as separate birds (to merge in the app)', () => {
    const names = plan.birds.map((b) => b.name);
    for (const n of ['57 Money Penny', '57 Kingpin x Money Penny', 'Chris Quatar -2125', 'Chris Quatar', 'Race - 128OUD24', 'Race - 128OUD24 (Wingman x 544)']) {
      expect(names).toContain(n);
    }
  });

  it('youngsters take sire and dam from their pair', () => {
    const l1 = plan.pairings.find((p) => p.pairing_no === 1 && p.sort_order === 1)!;
    const r2927 = youngsters.find((b) => b.ring_number === 2927)!;
    expect(r2927.sire_id).toBe(l1.cock_id);
    expect(r2927.dam_id).toBe(l1.hen_id);
  });
});
