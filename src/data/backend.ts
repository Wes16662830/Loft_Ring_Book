import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AllData, Bird, TableName, Tables } from './types.ts';

export interface Backend {
  kind: 'supabase' | 'demo';
  loadAll(): Promise<AllData>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  mergeBirds(keepId: string, dropId: string): Promise<void>;
}

export class BackendError extends Error {}

const TABLES: TableName[] = ['birds', 'boxes', 'seasons', 'pairings', 'clutches', 'ring_sequences', 'comments'];

function friendly(err: { code?: string; message: string; details?: string | null }): BackendError {
  if (err.code === '23505') return new BackendError('That ring number is already recorded.');
  if (err.code === '23503') {
    return new BackendError('This bird is still used in a pair. Remove it from the pair (or delete the pair) first.');
  }
  if (err.code === '42501') return new BackendError('Your account is not allowed to change data.');
  if (err.code === '23514') return new BackendError('That value is not allowed: ' + err.message);
  return new BackendError(err.message);
}

// ---------------------------------------------------------------------------

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export class SupabaseBackend implements Backend {
  kind = 'supabase' as const;

  async loadAll(): Promise<AllData> {
    const entries = await Promise.all(
      TABLES.map(async (t) => {
        const rows: unknown[] = [];
        const page = 1000;
        for (let from = 0; ; from += page) {
          const { data, error } = await supabase().from(t).select('*').order('id').range(from, from + page - 1);
          if (error) throw friendly(error);
          rows.push(...data);
          if (data.length < page) break;
        }
        return [t, rows] as const;
      }),
    );
    return Object.fromEntries(entries) as unknown as AllData;
  }

  async insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
    const { data, error } = await supabase().from(table).insert(rows as never).select('*');
    if (error) throw friendly(error);
    return data as Tables[T][];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    const { error } = await supabase().from(table).update(patch as never).eq('id', id);
    if (error) throw friendly(error);
  }

  async remove(table: TableName, id: string): Promise<void> {
    const { error } = await supabase().from(table).delete().eq('id', id);
    if (error) throw friendly(error);
  }

  async mergeBirds(keepId: string, dropId: string): Promise<void> {
    const { error } = await supabase().rpc('merge_birds', { keep_id: keepId, drop_id: dropId });
    if (error) throw friendly(error);
  }
}

// ---------------------------------------------------------------------------
// In-memory backend for trying the app without Supabase. Mirrors the database rules
// that matter for the UI (unique rings, delete restrictions and cascades). Nothing is saved.

const DEFAULTS: { [K in TableName]: Partial<Tables[K]> } = {
  birds: {
    ring_country: null, ring_number: null, ring_code: null, ring_year: null, name: null, sex: 'unknown',
    colour: null, hatch_date: null, sire_id: null, dam_id: null, clutch_id: null, status: 'active', notes: null,
  },
  boxes: { section: 'Other', sort_order: 0, active: true, notes: null },
  seasons: { is_active: false },
  pairings: { pairing_no: 1, box_id: null, block: null, sort_order: 0, notes: null },
  clutches: { laid_date: null, notes: null },
  ring_sequences: { country: 'ZA', notes: null },
  comments: { bird_id: null, pairing_id: null },
};

export class MemoryBackend implements Backend {
  kind = 'demo' as const;
  constructor(private db: AllData) {}

  async loadAll(): Promise<AllData> {
    return structuredClone(this.db);
  }

  private ringClash(b: Partial<Bird>, ignore?: string): boolean {
    if (b.ring_number == null) return false;
    const k = (x: Partial<Bird>) => `${(x.ring_country ?? '').toUpperCase()}|${x.ring_number}|${(x.ring_code ?? '').toUpperCase()}|${x.ring_year ?? ''}`;
    return this.db.birds.some((o) => o.id !== ignore && o.ring_number != null && k(o) === k(b));
  }

