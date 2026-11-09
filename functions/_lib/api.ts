// Loft Book API. Pure request → response logic over a minimal D1-compatible interface,
// so the same code runs on Cloudflare D1 and on node:sqlite in the tests.

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown[]>;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

// Writable columns per table. Anything else in a request body is ignored.
const COLUMNS: Record<string, string[]> = {
  birds: ['ring_country', 'ring_number', 'ring_code', 'ring_year', 'name', 'sex', 'colour', 'hatch_date', 'sire_id', 'dam_id', 'clutch_id', 'status', 'notes'],
  boxes: ['name', 'section', 'sort_order', 'active', 'notes'],
  seasons: ['name', 'year', 'is_active'],
  pairings: ['season_id', 'pairing_no', 'box_id', 'block', 'cock_id', 'hen_id', 'sort_order', 'notes'],
  clutches: ['pairing_id', 'round_no', 'laid_date', 'notes'],
  ring_sequences: ['country', 'code', 'year', 'start_no', 'end_no', 'notes'],
  comments: ['bird_id', 'pairing_id', 'body'],
};
const BOOLEANS: Record<string, string[]> = { boxes: ['active'], seasons: ['is_active'] };
// Insert order for a full restore: referenced tables first.
export const TABLES = ['seasons', 'boxes', 'ring_sequences', 'birds', 'pairings', 'clutches', 'comments'];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toDb(table: string, col: string, v: unknown): unknown {
  if (v === undefined) return null;
  if (BOOLEANS[table]?.includes(col)) return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() === '' && col !== 'body') return null;
  return v;
}

function fromDb(table: string, row: Record<string, unknown>): Record<string, unknown> {
  for (const c of BOOLEANS[table] ?? []) row[c] = row[c] === 1 || row[c] === true;
  return row;
}

function friendly(err: unknown): HttpError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed: birds|birds_ring_key/i.test(msg)) return new HttpError(409, 'That ring number is already recorded.');
  if (/UNIQUE constraint failed: boxes|boxes_name_key/i.test(msg)) return new HttpError(409, 'There is already a box with that name.');
  if (/UNIQUE constraint failed: clutches/i.test(msg)) return new HttpError(409, 'That round already exists for this pair.');
  if (/UNIQUE constraint failed: seasons|seasons_one_active/i.test(msg)) return new HttpError(409, 'Only one season can be active.');
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return new HttpError(409, 'This bird is still used in a pair (or a linked record is missing). Remove it from the pair first.');
  }
  if (/CHECK constraint failed/i.test(msg)) return new HttpError(400, 'That value is not allowed.');
  return new HttpError(500, msg);
}

// D1 allows at most 100 bound parameters per statement, and the free plan caps queries per
// request, so rows are inserted with multi-row INSERTs grouped by the columns they set.
const MAX_PARAMS = 99;
export const MAX_ROWS_PER_REQUEST = 200;

function insertStmts(db: Db, table: string, rows: Record<string, unknown>[]): { stmts: Stmt[]; ids: string[] } {
  const ids = rows.map((r) => (typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID()));
  const groups = new Map<string, { cols: string[]; idx: number[] }>();
  rows.forEach((r, i) => {
    const cols = COLUMNS[table].filter((c) => c in r && r[c] !== undefined);
    const key = cols.join(',');
    const g = groups.get(key);
    if (g) g.idx.push(i);
    else groups.set(key, { cols, idx: [i] });
  });
  const stmts: Stmt[] = [];
  for (const { cols, idx } of groups.values()) {
    const per = Math.max(1, Math.floor(MAX_PARAMS / (cols.length + 1)));
    for (let i = 0; i < idx.length; i += per) {
      const chunk = idx.slice(i, i + per);
      const tuple = `(?${', ?'.repeat(cols.length)})`;
      const sql = `INSERT INTO ${table} (id${cols.map((c) => ', ' + c).join('')}) VALUES ${chunk.map(() => tuple).join(', ')}`;
      const params = chunk.flatMap((ri) => [ids[ri], ...cols.map((c) => toDb(table, c, rows[ri][c]))]);
      stmts.push(db.prepare(sql).bind(...params));
    }
  }
  return { stmts, ids };
}

async function loadAll(db: Db) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { results } = await db.prepare(`SELECT * FROM ${t}`).all();
    out[t] = results.map((r) => fromDb(t, r as Record<string, unknown>));
  }
  return out;
}

