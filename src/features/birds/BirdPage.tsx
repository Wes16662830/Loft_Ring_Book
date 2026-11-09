import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import { birdLabel, nestMates, originOf, pairingsOfBird, pairingTitle } from '../../data/model.ts';
import type { Bird } from '../../data/types.ts';
import { BirdLink, BirdName, Button, Card, Chip, Empty, ErrorText, PageHeader, Ring, Sheet, WarnText, useAction } from '../../components/ui.tsx';
import { BirdPicker, type PickedBird } from '../../components/BirdPicker.tsx';
import { Comments } from '../../components/Comments.tsx';
import { PairLine } from '../../components/PairSummary.tsx';

export function BirdPage() {
  const { id } = useParams();
  const m = useModel();
  const store = useStore();
  const nav = useNavigate();
  const [merging, setMerging] = useState(false);
  const { busy, error, run } = useAction();
  const b = id ? m.bird.get(id) : undefined;
  if (!b) return <Empty>Bird not found.</Empty>;

  const o = originOf(m, b);
  const mates = nestMates(m, b);
  const offspring = m.offspringOf.get(b.id) ?? [];
  const pairs = pairingsOfBird(m, b.id);

  const del = () => {
    if (pairs.length) {
      alert(`This bird is in ${pairs.length} pair(s). Delete those pairs or change the bird in them first.`);
      return;
    }
    const msg = offspring.length
      ? `Delete ${birdLabel(b)}? ${offspring.length} offspring will be kept but lose this parent link.`
      : `Delete ${birdLabel(b)}?`;
    if (confirm(msg)) {
      void run(async () => {
        await store.remove('birds', b.id);
        nav(o ? `/pairings/${o.pairing.id}` : '/', { replace: true });
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        back
        title={b.ring_number != null ? <Ring bird={b} className="text-2xl" /> : b.name}
        action={
          <Link to={`/birds/${b.id}/edit`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-slate-600">
            Edit
          </Link>
        }
      />
      <Card>
        {b.ring_number != null && <Ring bird={b} className="block text-4xl font-bold" />}
        {b.name && <p className="text-2xl font-semibold">{b.name}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip>{b.sex}</Chip>
          <Chip tone={b.status === 'active' ? 'ok' : 'warn'}>{b.status}</Chip>
          {b.colour && <Chip>{b.colour}</Chip>}
          {b.hatch_date && <Chip>Hatched {b.hatch_date}</Chip>}
        </div>
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-2">
          <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">Sire</dt>
          <dd><BirdLink bird={b.sire_id ? m.bird.get(b.sire_id) : null} /></dd>
          <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">Dam</dt>
          <dd><BirdLink bird={b.dam_id ? m.bird.get(b.dam_id) : null} /></dd>
          {o && (
            <>
              <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">From</dt>
              <dd>
                <Link to={`/pairings/${o.pairing.id}`} className="underline underline-offset-4">
                  {m.season.get(o.pairing.season_id)?.year} · Pairing {o.pairing.pairing_no} · {pairingTitle(m, o.pairing)} · Round {o.clutch.round_no}
                </Link>
              </dd>
              <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">Nest mate</dt>
              <dd>{mates.length ? mates.map((x) => <div key={x.id}><BirdLink bird={x} /></div>) : 'None (single)'}</dd>
            </>
          )}
        </dl>
        {b.notes && <p className="mt-3 whitespace-pre-wrap border-t border-slate-200 pt-2 dark:border-slate-700">{b.notes}</p>}
      </Card>

      {pairs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Pairings</h2>
          {pairs.map((p) => (
            <PairLine key={p.id} pairing={p} highlight={b.id} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Offspring ({offspring.length})</h2>
        {offspring.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400">None recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-300 dark:divide-slate-700 dark:border-slate-700">
            {offspring.map((c) => {
              const co = originOf(m, c);
              const other = c.sire_id === b.id ? c.dam_id : c.sire_id;
              return (
                <li key={c.id}>
                  <Link to={`/birds/${c.id}`} className="flex min-h-12 flex-wrap items-center gap-x-2 px-3 py-2">
                    <BirdName bird={c} />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      × {birdLabel(other ? m.bird.get(other) : null)}
                      {co && ` · ${pairingTitle(m, co.pairing)} R${co.clutch.round_no}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Comments birdId={b.id} />

      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" className="w-full" onClick={() => setMerging(true)}>
          Merge with another record of this bird…
        </Button>
        <Button variant="danger" className="w-full" disabled={busy} onClick={del}>
          Delete bird
        </Button>
      </div>
      <Sheet open={merging} onClose={() => setMerging(false)} title="Merge birds">
        <MergeForm bird={b} onDone={(keepId) => { setMerging(false); if (keepId !== b.id) nav(`/birds/${keepId}`, { replace: true }); }} />
      </Sheet>
    </div>
  );
}

function MergeForm({ bird, onDone }: { bird: Bird; onDone: (keepId: string) => void }) {
  const m = useModel();
  const store = useStore();
  const [other, setOther] = useState<PickedBird | null>(null);
  const [keepThis, setKeepThis] = useState(true);
  const { busy, error, run } = useAction();
  const o = other && 'id' in other ? m.bird.get(other.id) : undefined;
  const keep = keepThis ? bird : o;
  const drop = keepThis ? o : bird;

  return (
    <div className="space-y-3">
      <p>
        Use this when the same bird was entered twice (e.g. spelt differently). All pairs, offspring and comments move to the bird you keep;
        empty fields are filled from the other; the other record is deleted.
      </p>
      <BirdPicker label="Other record" value={other} onChange={setOther} excludeId={bird.id} allowNew={false} sex={bird.sex === 'unknown' ? undefined : bird.sex} />
      {o && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Keep which name/record?</legend>
            {[true, false].map((k) => (
              <label key={String(k)} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 px-3 dark:border-slate-600">
                <input type="radio" name="keep" checked={keepThis === k} onChange={() => setKeepThis(k)} className="h-5 w-5" />
                <BirdName bird={k ? bird : o} />
              </label>
            ))}
          </fieldset>
          {o.sex !== 'unknown' && bird.sex !== 'unknown' && o.sex !== bird.sex && <WarnText>One is a cock and the other a hen — the merge will be refused.</WarnText>}
          <ErrorText>{error}</ErrorText>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await store.mergeBirds(keep!.id, drop!.id);
                onDone(keep!.id);
              })
            }
          >
            Merge into “{birdLabel(keep)}”
          </Button>
        </>
      )}
    </div>
  );
}
