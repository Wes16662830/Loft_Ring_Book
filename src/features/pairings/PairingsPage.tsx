import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import type { Pairing } from '../../data/types.ts';
import { cx, Empty, PageHeader, Select } from '../../components/ui.tsx';
import { PairCard } from './PairCard.tsx';

const NO_BOX = '—';

export function PairingsPage() {
  const m = useModel();
  const [params, setParams] = useSearchParams();
  const seasonId = params.get('season') ?? m.activeSeason?.id ?? '';
  const inSeason = useMemo(() => m.data.pairings.filter((p) => p.season_id === seasonId), [m, seasonId]);
  const numbers = [...new Set(inSeason.map((p) => p.pairing_no))].sort((a, b) => a - b);
  const no = Number(params.get('no') ?? numbers[0] ?? 1);
  const section = params.get('section') ?? 'All';

  const sectionOf = (p: Pairing) => (p.box_id ? (m.box.get(p.box_id)?.section ?? NO_BOX) : NO_BOX);
  const ofNo = inSeason.filter((p) => p.pairing_no === no);
  const sections = [...new Set(ofNo.map(sectionOf))].sort((a, b) => sectionRank(a) - sectionRank(b));
  const shown = ofNo
    .filter((p) => section === 'All' || sectionOf(p) === section)
    .sort((a, b) => {
      const ba = a.box_id ? (m.box.get(a.box_id)?.sort_order ?? 1e9) : 1e9;
      const bb = b.box_id ? (m.box.get(b.box_id)?.sort_order ?? 1e9) : 1e9;
      return ba - bb || (a.block ?? '').localeCompare(b.block ?? '') || a.sort_order - b.sort_order;
    });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const seasons = [...m.data.seasons].sort((a, b) => b.year - a.year);

  return (
    <div>
      <PageHeader
        title="Pairs"
        action={
          <Link to={`/pairings/new?season=${seasonId}&no=${no}`} className="inline-flex min-h-12 items-center rounded-xl bg-slate-900 px-4 font-semibold text-white dark:bg-amber-400 dark:text-slate-950">
            + Pair
          </Link>
        }
      />
      {seasons.length > 1 && (
        <Select value={seasonId} onChange={(e) => set({ season: e.target.value, no: null, section: null })} className="mb-3" aria-label="Season">
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_active ? ' (active)' : ''}
            </option>
          ))}
        </Select>
      )}
      {seasons.length === 0 && <Empty>No season yet. Add one under More → Seasons.</Empty>}

      {numbers.length > 0 && (
        <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {numbers.map((n) => (
            <button
              key={n}
              role="tab"
              aria-selected={n === no}
              type="button"
              onClick={() => set({ no: String(n), section: null })}
              className={cx('min-h-12 flex-1 whitespace-nowrap rounded-xl px-3 font-semibold', n === no ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-300')}
            >
              Pairing {n}
              <span className="ml-1 text-sm text-slate-500">({inSeason.filter((p) => p.pairing_no === n).length})</span>
            </button>
          ))}
        </div>
      )}

      {sections.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {['All', ...sections].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ section: s === 'All' ? null : s })}
              className={cx(
                'min-h-11 rounded-full border-2 px-4 font-semibold',
                s === section ? 'border-slate-900 bg-slate-900 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950' : 'border-slate-300 dark:border-slate-600',
              )}
            >
              {sectionLabel(s)}
            </button>
          ))}
        </div>
      )}

      {numbers.length > 0 && shown.length === 0 && <Empty>No pairs here.</Empty>}
      {seasons.length > 0 && numbers.length === 0 && <Empty>No pairs in this season yet. Tap + Pair.</Empty>}
      <div className="space-y-3">
        {shown.map((p) => (
          <PairCard key={p.id} pairing={p} />
        ))}
      </div>
    </div>
  );
}

function sectionRank(s: string): number {
  const i = ['L', 'R', 'Q', 'Race'].indexOf(s);
  return i === -1 ? (s === NO_BOX ? 99 : 50) : i;
}

function sectionLabel(s: string): string {
  return { L: 'L', R: 'R', Q: 'Quarantine', Race: 'Race', [NO_BOX]: 'No box' }[s] ?? s;
}
