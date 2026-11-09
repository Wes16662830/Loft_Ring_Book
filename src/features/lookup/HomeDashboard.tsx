import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import { originOf, pairFlags, pairingTitle, seasonStats, youngstersOfPairing } from '../../data/model.ts';
import type { Bird } from '../../data/types.ts';
import { BirdName, Button, cx } from '../../components/ui.tsx';
import { AlertIcon, ChevronIcon, PlusIcon, RingIcon } from '../../components/icons.tsx';
import { AddRingsSheet, getLastPairId } from '../pairings/AddRingsSheet.tsx';

/** Shown under the search box when nothing is typed. */
export function HomeDashboard() {
  const m = useModel();
  const season = m.activeSeason;
  const s = seasonStats(m, season?.id ?? null);
  const latestNo = Math.max(0, ...s.rows.map((r) => r.pairing.pairing_no));
  const producing = new Set(s.rows.filter((r) => r.youngsters > 0).map((r) => r.pairing.pairing_no));
  const zero = s.zero.filter((r) => producing.has(r.pairing.pairing_no)).length;
  const gaps = s.usage.reduce((a, u) => a + u.gaps.length, 0);
  const warnings = s.rows.flatMap((r) => pairFlags(m, r.pairing).filter((f) => f.level === 'warn'));

  const seasonYoung = new Set(s.rows.flatMap((r) => youngstersOfPairing(m, r.pairing).map((b) => b.id)));
  const recent = m.data.birds
    .filter((b) => b.ring_number != null && seasonYoung.has(b.id))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || (b.ring_number ?? 0) - (a.ring_number ?? 0))
    .slice(0, 8);

  if (!season) {
    return (
      <Panel title="Get started">
        <p className="mb-3">Add your first breeding season to start recording pairs and rings.</p>
        <Link to="/seasons" className="inline-flex min-h-12 items-center rounded-xl bg-slate-900 px-4 font-semibold text-white dark:bg-amber-400 dark:text-slate-950">
          Add a season
        </Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile to="/stats" value={s.totalYoungsters} label="Youngsters" />
        <Tile to={`/pairings?no=${latestNo || 1}`} value={s.rows.filter((r) => r.pairing.pairing_no === latestNo).length} label={latestNo ? `Pairs · P${latestNo}` : 'Pairs'} />
        <Tile to="/stats" value={gaps} label="Ring gaps" tone={gaps ? 'warn' : undefined} />
      </div>

      <ContinueRinging />

      {recent.length > 0 && (
        <Panel title="Recently rung">
          <ul className="grid grid-cols-2 gap-2">
            {recent.map((b) => (
              <RecentChip key={b.id} bird={b} />
            ))}
          </ul>
        </Panel>
      )}

      {(warnings.length > 0 || zero > 0) && (
        <Link to="/stats" className="flex items-center gap-3 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">
          <AlertIcon size={24} className="shrink-0" />
          <span className="flex-1">
            <strong>Worth checking:</strong>{' '}
            {[warnings.length && `${warnings.length} round${warnings.length > 1 ? 's' : ''} flagged`, zero && `${zero} pair${zero > 1 ? 's' : ''} with no youngsters`]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <ChevronIcon size={20} />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Quick to="/pairings/new" label="Add pair" />
        <Quick to="/birds/new" label="Add bird" />
        <Quick to="/sequences" label="Ring sequences" />
        <Quick to="/import-export" label="Export / import" />
      </div>
      <p className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        {m.data.birds.length} birds · {m.data.pairings.length} pairs across {m.data.seasons.length} season{m.data.seasons.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function ContinueRinging() {
  const m = useModel();
  const [open, setOpen] = useState(false);
  const id = getLastPairId();
  const p = id ? m.pairing.get(id) : undefined;
  if (!p) {
    return (
      <Link to="/pairings" className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white dark:bg-amber-400 dark:text-slate-950">
        <RingIcon size={28} />
        <span className="flex-1">
          <span className="block text-lg font-bold">Ring youngsters</span>
          <span className="text-sm opacity-80">Open a pair and tap + Rings</span>
        </span>
        <ChevronIcon />
      </Link>
    );
  }
  const clutches = m.clutchesOf.get(p.id) ?? [];
  const last = clutches[clutches.length - 1];
  const lastRings = last ? (m.youngstersOf.get(last.id) ?? []).map((b) => b.ring_number).join('/') : '';
  return (
    <section className="rounded-2xl bg-slate-900 p-4 text-white dark:bg-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Continue ringing</p>
      <Link to={`/pairings/${p.id}`} className="mt-1 flex items-center gap-3">
        <span className="rounded-lg bg-amber-400 px-2 py-1 text-xl font-bold text-slate-950">{pairingTitle(m, p)}</span>
        <span className="flex-1 leading-snug">
          <span className="block"><BirdName bird={m.bird.get(p.cock_id)} /></span>
          <span className="block text-slate-300"><BirdName bird={m.bird.get(p.hen_id)} /></span>
        </span>
      </Link>
      {last && (
        <p className="mt-2 text-sm text-slate-300">
          Last: round {last.round_no} <span className="ringnum text-base text-white">{lastRings || 'empty'}</span>
        </p>
      )}
      <Button className="mt-3 w-full bg-amber-400! text-slate-950!" onClick={() => setOpen(true)}>
        <PlusIcon size={20} /> Rings for {pairingTitle(m, p)}
      </Button>
      <AddRingsSheet pairing={p} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function RecentChip({ bird }: { bird: Bird }) {
  const m = useModel();
  const o = originOf(m, bird);
  return (
    <li>
      <Link
        to={`/birds/${bird.id}`}
        className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-slate-300 px-3 active:bg-slate-100 dark:border-slate-700 dark:active:bg-slate-800"
      >
        <span className="ringnum text-2xl font-bold">{bird.ring_number}</span>
        {o && (
          <span className="text-right text-sm leading-tight text-slate-600 dark:text-slate-400">
            {pairingTitle(m, o.pairing)}
            <br />R{o.clutch.round_no}
          </span>
        )}
      </Link>
    </li>
  );
}

function Tile({ to, value, label, tone }: { to: string; value: number; label: string; tone?: 'warn' }) {
  return (
    <Link
      to={to}
      className={cx(
        'rounded-2xl border p-3 text-center active:opacity-80',
        tone === 'warn' ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
      )}
    >
      <span className="ringnum block text-4xl font-bold leading-none">{value}</span>
      <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{label}</span>
    </Link>
  );
}

function Quick({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-300 px-4 font-semibold active:bg-slate-100 dark:border-slate-700 dark:active:bg-slate-800">
      {label}
      <ChevronIcon size={18} className="text-slate-400" />
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{title}</h2>
      {children}
    </section>
  );
}
