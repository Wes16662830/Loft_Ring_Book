import { describe, expect, it } from 'vitest';
import { buildSeedPlan } from '../../supabase/seed/generate-seed.ts';
import { buildModel, laterPairings, lookup, nestMates, originOf, pairingTitle, seasonStats } from './model.ts';
import type { AllData } from './types.ts';

function seedData(): AllData {
  const plan = buildSeedPlan();
  return {
    seasons: [{ id: 's', name: '2026 breeding', year: 2026, is_active: true }],
    boxes: plan.boxes.map((b) => ({ ...b, active: true, notes: null })),
    birds: plan.birds.map((b) => ({ ...b, colour: null, hatch_date: null, status: 'active', notes: null })),
    pairings: plan.pairings.map((p) => ({ ...p, season_id: 's', notes: null })),
    clutches: plan.clutches.map((c) => ({ ...c, laid_date: null, notes: null })),
    ring_sequences: [{ id: 'q', country: 'ZA', code: 'BORD', year: 2026, start_no: 3901, end_no: 4000, notes: null }],
    comments: [],
  };
}

describe('lookup', () => {
  const m = buildModel(seedData());

  it('exact ring gives box, round, parents, nest mate and later pairings', () => {
    const r = lookup(m, '3979');
    expect(r.kind).toBe('exact');
    if (r.kind !== 'exact') return;
    const b = r.birds[0];
    const o = originOf(m, b)!;
    expect(pairingTitle(m, o.pairing)).toBe('L11');
    expect(o.clutch.round_no).toBe(2);
    expect(m.bird.get(b.sire_id!)?.name).toBe('Heinz Shirocco Kittel');
    expect(m.bird.get(b.dam_id!)?.name).toBe('845 Gaddin');
    expect(nestMates(m, b).map((x) => x.ring_number)).toEqual([3980]);
    const later = laterPairings(m, b.sire_id!, o.pairing);
    expect(later).toHaveLength(1);
    expect(later[0].pairing_no).toBe(2);
    expect(m.bird.get(later[0].hen_id)?.name).toBe('Thomas VBK');
  });

  it('full ring format works too', () => {
    expect(lookup(m, 'ZA 3979 BORD 2026').kind).toBe('exact');
    expect(lookup(m, 'ZA 3979 BORD 2025').kind).toBe('partial');
  });

  it('unrecorded number inside the used run is a gap', () => {
    const r = lookup(m, '3987');
    expect(r.kind === 'partial' && r.status?.kind).toBe('gap');
    const u = lookup(m, '3995');
    expect(u.kind === 'partial' && u.status?.kind).toBe('unused');
  });

  it('partial number lists matches', () => {
    const r = lookup(m, '392');
    expect(r.kind).toBe('partial');
    if (r.kind === 'partial') expect(r.birds.map((b) => b.ring_number)).toContain(3924);
  });

  it('text finds birds and their pairs', () => {
    const r = lookup(m, 'mia d');
    expect(r.kind).toBe('text');
    if (r.kind === 'text') {
      expect(r.birds.map((b) => b.name)).toContain('Mia D');
      expect(r.pairings.length).toBe(2);
    }
  });

  it('season stats', () => {
    const s = seasonStats(m, 's');
    expect(s.totalYoungsters).toBe(122);
    expect(s.zero.filter((r) => r.pairing.pairing_no === 1).map((r) => pairingTitle(m, r.pairing))).toEqual(['Q3', 'Q8']);
    expect(s.singles).toHaveLength(8);
    expect(s.usage[0].gaps).toEqual([3963, 3964, 3969, 3970, 3971, 3972, 3987]);
  });
});
