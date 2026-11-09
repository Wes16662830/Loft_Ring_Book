import { useMemo, useState } from 'react';
import { useModel } from '../data/store.tsx';
import type { Bird, Sex } from '../data/types.ts';
import { normaliseName } from '../lib/rings.ts';
import { BirdName, Input } from './ui.tsx';

export type PickedBird = { id: string } | { newName: string };

/** Search existing birds by name or ring; or type a new name to create a name-only bird. */
export function BirdPicker({
  label,
  value,
  onChange,
  sex,
  excludeId,
  allowNew = true,
}: {
  label: string;
  value: PickedBird | null;
  onChange: (v: PickedBird | null) => void;
  sex?: Sex;
  excludeId?: string;
  allowNew?: boolean;
}) {
  const m = useModel();
  const [q, setQ] = useState('');
  const selected = value && 'id' in value ? m.bird.get(value.id) : null;

  const matches = useMemo(() => {
    const nq = normaliseName(q);
    if (!nq) return [];
    return m.data.birds
      .filter((b) => b.id !== excludeId)
      .filter((b) => (b.name && normaliseName(b.name).includes(nq)) || (b.ring_number != null && String(b.ring_number).includes(nq)))
      .sort((a, b) => {
        const s = (x: Bird) => (sex && x.sex === sex ? 0 : x.sex === 'unknown' ? 1 : 2);
        return s(a) - s(b) || (a.name ?? '').localeCompare(b.name ?? '');
      })
      .slice(0, 8);
  }, [q, m, sex, excludeId]);

  const exactExists = m.data.birds.some((b) => b.name && normaliseName(b.name) === normaliseName(q));

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <div className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-400 px-3 dark:border-slate-600">
          <span className="flex-1">{selected ? <BirdName bird={selected} /> : <>New bird: <strong>{'newName' in value && value.newName}</strong></>}</span>
          <button type="button" className="min-h-10 rounded-lg px-2 font-semibold text-amber-800 dark:text-amber-300" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ring" aria-label={label} />
      {(matches.length > 0 || (allowNew && q.trim() && !exactExists)) && (
        <ul className="mt-1 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 dark:divide-slate-700 dark:border-slate-600">
          {matches.map((b) => (
            <li key={b.id}>
              <button type="button" className="flex min-h-12 w-full items-center gap-2 px-3 text-left active:bg-slate-100 dark:active:bg-slate-800" onClick={() => onChange({ id: b.id })}>
                <BirdName bird={b} className="flex-1" />
                <span className="text-sm text-slate-600 dark:text-slate-400">{b.sex}</span>
              </button>
            </li>
          ))}
          {allowNew && q.trim() && !exactExists && (
            <li>
              <button type="button" className="min-h-12 w-full px-3 text-left font-semibold text-amber-800 dark:text-amber-300" onClick={() => onChange({ newName: q.trim().replace(/\s+/g, ' ') })}>
                + New bird “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Resolve a picker value to a bird id, creating a name-only bird when needed. */
export async function resolvePicked(
  v: PickedBird,
  sex: Sex,
  insert: (rows: Partial<Bird>[]) => Promise<Bird[]>,
): Promise<string> {
  if ('id' in v) return v.id;
  const [b] = await insert([{ name: v.newName, sex }]);
  return b.id;
}
