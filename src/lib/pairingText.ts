// Parser for the pipe-separated pairing lists used for the seed and the in-app import.
//   Pairing with rounds:  box | cock | hen | round 1 rings | round 2 rings | ...
//   Pairing without box:  block | cock | hen
import { isConsecutive, normaliseName, parseRingEntry, type RingDefaults } from './rings.ts';

export interface ParsedPair {
  line: number;
  box: string | null;
  block: string | null;
  cock: string;
  hen: string;
  /** rounds[i] = ring numbers for round i+1 (may be empty). */
  rounds: number[][];
}

export interface ParseIssue {
  line: number;
  message: string;
}

export function parsePairingText(text: string, firstColumn: 'box' | 'block'): { pairs: ParsedPair[]; issues: ParseIssue[] } {
  const pairs: ParsedPair[] = [];
  const issues: ParseIssue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const cols = raw.split('|').map((c) => c.trim());
    if (cols.length < 3) {
      issues.push({ line, message: `Needs at least "${firstColumn} | cock | hen": ${raw.trim()}` });
      return;
    }
    const [first, cock, hen, ...roundCols] = cols;
    if (!cock || !hen) {
      issues.push({ line, message: 'Cock and hen are both required.' });
      return;
    }
    const rounds: number[][] = [];
    roundCols.forEach((rc, ri) => {
      if (!rc) {
        rounds.push([]);
        return;
      }
      const r = parseRingEntry(rc);
      if (r.errors.length) issues.push({ line, message: `Round ${ri + 1}: ${r.errors.join(' ')}` });
      rounds.push(r.numbers);
    });
    while (rounds.length && rounds[rounds.length - 1].length === 0) rounds.pop();
    pairs.push({
      line,
      box: firstColumn === 'box' ? first || null : null,
      block: firstColumn === 'block' ? first || null : null,
      cock,
      hen,
      rounds,
    });
  });
  return { pairs, issues };
}

/** Section of a box, used for filtering: "L1" → "L", "Q3" → "Q", "Race 2" → "Race". */
export function boxSection(name: string): string {
  const t = name.trim();
  if (/^race\b/i.test(t)) return 'Race';
  const m = t.match(/^([A-Za-z]+)\s*\d/);
  return m ? m[1].toUpperCase() : 'Other';
}

/** Box sort key: section order L, R, Q, Race, then others; numeric within a section. */
export function boxSortOrder(name: string): number {
  const order = ['L', 'R', 'Q', 'Race'];
  const sec = boxSection(name);
  const si = order.indexOf(sec);
  const num = Number(name.match(/(\d+)/)?.[1] ?? 0);
  return (si === -1 ? order.length : si) * 1000 + num;
}

// ---------------------------------------------------------------------------
// Import plan: turn parsed pairings into rows, matching parents by name.

export interface PlanBird {
  id: string;
  name: string | null;
  sex: 'cock' | 'hen' | 'unknown';
  ring_country: string | null;
  ring_number: number | null;
  ring_code: string | null;
  ring_year: number | null;
  sire_id: string | null;
  dam_id: string | null;
  clutch_id: string | null;
}

export interface PlanBox {
  id: string;
  name: string;
  section: string;
  sort_order: number;
}

export interface PlanPairing {
  id: string;
  pairing_no: number;
  box_id: string | null;
  block: string | null;
  cock_id: string;
  hen_id: string;
  sort_order: number;
}

export interface PlanClutch {
  id: string;
  pairing_id: string;
  round_no: number;
}

export interface ImportPlan {
  boxes: PlanBox[];
  birds: PlanBird[];
  pairings: PlanPairing[];
  clutches: PlanClutch[];
  /** Data problems found — reported, never silently fixed. */
  notes: string[];
}

export interface ExistingBird {
  id: string;
  name: string | null;
  sex: 'cock' | 'hen' | 'unknown';
}

export interface ExistingBox {
  id: string;
  name: string;
}

