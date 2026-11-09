// Runs the real schema, seed and API handler on node:sqlite (D1 is SQLite, with foreign keys on).
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi, type Db, type Stmt } from './api.ts';

function nodeDb(): { db: Db; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  const stmt = (sql: string, params: unknown[] = []): Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async <T,>() => ({ results: raw.prepare(sql).all(...(params as never[])) as T[] }),
    first: async <T,>() => (raw.prepare(sql).get(...(params as never[])) as T) ?? null,
    run: async () => raw.prepare(sql).run(...(params as never[])),
  });
  const db: Db = {
    prepare: (sql) => stmt(sql),
    // D1 batches are atomic: emulate with a transaction.
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, raw };
}

const root = new URL('../../', import.meta.url);
const schema = readFileSync(new URL('db/schema.sql', root), 'utf8');
const seed = readFileSync(new URL('db/seed.sql', root), 'utf8');

type Row = Record<string, unknown>;

describe('D1 schema, seed and API', () => {
  let db: Db;
  let raw: DatabaseSync;
  const count = (sql: string) => (raw.prepare(sql).get() as { n: number }).n;
  const one = (sql: string) => raw.prepare(sql).get() as Row;

  beforeEach(() => {
    ({ db, raw } = nodeDb());
    raw.exec(schema);
    raw.exec(schema); // idempotent
    raw.exec(seed);
  });

  it('seed totals', () => {
    expect(count('SELECT count(*) n FROM pairings WHERE pairing_no = 1')).toBe(38);
    expect(count('SELECT count(*) n FROM pairings WHERE pairing_no = 2')).toBe(33);
    expect(count('SELECT count(*) n FROM birds WHERE ring_number IS NOT NULL')).toBe(122);
    expect(count('SELECT count(*) n FROM boxes')).toBe(38);
  });

  it('GET /api/data returns every table with booleans', async () => {
    const r = await handleApi(db, 'GET', '/api/data', null);
    expect(r.status).toBe(200);
    const d = r.body as Record<string, Row[]>;
    expect(d.birds).toHaveLength(209);
    expect(d.seasons[0].is_active).toBe(true);
    expect(d.boxes[0].active).toBe(true);
  });

  it('rejects a duplicate ring, case-insensitively and with a missing year', async () => {
    const dup = await handleApi(db, 'POST', '/api/birds', { rows: [{ ring_country: 'za', ring_number: 3901, ring_code: 'bord', ring_year: 2026 }] });
    expect(dup.status).toBe(409);
    expect((dup.body as Row).error).toMatch(/already recorded/);
    expect((await handleApi(db, 'POST', '/api/birds', { rows: [{ ring_number: 1, name: 'a' }] })).status).toBe(201);
    expect((await handleApi(db, 'POST', '/api/birds', { rows: [{ ring_number: 1, name: 'b' }] })).status).toBe(409);
  });

  it('multi-row insert is atomic', async () => {
    const before = count('SELECT count(*) n FROM birds');
    const r = await handleApi(db, 'POST', '/api/birds', { rows: [{ ring_number: 5000, ring_year: 2026 }, { ring_country: 'ZA', ring_number: 3901, ring_code: 'BORD', ring_year: 2026 }] });
    expect(r.status).toBe(409);
    expect(count('SELECT count(*) n FROM birds')).toBe(before);
  });

  it('insert returns rows in order with ids; patch and delete', async () => {
    const r = await handleApi(db, 'POST', '/api/boxes', { rows: [{ name: 'L13', section: 'L', active: true }, { name: 'L14', section: 'L' }] });
    expect(r.status).toBe(201);
    const [a, b] = r.body as Row[];
    expect(a.name).toBe('L13');
    expect(b.name).toBe('L14');
    expect(a.active).toBe(true);
    expect((await handleApi(db, 'PATCH', `/api/boxes/${a.id}`, { name: 'L13 top', active: false, bogus: 1 })).status).toBe(200);
    expect(one(`SELECT name, active FROM boxes WHERE id = '${a.id}'`)).toEqual({ name: 'L13 top', active: 0 });
    expect((await handleApi(db, 'DELETE', `/api/boxes/${b.id}`, null)).status).toBe(200);
    expect(count(`SELECT count(*) n FROM boxes WHERE id = '${b.id}'`)).toBe(0);
  });

  it('refuses to delete a paired bird; deleting a pair keeps youngsters with parents', async () => {
    const hen = one("SELECT id FROM birds WHERE name = 'Mia D'").id as string;
    const del = await handleApi(db, 'DELETE', `/api/birds/${hen}`, null);
    expect(del.status).toBe(409);
    const l1 = one("SELECT p.id FROM pairings p JOIN boxes b ON b.id = p.box_id WHERE b.name = 'L1'").id as string;
    expect((await handleApi(db, 'DELETE', `/api/pairings/${l1}`, null)).status).toBe(200);
    expect(count(`SELECT count(*) n FROM birds WHERE dam_id = '${hen}' AND clutch_id IS NULL`)).toBe(4);
    expect(count(`SELECT count(*) n FROM clutches WHERE pairing_id = '${l1}'`)).toBe(0);
  });

  it('deleting a youngster with offspring clears their parent link', async () => {
    const y = one('SELECT id FROM birds WHERE ring_number = 2927').id as string;
    await handleApi(db, 'POST', '/api/birds', { rows: [{ id: 'kid', name: 'Kid', sire_id: y }] });
    expect((await handleApi(db, 'DELETE', `/api/birds/${y}`, null)).status).toBe(200);
    expect(one("SELECT sire_id FROM birds WHERE id = 'kid'").sire_id).toBeNull();
  });

  it('merges the same hen spelt two ways', async () => {
    const keep = one("SELECT id FROM birds WHERE name = '57 Money Penny'").id as string;
    const drop = one("SELECT id FROM birds WHERE name = '57 Kingpin x Money Penny'").id as string;
    const r = await handleApi(db, 'POST', '/api/merge-birds', { keepId: keep, dropId: drop });
    expect(r.status).toBe(200);
    expect(count(`SELECT count(*) n FROM birds WHERE id = '${drop}'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM pairings WHERE hen_id = '${keep}'`)).toBe(2);
    expect(count(`SELECT count(*) n FROM birds WHERE dam_id = '${keep}'`)).toBe(4);
    expect(count(`SELECT count(*) n FROM comments WHERE bird_id = '${keep}'`)).toBe(1);
  });

  it('refuses bad merges', async () => {
    const cock = one("SELECT id FROM birds WHERE name = 'Grizzle'").id as string;
    const hen = one("SELECT id FROM birds WHERE name = 'Mia D'").id as string;
    expect((await handleApi(db, 'POST', '/api/merge-birds', { keepId: cock, dropId: hen })).status).toBe(400);
    expect((await handleApi(db, 'POST', '/api/merge-birds', { keepId: cock, dropId: cock })).status).toBe(400);
  });

  it('bulk insert of 200 rows uses few statements and stays under 100 params each', async () => {
    let statements = 0;
    let maxParams = 0;
    const counting: Db = {
      prepare: (sql) => {
        const wrap = (st: Stmt, n = 0): Stmt => ({
          bind: (...v: unknown[]) => wrap(st.bind(...v), v.length),
          all: () => { statements++; maxParams = Math.max(maxParams, n); return st.all(); },
          first: () => { statements++; return st.first(); },
          run: () => { statements++; maxParams = Math.max(maxParams, n); return st.run(); },
        });
        return wrap(db.prepare(sql));
      },
      batch: (s) => db.batch(s),
    };
    const rows = Array.from({ length: 200 }, (_, i) => ({ ring_country: 'ZA', ring_number: 6000 + i, ring_code: 'BORD', ring_year: 2026, sex: 'unknown' }));
    const r = await handleApi(counting, 'POST', '/api/birds', { rows });
    expect(r.status).toBe(201);
    expect((r.body as Row[]).map((b) => b.ring_number)).toEqual(rows.map((x) => x.ring_number));
    expect(maxParams).toBeLessThanOrEqual(100);
    expect(statements).toBeLessThan(50);
    expect((await handleApi(db, 'POST', '/api/birds', { rows: [...rows, ...rows] })).status).toBe(400);
  });

  it('only one active season', async () => {
    const r = await handleApi(db, 'POST', '/api/seasons', { rows: [{ name: '2027', year: 2027, is_active: true }] });
    expect(r.status).toBe(409);
  });

  it('unknown routes and tables', async () => {
    expect((await handleApi(db, 'GET', '/api/nope', null)).status).toBe(404);
    expect((await handleApi(db, 'POST', '/api/sqlite_master', { rows: [{}] })).status).toBe(404);
    expect((await handleApi(db, 'PUT', '/api/birds/x', {})).status).toBe(405);
  });
});
