// Bird CSV export and import (round-trips with itself).
import type { AllData, Bird, BirdStatus, Sex } from '../data/types.ts';
import { parseCsv, toCsv } from './csv.ts';
import { formatRing, normaliseName, parseFullRing, ringKey } from './rings.ts';

export const BIRD_COLUMNS = [
  'ring', 'name', 'sex', 'colour', 'hatch_date', 'status', 'sire', 'dam',
  'season', 'pairing', 'box', 'block', 'round', 'notes',
] as const;

/** Parents are written as their full ring if they have one, else their name. */
function ref(b: Bird | undefined): string {
  if (!b) return '';
  return formatRing(b) || b.name || '';
}

export function birdsToCsv(d: AllData): string {
  const bird = new Map(d.birds.map((b) => [b.id, b]));
  const clutch = new Map(d.clutches.map((c) => [c.id, c]));
  const pairing = new Map(d.pairings.map((p) => [p.id, p]));
  const box = new Map(d.boxes.map((b) => [b.id, b]));
  const season = new Map(d.seasons.map((s) => [s.id, s]));
  const rows = [...d.birds]
    .sort((a, b) => (a.ring_year ?? 0) - (b.ring_year ?? 0) || (a.ring_number ?? -1) - (b.ring_number ?? -1) || (a.name ?? '').localeCompare(b.name ?? ''))
    .map((b) => {
      const c = b.clutch_id ? clutch.get(b.clutch_id) : undefined;
      const p = c ? pairing.get(c.pairing_id) : undefined;
      return [
        formatRing(b), b.name, b.sex, b.colour, b.hatch_date, b.status,
        ref(b.sire_id ? bird.get(b.sire_id) : undefined), ref(b.dam_id ? bird.get(b.dam_id) : undefined),
        p ? season.get(p.season_id)?.name : '', p?.pairing_no, p?.box_id ? box.get(p.box_id)?.name : '', p?.block, c?.round_no, b.notes,
      ];
    });
  return toCsv([[...BIRD_COLUMNS], ...rows]);
}

export interface BirdImportPlan {
  /** In insert order: a bird only references birds earlier in the list or already in the database. */
  birds: Partial<Bird>[];
  skipped: string[];
  errors: string[];
}

const SEXES: Sex[] = ['cock', 'hen', 'unknown'];
const STATUSES: BirdStatus[] = ['active', 'sold', 'lost', 'dead'];

/**
 * Plan a bird CSV import. Rows whose ring (or, for name-only birds, name) already exists are skipped.
 * Sire/dam are matched by full ring or by name; unknown parents are created as name-only birds.
 * Pair/round columns are informational and not imported (use the pairing list import for those).
 */
export function planBirdCsv(text: string, existing: Bird[], newId: () => string): BirdImportPlan {
  const plan: BirdImportPlan = { birds: [], skipped: [], errors: [] };
  const rows = parseCsv(text);
  if (!rows.length) {
    plan.errors.push('The file is empty.');
    return plan;
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('ring') === -1 && col('name') === -1) {
    plan.errors.push('Need a "ring" or "name" column in the first row.');
    return plan;
  }
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');

  const byRing = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const b of existing) {
    if (b.ring_number != null) byRing.set(ringKey(b), b.id);
    if (b.name) byName.set(normaliseName(b.name), b.id);
  }

  type Row = { line: number; bird: Partial<Bird>; sire: string; dam: string };
  const pending: Row[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const ringText = get(r, 'ring');
    const name = get(r, 'name').replace(/\s+/g, ' ');
    const ring = ringText ? parseFullRing(ringText) : null;
    if (ringText && !ring) {
      plan.errors.push(`Line ${line}: ring "${ringText}" should look like "ZA 3979 BORD 2026".`);
      return;
    }
    if (!ring && !name) return;
    const sex = (get(r, 'sex').toLowerCase() || 'unknown') as Sex;
    const status = (get(r, 'status').toLowerCase() || 'active') as BirdStatus;
    if (!SEXES.includes(sex)) plan.errors.push(`Line ${line}: sex "${sex}" must be cock, hen or unknown.`);
    if (!STATUSES.includes(status)) plan.errors.push(`Line ${line}: status "${status}" must be active, sold, lost or dead.`);
    const hatch = get(r, 'hatch_date');
    if (hatch && !/^\d{4}-\d{2}-\d{2}$/.test(hatch)) plan.errors.push(`Line ${line}: hatch_date must be YYYY-MM-DD.`);
    const bird: Partial<Bird> = {
      ring_country: ring?.country ?? null,
      ring_number: ring?.number ?? null,
      ring_code: ring?.code ?? null,
      ring_year: ring?.year ?? null,
      name: name || null,
      sex: SEXES.includes(sex) ? sex : 'unknown',
      status: STATUSES.includes(status) ? status : 'active',
      colour: get(r, 'colour') || null,
      hatch_date: hatch || null,
      notes: get(r, 'notes') || null,
    };
    const key = ring ? ringKey({ ring_country: ring.country, ring_number: ring.number, ring_code: ring.code, ring_year: ring.year }) : null;
    if (key ? byRing.has(key) : byName.has(normaliseName(name))) {
      plan.skipped.push(`Line ${line}: ${ringText || name} already exists.`);
      return;
    }
    bird.id = newId();
    if (key) byRing.set(key, bird.id);
    if (name) byName.set(normaliseName(name), bird.id);
    pending.push({ line, bird, sire: get(r, 'sire'), dam: get(r, 'dam') });
  });

  const created: Partial<Bird>[] = [];
  const resolve = (text: string, sex: Sex): string | null => {
    if (!text) return null;
    const ring = parseFullRing(text);
    if (ring) {
      const k = ringKey({ ring_country: ring.country, ring_number: ring.number, ring_code: ring.code, ring_year: ring.year });
      const found = byRing.get(k);
      if (found) return found;
      const id = newId();
      byRing.set(k, id);
      created.push({ id, ring_country: ring.country, ring_number: ring.number, ring_code: ring.code, ring_year: ring.year, sex });
      return id;
    }
    const n = normaliseName(text);
    const found = byName.get(n);
    if (found) return found;
    const id = newId();
    byName.set(n, id);
    created.push({ id, name: text.trim().replace(/\s+/g, ' '), sex });
    return id;
  };
  for (const p of pending) {
    p.bird.sire_id = resolve(p.sire, 'cock');
    p.bird.dam_id = resolve(p.dam, 'hen');
    if (p.bird.sire_id === p.bird.id || p.bird.dam_id === p.bird.id) {
      plan.errors.push(`Line ${p.line}: a bird cannot be its own parent.`);
    }
  }

  // Order so parents are inserted before their offspring.
  const all = [...created, ...pending.map((p) => p.bird)];
  const inFile = new Map(all.map((b) => [b.id!, b]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (b: Partial<Bird>) => {
    if (done.has(b.id!)) return;
    if (visiting.has(b.id!)) {
      plan.errors.push(`Circular parentage involving ${formatRing(b as Bird) || b.name}.`);
      return;
    }
    visiting.add(b.id!);
    for (const pid of [b.sire_id, b.dam_id]) {
      const parent = pid ? inFile.get(pid) : undefined;
      if (parent) visit(parent);
    }
    visiting.delete(b.id!);
    done.add(b.id!);
    plan.birds.push(b);
  };
  all.forEach(visit);
  return plan;
}