  async insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]> {
    const now = new Date().toISOString();
    const made = rows.map((r) => ({ ...DEFAULTS[table], id: crypto.randomUUID(), created_at: now, ...r }) as Tables[T]);
    if (table === 'birds') {
      for (const b of made as Bird[]) if (this.ringClash(b)) throw new BackendError('That ring number is already recorded.');
    }
    (this.db[table] as Tables[T][]).push(...made);
    return structuredClone(made);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    const rows = this.db[table] as Tables[T][];
    const row = rows.find((r) => r.id === id);
    if (!row) throw new BackendError('Record not found.');
    if (table === 'birds' && this.ringClash({ ...(row as Bird), ...(patch as Partial<Bird>) }, id)) {
      throw new BackendError('That ring number is already recorded.');
    }
    Object.assign(row, patch);
  }

  async remove(table: TableName, id: string): Promise<void> {
    const d = this.db;
    if (table === 'birds' && d.pairings.some((p) => p.cock_id === id || p.hen_id === id)) {
      throw new BackendError('This bird is still used in a pair. Remove it from the pair (or delete the pair) first.');
    }
    if (table === 'birds') {
      for (const b of d.birds) {
        if (b.sire_id === id) b.sire_id = null;
        if (b.dam_id === id) b.dam_id = null;
      }
      d.comments = d.comments.filter((c) => c.bird_id !== id);
    }
    if (table === 'pairings') {
      const clutchIds = new Set(d.clutches.filter((c) => c.pairing_id === id).map((c) => c.id));
      d.clutches = d.clutches.filter((c) => c.pairing_id !== id);
      for (const b of d.birds) if (b.clutch_id && clutchIds.has(b.clutch_id)) b.clutch_id = null;
      d.comments = d.comments.filter((c) => c.pairing_id !== id);
    }
    if (table === 'clutches') for (const b of d.birds) if (b.clutch_id === id) b.clutch_id = null;
    if (table === 'boxes') for (const p of d.pairings) if (p.box_id === id) p.box_id = null;
    if (table === 'seasons') {
      const ids = d.pairings.filter((p) => p.season_id === id).map((p) => p.id);
      for (const pid of ids) await this.remove('pairings', pid);
    }
    (d[table] as { id: string }[]) = (d[table] as { id: string }[]).filter((r) => r.id !== id);
  }

  async mergeBirds(keepId: string, dropId: string): Promise<void> {
    const d = this.db;
    const k = d.birds.find((b) => b.id === keepId);
    const x = d.birds.find((b) => b.id === dropId);
    if (!k || !x || k === x) throw new BackendError('Choose two different birds.');
    if (k.sex !== 'unknown' && x.sex !== 'unknown' && k.sex !== x.sex) throw new BackendError('One bird is a cock and the other a hen.');
    if (k.ring_number != null && x.ring_number != null && k.ring_number !== x.ring_number) {
      throw new BackendError('Both birds have different rings — edit one first.');
    }
    for (const b of d.birds) {
      if (b.sire_id === dropId) b.sire_id = keepId;
      if (b.dam_id === dropId) b.dam_id = keepId;
    }
    for (const p of d.pairings) {
      if (p.cock_id === dropId) p.cock_id = keepId;
      if (p.hen_id === dropId) p.hen_id = keepId;
    }
    for (const c of d.comments) if (c.bird_id === dropId) c.bird_id = keepId;
    d.comments.push({ id: crypto.randomUUID(), bird_id: keepId, pairing_id: null, body: `Merged with "${x.name ?? x.ring_number}".`, created_at: new Date().toISOString() });
    d.birds = d.birds.filter((b) => b.id !== dropId);
    for (const f of ['ring_country', 'ring_number', 'ring_code', 'ring_year', 'name', 'colour', 'hatch_date', 'sire_id', 'dam_id', 'clutch_id'] as const) {
      if (k[f] == null) (k as unknown as Record<string, unknown>)[f] = x[f];
    }
    if (k.sex === 'unknown') k.sex = x.sex;
    k.notes = [k.notes, x.notes].filter(Boolean).join('\n') || null;
  }
}

/** Demo data built from the seed text with the same parser as the real seed. */
export async function createDemoBackend(): Promise<MemoryBackend> {
  const [{ buildImportPlan, parsePairingText }, { PAIRING_1, PAIRING_2 }, { DEFAULT_RING }] = await Promise.all([
    import('../lib/pairingText.ts'),
    import('../../supabase/seed/seed-data.ts'),
    import('../lib/rings.ts'),
  ]);
  const plan = buildImportPlan({
    sections: [
      { pairingNo: 1, pairs: parsePairingText(PAIRING_1, 'box').pairs },
      { pairingNo: 2, pairs: parsePairingText(PAIRING_2, 'block').pairs },
    ],
    ring: DEFAULT_RING,
    newId: () => crypto.randomUUID(),
  });
  const seasonId = crypto.randomUUID();
  const now = new Date().toISOString();
  return new MemoryBackend({
    seasons: [{ id: seasonId, name: '2026 breeding', year: 2026, is_active: true }],
    boxes: plan.boxes.map((b) => ({ ...b, active: true, notes: null })),
    birds: plan.birds.map((b) => ({ ...b, colour: null, hatch_date: null, status: 'active', notes: null, created_at: now })),
    pairings: plan.pairings.map((p) => ({ ...p, season_id: seasonId, notes: null })),
    clutches: plan.clutches.map((c) => ({ ...c, laid_date: null, notes: null })),
    ring_sequences: [
      { id: crypto.randomUUID(), country: 'ZA', code: 'BORD', year: 2026, start_no: 2901, end_no: 3000, notes: null },
      { id: crypto.randomUUID(), country: 'ZA', code: 'BORD', year: 2026, start_no: 3901, end_no: 4000, notes: null },
    ],
    comments: [],
  });
}
