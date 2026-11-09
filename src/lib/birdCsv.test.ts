import { describe, expect, it } from 'vitest';
import type { AllData, Bird } from '../data/types.ts';
import { birdsToCsv, planBirdCsv } from './birdCsv.ts';

const base: Omit<Bird, 'id'> = {
  ring_country: null, ring_number: null, ring_code: null, ring_year: null, name: null, sex: 'unknown',
  colour: null, hatch_date: null, sire_id: null, dam_id: null, clutch_id: null, status: 'active', notes: null,
};
const empty: AllData = { birds: [], boxes: [], seasons: [], pairings: [], clutches: [], ring_sequences: [], comments: [] };

describe('bird CSV', () => {
  let n = 0;
  const id = () => `id${++n}`;

  it('exports sire and dam by name or ring', () => {
    const d: AllData = {
      ...empty,
      birds: [
        { ...base, id: 's', name: 'Grizzle', sex: 'cock' },
        { ...base, id: 'd', name: 'Mia, D', sex: 'hen' },
        { ...base, id: 'y', ring_country: 'ZA', ring_number: 2927, ring_code: 'BORD', ring_year: 2026, sire_id: 's', dam_id: 'd' },
      ],
    };
    const csv = birdsToCsv(d);
    expect(csv.split('\r\n')[0]).toBe('ring,name,sex,colour,hatch_date,status,sire,dam,season,pairing,box,block,round,notes');
    expect(csv).toContain('ZA 2927 BORD 2026,,unknown,,,active,Grizzle,"Mia, D"');
  });

  it('imports into an empty loft, creating parents first', () => {
    const csv = 'ring,name,sex,sire,dam\nZA 1 BORD 2026,,,Grizzle,ZA 9 BORD 2025\nZA 9 BORD 2025,Old hen,hen,,\n';
    const plan = planBirdCsv(csv, [], id);
    expect(plan.errors).toEqual([]);
    expect(plan.birds).toHaveLength(3); // Grizzle created, hen from file, youngster
    const youngster = plan.birds.find((b) => b.ring_number === 1)!;
    const hen = plan.birds.find((b) => b.ring_number === 9)!;
    expect(youngster.dam_id).toBe(hen.id);
    expect(plan.birds.indexOf(hen)).toBeLessThan(plan.birds.indexOf(youngster));
    expect(plan.birds.find((b) => b.name === 'Grizzle')?.sex).toBe('cock');
  });

  it('skips birds that already exist and links to existing parents', () => {
    const existing: Bird[] = [
      { ...base, id: 'e1', ring_country: 'ZA', ring_number: 5, ring_code: 'BORD', ring_year: 2026 },
      { ...base, id: 'e2', name: 'Grizzle', sex: 'cock' },
    ];
    const plan = planBirdCsv('ring,name,sire\nza 5 bord 2026,,\nZA 6 BORD 2026,, grizzle \n', existing, id);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.birds).toHaveLength(1);
    expect(plan.birds[0].sire_id).toBe('e2');
  });

  it('reports bad rows', () => {
    const plan = planBirdCsv('ring,sex\n3979,cock\nZA 1 BORD 2026,rooster\n', [], id);
    expect(plan.errors).toHaveLength(2);
  });
});
