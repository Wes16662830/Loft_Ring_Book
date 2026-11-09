import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import { pairFlags, pairingTitle, seasonStats } from '../../data/model.ts';
import { findDuplicateRings, formatRing } from '../../lib/rings.ts';
import { BirdName, Card, Chip, Empty, PageHeader, Select } from '../../components/ui.tsx';

export function StatsPage() {
  const m = useModel();
  const [seasonId, setSeasonId] = useState(m.activeSeason?.id ?? '');
  const s = seasonStats(m, seasonId);
  const numbers = [...new Set(s.rows.map((r) => r.pairing.pairing_no))].sort((a, b) => a - b);
  // Pairing numbers that have started producing youngsters; zero-youngster pairs only count there.
  const producing = new Set(s.rows.filter((r) => r.youngsters > 0).map((r) => r.pairing.pairing_no));
  const zero = s.zero.filter((r) => producing.has(r.pairing.pairing_no));
  const dups = findDuplicateRings(m.data.birds);
  const flagged = s.rows.flatMap((r) => pairFlags(m, r.pairing).filter((f) => f.level === 'warn').map((f) => ({ p: r.pairing, f })));

  return (
    <div className="space-y-4">
      <PageHeader title="Stats" />
      {m.data.seasons.length > 1 && (
        <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} aria-label="Season">
          {[...m.data.seasons].sort((a, b) => b.year - a.year).map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </Select>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Youngsters" value={s.totalYoungsters} />
        <Tile label="Pairs" value={s.rows.length} />
        <Tile label="Gaps" value={s.usage.reduce((a, u) => a + u.gaps.length, 0)} />
      </div>

      <Section title={`Pairs with zero youngsters (${zero.length})`}>
        {zero.length === 0 ? <Empty>None.</Empty> : <PairList pairs={zero.map((r) => r.pairing)} />}
      </Section>

      <Section title={`Single-youngster rounds (${s.singles.length})`}>
        {s.singles.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <ul className="space-y-1">
            {s.singles.map(({ pairing, clutch }) => (
              <li key={clutch.id}>
                <Link to={`/pairings/${pairing.id}`} className="flex min-h-11 items-center gap-2">
                  <strong className="w-16">{pairingTitle(m, pairing)}</strong>
                  <span>Round {clutch.round_no}</span>
                  {(m.youngstersOf.get(clutch.id) ?? []).map((b) => (
                    <span key={b.id} className="ringnum text-lg font-bold">{b.ring_number}</span>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ring gaps">
        {s.usage.length === 0 && <Empty>No ring sequences yet. Add them under More → Ring sequences.</Empty>}
        {s.usage.map((u) => (
          <div key={u.sequence.id} className="mb-3">
            <p className="font-semibold">
              <span className="ringnum text-lg">
                {u.sequence.country} {u.sequence.start_no}–{u.sequence.end_no} {u.sequence.code} {u.sequence.year}
              </span>
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {u.used.length} used{u.used.length > 0 && ` (${u.used[0]}–${u.used[u.used.length - 1]})`} · {u.remaining} not yet used
            </p>
            {u.gaps.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {u.gaps.map((g) => (
                  <Link key={g} to={`/?q=${g}`}>
                    <Chip tone="warn" className="ringnum text-lg">{g}</Chip>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm">No gaps.</p>
            )}
          </div>
        ))}
      </Section>

      {(dups.length > 0 || flagged.length > 0) && (
        <Section title="Check these">
          {dups.map((g, i) => (
            <p key={i}>Duplicate ring {formatRing(g[0])} on {g.length} birds.</p>
          ))}
          <ul className="space-y-1">
            {flagged.map(({ p, f }, i) => (
              <li key={i}>
                <Link to={`/pairings/${p.id}`} className="underline underline-offset-4">
                  Pairing {p.pairing_no} · {pairingTitle(m, p)}
                </Link>
                : {f.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {numbers.map((n) => (
        <Section key={n} title={`Youngsters per pair — pairing ${n}`}>
          <table className="w-full">
            <tbody>
              {s.rows
                .filter((r) => r.pairing.pairing_no === n)
                .map((r) => (
                  <tr key={r.pairing.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 pr-2 font-semibold">
                      <Link to={`/pairings/${r.pairing.id}`}>{pairingTitle(m, r.pairing)}</Link>
                    </td>
                    <td className="py-2 text-sm">
                      <BirdName bird={m.bird.get(r.pairing.cock_id)} /> × <BirdName bird={m.bird.get(r.pairing.hen_id)} />
                    </td>
                    <td className="ringnum py-2 pl-2 text-right text-2xl font-bold">{r.youngsters}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      ))}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 text-center">
      <div className="ringnum text-4xl font-bold">{value}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400">{label}</div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </Card>
  );
}

function PairList({ pairs }: { pairs: import('../../data/types.ts').Pairing[] }) {
  const m = useModel();
  return (
    <ul className="space-y-1">
      {pairs.map((p) => (
        <li key={p.id}>
          <Link to={`/pairings/${p.id}`} className="flex min-h-11 items-center gap-2">
            <strong className="w-16">{pairingTitle(m, p)}</strong>
            <span className="text-sm">
              <BirdName bird={m.bird.get(p.cock_id)} /> × <BirdName bird={m.bird.get(p.hen_id)} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