async function mergeBirds(db: Db, keepId: string, dropId: string) {
  if (!keepId || !dropId || keepId === dropId) throw new HttpError(400, 'Choose two different birds.');
  const k = await db.prepare('SELECT * FROM birds WHERE id = ?').bind(keepId).first<Record<string, unknown>>();
  const d = await db.prepare('SELECT * FROM birds WHERE id = ?').bind(dropId).first<Record<string, unknown>>();
  if (!k || !d) throw new HttpError(404, 'Bird not found.');
  if (k.sire_id === dropId || k.dam_id === dropId || d.sire_id === keepId || d.dam_id === keepId) {
    throw new HttpError(400, 'One bird is a parent of the other — they cannot be the same bird.');
  }
  if (k.sex !== 'unknown' && d.sex !== 'unknown' && k.sex !== d.sex) throw new HttpError(400, 'One bird is a cock and the other a hen.');
  const ringOf = (b: Record<string, unknown>) => [b.ring_country, b.ring_number, b.ring_code, b.ring_year].join('|');
  if (k.ring_number != null && d.ring_number != null && ringOf(k) !== ringOf(d)) {
    throw new HttpError(400, 'Both birds have different rings — edit one first.');
  }
  // Would the merge put the same bird on both sides of a pair?
  const clash = await db
    .prepare('SELECT 1 FROM pairings WHERE (cock_id = ?1 AND hen_id = ?2) OR (cock_id = ?2 AND hen_id = ?1)')
    .bind(keepId, dropId)
    .first();
  if (clash) throw new HttpError(400, 'These two birds are paired with each other.');

  const fill = (f: string) => (k[f] ?? d[f]) as unknown;
  const notes = [k.notes, d.notes].filter(Boolean).join('\n') || null;
  await db.batch([
    db.prepare('UPDATE birds SET sire_id = ?1 WHERE sire_id = ?2').bind(keepId, dropId),
    db.prepare('UPDATE birds SET dam_id = ?1 WHERE dam_id = ?2').bind(keepId, dropId),
    db.prepare('UPDATE pairings SET cock_id = ?1 WHERE cock_id = ?2').bind(keepId, dropId),
    db.prepare('UPDATE pairings SET hen_id = ?1 WHERE hen_id = ?2').bind(keepId, dropId),
    db.prepare('UPDATE comments SET bird_id = ?1 WHERE bird_id = ?2').bind(keepId, dropId),
    db.prepare('INSERT INTO comments (id, bird_id, body) VALUES (?, ?, ?)').bind(
      crypto.randomUUID(),
      keepId,
      `Merged with "${d.name ?? d.ring_number ?? d.id}".`,
    ),
    db.prepare('DELETE FROM birds WHERE id = ?').bind(dropId),
    db
      .prepare(
        `UPDATE birds SET ring_country = ?, ring_number = ?, ring_code = ?, ring_year = ?, name = ?, sex = ?,
           colour = ?, hatch_date = ?, sire_id = ?, dam_id = ?, clutch_id = ?, notes = ? WHERE id = ?`,
      )
      .bind(
        fill('ring_country'), fill('ring_number'), fill('ring_code'), fill('ring_year'), fill('name'),
        k.sex === 'unknown' ? d.sex : k.sex,
        fill('colour'), fill('hatch_date'), fill('sire_id'), fill('dam_id'), fill('clutch_id'), notes, keepId,
      ),
  ]);
}

/**
 * Routes:
 *   GET    /api/data                 → every table
 *   POST   /api/:table   {rows: []}  → insert (atomic), returns the rows
 *   PATCH  /api/:table/:id  {patch}  → update
 *   DELETE /api/:table/:id           → delete
 *   POST   /api/merge-birds {keepId, dropId}
 */
export async function handleApi(db: Db, method: string, path: string, body: unknown): Promise<ApiResponse> {
  try {
    const parts = path.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
    const [first, id] = parts;

    if (method === 'GET' && first === 'data' && parts.length === 1) return { status: 200, body: await loadAll(db) };
    if (method === 'GET' && first === 'health') return { status: 200, body: { ok: true } };

    if (method === 'POST' && first === 'merge-birds') {
      const b = (body ?? {}) as { keepId?: string; dropId?: string };
      await mergeBirds(db, String(b.keepId ?? ''), String(b.dropId ?? ''));
      return { status: 200, body: { ok: true } };
    }

    if (!first || !(first in COLUMNS)) throw new HttpError(404, 'Not found.');
    const table = first;

    if (method === 'POST' && parts.length === 1) {
      const rows = (body as { rows?: unknown })?.rows;
      if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'Send {"rows": [...]}.');
      if (rows.length > MAX_ROWS_PER_REQUEST) throw new HttpError(400, `At most ${MAX_ROWS_PER_REQUEST} rows per request.`);
      const { stmts, ids } = insertStmts(db, table, rows.map((r) => (r ?? {}) as Record<string, unknown>));
      await db.batch(stmts);
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i += MAX_PARAMS) {
        const chunk = ids.slice(i, i + MAX_PARAMS);
        const { results } = await db.prepare(`SELECT * FROM ${table} WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
        out.push(...results.map((r) => fromDb(table, r as Record<string, unknown>)));
      }
      const order = new Map(ids.map((x, i) => [x, i]));
      out.sort((a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0));
      return { status: 201, body: out };
    }

    if (method === 'PATCH' && id && parts.length === 2) {
      const patch = (body ?? {}) as Record<string, unknown>;
      const cols = COLUMNS[table].filter((c) => c in patch);
      if (!cols.length) return { status: 200, body: { ok: true } };
      await db
        .prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .bind(...cols.map((c) => toDb(table, c, patch[c])), id)
        .run();
      return { status: 200, body: { ok: true } };
    }

    if (method === 'DELETE' && id && parts.length === 2) {
      await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
      return { status: 200, body: { ok: true } };
    }

    throw new HttpError(405, 'Method not allowed.');
  } catch (e) {
    const err = e instanceof HttpError ? e : friendly(e);
    return { status: err.status, body: { error: err.message } };
  }
}
