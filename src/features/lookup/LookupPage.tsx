import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import { laterPairings, lookup, nestMates, originOf, pairingsOfBird, pairingTitle } from '../../data/model.ts';
import type { Bird, Pairing } from '../../data/types.ts';
import { BirdLink, BirdName, Card, Chip, Empty, Ring } from '../../components/ui.tsx';
import { PairLine } from '../../components/PairSummary.tsx';

const MODE_KEY = 'loftbook.lookupMode';

export function LookupPage() {
  const m = useModel();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState<'numeric' | 'text'>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'text' ? 'text' : 'numeric';
    } catch {
      return 'numeric';
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => lookup(m, q), [m, q]);

  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
  }, [q, setParams]);

  const switchMode = () => {
    const next = mode === 'numeric' ? 'text' : 'numeric';
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode={mode}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder={mode === 'numeric' ? 'Ring number' : 'Name, colour or box'}
            aria-label="Search ring number or name"
            className="ringnum h-16 w-full rounded-2xl border-2 border-slate-900 bg-white px-4 pr-12 text-3xl font-bold text-slate-950 placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-amber-400 dark:border-slate-300 dark:bg-slate-950 dark:text-slate-50"
          />
          {q && (
            <button type="button" onClick={() => { setQ(''); inputRef.current?.focus(); }} className="absolute top-2 right-1 h-12 w-12 text-2xl text-slate-500" aria-label="Clear">
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={switchMode}
          className="h-16 w-16 rounded-2xl border border-slate-300 bg-slate-100 text-sm font-bold dark:border-slate-600 dark:bg-slate-800"
          aria-label={mode === 'numeric' ? 'Switch to letters keyboard' : 'Switch to number keyboard'}
        >
          {mode === 'numeric' ? 'ABC' : '123'}
        </button>
      </div>

      {result.kind === 'empty' && <Hint />}

      {result.kind === 'exact' && result.birds.map((b) => <BirdResult key={b.id} bird={b} />)}

      {result.kind === 'partial' && (
        <>
          {result.status?.kind === 'gap' && (
            <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <p className="text-lg">
                <span className="ringnum text-2xl font-bold">{result.number}</span> isn’t recorded, but it falls inside the rings already used from{' '}
                <span className="ringnum">{result.status.sequence.country} {result.status.sequence.start_no}–{result.status.sequence.end_no} {result.status.sequence.code} {result.status.sequence.year}</span>.
              </p>
              <p className="mt-1 font-semibold">Gap: unused, lost or not logged.</p>
            </Card>
          )}
          {result.status?.kind === 'unused' && (
            <Card>
              <p>
                <span className="ringnum text-2xl font-bold">{result.number}</span> isn’t recorded. It is above the highest ring used so far in{' '}
                <span className="ringnum">{result.status.sequence.start_no}–{result.status.sequence.end_no}</span> — not used yet.
              </p>
            </Card>
          )}
          {result.birds.length > 0 ? (
            <ResultList birds={result.birds} />
          ) : (
            result.status?.kind === 'unknown' && <Empty>No ring matches “{q}”.</Empty>
          )}
        </>
      )}

      {result.kind === 'text' && (
        <>
          {result.birds.length === 0 && result.pairings.length === 0 && <Empty>Nothing matches “{q}”.</Empty>}
          {result.birds.length > 0 && <ResultList birds={result.birds} />}
          {result.pairings.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-bold">Pairs</h2>
              {result.pairings.map((p) => (
                <PairLine key={p.id} pairing={p} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Hint() {
  const m = useModel();
  return (
    <div className="space-y-3 text-slate-700 dark:text-slate-300">
      <p>Type a ring number for its parents, box and nest mate. Tap ABC to search by name.</p>
      <p className="text-sm">
        {m.data.birds.filter((b) => b.ring_number != null).length} ringed birds · {m.data.birds.filter((b) => b.ring_number == null).length} named birds ·{' '}
        {m.data.pairings.length} pairs
      </p>
      <Link to="/birds/new" className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-slate-600">
        + Add a bird
      </Link>
    </div>
  );
}

function ResultList({ birds }: { birds: Bird[] }) {
  const m = useModel();
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-300 dark:divide-slate-700 dark:border-slate-700">
      {birds.map((b) => {
        const o = originOf(m, b);
        return (
          <li key={b.id}>
            <Link to={`/birds/${b.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-slate-100 dark:active:bg-slate-800">
              <span className="flex-1">
                <BirdName bird={b} />
              </span>
              {o && (
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {pairingTitle(m, o.pairing)} · R{o.clutch.round_no}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 border-t border-slate-200 py-2 dark:border-slate-700">
      <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BirdResult({ bird }: { bird: Bird }) {
  const m = useModel();
  const o = originOf(m, bird);
  const sire = bird.sire_id ? m.bird.get(bird.sire_id) : null;
  const dam = bird.dam_id ? m.bird.get(bird.dam_id) : null;
  const mates = nestMates(m, bird);
  const sireLater = o && sire ? laterPairings(m, sire.id, o.pairing) : [];
  const damLater = o && dam ? laterPairings(m, dam.id, o.pairing) : [];
  const own = pairingsOfBird(m, bird.id);

  return (
    <Card className="border-2 border-slate-900 dark:border-slate-300">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {bird.ring_number != null ? <Ring bird={bird} className="block text-4xl font-bold" /> : <p className="text-2xl font-bold">{bird.name}</p>}
          {bird.ring_number != null && bird.name && <p className="text-lg">{bird.name}</p>}
        </div>
        {bird.status !== 'active' && <Chip tone="warn">{bird.status}</Chip>}
      </div>
      {o && (
        <div className="my-3 flex gap-2">
          <div className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-white dark:bg-amber-400 dark:text-slate-950">
            <div className="text-xs font-semibold uppercase opacity-80">Box</div>
            <div className="text-2xl font-bold">{pairingTitle(m, o.pairing)}</div>
          </div>
          <div className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600">
            <div className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Round</div>
            <div className="text-2xl font-bold">{o.clutch.round_no}</div>
          </div>
          <div className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600">
            <div className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Pairing</div>
            <div className="text-2xl font-bold">{o.pairing.pairing_no}</div>
          </div>
        </div>
      )}
      <dl>
        <Row label="Sire">
          <BirdLink bird={sire} />
          {sire && <Later list={sireLater} parentId={sire.id} />}
        </Row>
        <Row label="Dam">
          <BirdLink bird={dam} />
          {dam && <Later list={damLater} parentId={dam.id} />}
        </Row>
        {o && (
          <Row label="Nest mate">
            {mates.length ? (
              mates.map((x) => (
                <div key={x.id}>
                  <BirdLink bird={x} />
                </div>
              ))
            ) : (
              <span className="text-slate-600 dark:text-slate-400">None (single)</span>
            )}
          </Row>
        )}
        {bird.colour && <Row label="Colour">{bird.colour}</Row>}
        {bird.sex !== 'unknown' && <Row label="Sex">{bird.sex}</Row>}
      </dl>
      {own.length > 0 && (
        <div className="mt-2 space-y-2">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">Paired in</h3>
          {own.map((p) => (
            <PairLine key={p.id} pairing={p} highlight={bird.id} />
          ))}
        </div>
      )}
      <Link to={`/birds/${bird.id}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl border border-slate-300 font-semibold dark:border-slate-600">
        Open bird
      </Link>
    </Card>
  );
}

function Later({ list, parentId }: { list: Pairing[]; parentId: string }) {
  const m = useModel();
  if (!list.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {list.map((p) => (
        <li key={p.id} className="text-sm text-slate-700 dark:text-slate-300">
          <Link to={`/pairings/${p.id}`} className="font-semibold underline underline-offset-2">
            Pairing {p.pairing_no} · {pairingTitle(m, p)}
          </Link>{' '}
          with <BirdName bird={m.bird.get(p.cock_id === parentId ? p.hen_id : p.cock_id)} />
        </li>
      ))}
    </ul>
  );
}
