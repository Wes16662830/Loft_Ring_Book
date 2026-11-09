import type { AllData, TableName, Tables } from './types.ts';

export interface Backend {
  loadAll(): Promise<AllData>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  mergeBirds(keepId: string, dropId: string): Promise<void>;
}

export class BackendError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new BackendError('No connection — check your signal and try again.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new BackendError(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

/** Talks to the Cloudflare Pages Functions API in /functions (backed by D1). */
export class ApiBackend implements Backend {
  loadAll() {
    return call<AllData>('GET', 'data');
  }
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]) {
    return call<Tables[T][]>('POST', table, { rows });
  }
  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    await call('PATCH', `${table}/${encodeURIComponent(id)}`, patch);
  }
  async remove(table: TableName, id: string) {
    await call('DELETE', `${table}/${encodeURIComponent(id)}`);
  }
  async mergeBirds(keepId: string, dropId: string) {
    await call('POST', 'merge-birds', { keepId, dropId });
  }
}
