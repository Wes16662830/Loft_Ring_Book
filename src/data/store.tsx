import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Backend } from './backend.ts';
import { buildModel, type Model } from './model.ts';
import type { TableName, Tables } from './types.ts';

interface Store {
  model: Model | null;
  loading: boolean;
  error: string | null;
  backend: Backend;
  reload(): Promise<void>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  mergeBirds(keepId: string, dropId: string): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function DataProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setModel(buildModel(await backend.loadAll()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresh when the app comes back to the foreground (another device may have changed data).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const store = useMemo<Store>(
    () => ({
      model,
      loading,
      error,
      backend,
      reload,
      async insert(table, rows) {
        const out = await backend.insert(table, rows);
        await reload();
        return out;
      },
      async update(table, id, patch) {
        await backend.update(table, id, patch);
        await reload();
      },
      async remove(table, id) {
        await backend.remove(table, id);
        await reload();
      },
      async mergeBirds(keepId, dropId) {
        await backend.mergeBirds(keepId, dropId);
        await reload();
      },
    }),
    [model, loading, error, backend, reload],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside DataProvider');
  return s;
}

/** For screens rendered only after data has loaded. */
export function useModel(): Model {
  const { model } = useStore();
  if (!model) throw new Error('Model not loaded');
  return model;
}