export function buildImportPlan(opts: {
  sections: { pairingNo: number; pairs: ParsedPair[] }[];
  ring: RingDefaults;
  newId: (hint: string) => string;
  existingBirds?: ExistingBird[];
  existingBoxes?: ExistingBox[];
  existingRings?: Set<number>;
}): ImportPlan {
  const plan: ImportPlan = { boxes: [], birds: [], pairings: [], clutches: [], notes: [] };
  const byName = new Map<string, { id: string; sex: string }>();
  for (const b of opts.existingBirds ?? []) if (b.name) byName.set(normaliseName(b.name), { id: b.id, sex: b.sex });
  const boxByName = new Map<string, string>();
  for (const b of opts.existingBoxes ?? []) boxByName.set(b.name.trim().toLowerCase(), b.id);
  const ringsSeen = new Map<number, string>();
  for (const n of opts.existingRings ?? []) ringsSeen.set(n, 'existing record');

  const parent = (name: string, sex: 'cock' | 'hen', where: string): string => {
    const key = normaliseName(name);
    const found = byName.get(key);
    if (found) {
      if (found.sex !== sex && found.sex !== 'unknown') {
        plan.notes.push(`${where}: "${name}" is used as a ${sex} here but as a ${found.sex} elsewhere.`);
      }
      return found.id;
    }
    const id = opts.newId(`bird:${key}`);
    byName.set(key, { id, sex });
    plan.birds.push({
      id,
      name: name.trim().replace(/\s+/g, ' '),
      sex,
      ring_country: null,
      ring_number: null,
      ring_code: null,
      ring_year: null,
      sire_id: null,
      dam_id: null,
      clutch_id: null,
    });
    return id;
  };

  const box = (name: string): string => {
    const key = name.trim().toLowerCase();
    const found = boxByName.get(key);
    if (found) return found;
    const id = opts.newId(`box:${key}`);
    boxByName.set(key, id);
    plan.boxes.push({ id, name: name.trim(), section: boxSection(name), sort_order: boxSortOrder(name) });
    return id;
  };

  for (const section of opts.sections) {
    section.pairs.forEach((p, idx) => {
      const where = `Pairing ${section.pairingNo}, ${p.box ?? p.block ?? 'line ' + p.line}`;
      const cockId = parent(p.cock, 'cock', where);
      const henId = parent(p.hen, 'hen', where);
      const pairingId = opts.newId(`pairing:${section.pairingNo}:${idx}`);
      plan.pairings.push({
        id: pairingId,
        pairing_no: section.pairingNo,
        box_id: p.box ? box(p.box) : null,
        block: p.block,
        cock_id: cockId,
        hen_id: henId,
        sort_order: idx + 1,
      });
      p.rounds.forEach((rings, ri) => {
        if (!rings.length) return;
        const clutchId = opts.newId(`clutch:${pairingId}:${ri + 1}`);
        plan.clutches.push({ id: clutchId, pairing_id: pairingId, round_no: ri + 1 });
        if (rings.length >= 3) plan.notes.push(`${where} round ${ri + 1}: ${rings.length} youngsters in one clutch.`);
        if (rings.length === 2 && !isConsecutive(rings)) {
          plan.notes.push(`${where} round ${ri + 1}: rings ${rings.join('/')} are not consecutive — possible typo.`);
        }
        for (const n of rings) {
          const prev = ringsSeen.get(n);
          if (prev) plan.notes.push(`${where} round ${ri + 1}: ring ${n} duplicates ${prev}.`);
          ringsSeen.set(n, `${where} round ${ri + 1}`);
          plan.birds.push({
            id: opts.newId(`ring:${n}`),
            name: null,
            sex: 'unknown',
            ring_country: opts.ring.country,
            ring_number: n,
            ring_code: opts.ring.code,
            ring_year: opts.ring.year,
            sire_id: cockId,
            dam_id: henId,
            clutch_id: clutchId,
          });
        }
      });
    });
  }
  return plan;
}
