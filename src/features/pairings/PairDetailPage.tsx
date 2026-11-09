import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import { pairFlags, pairingTitle, youngstersOfPairing } from '../../data/model.ts';
import { BirdLink, Button, Card, Chip, Empty, ErrorText, Input, PageHeader, useAction } from '../../components/ui.tsx';
import { Comments } from '../../components/Comments.tsx';
import { AddRingsSheet } from './AddRingsSheet.tsx';
import { useToast } from '../../components/toast.tsx';

export function PairDetailPage() {
  const { id } = useParams();
  const m = useModel();
  const store = useStore();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAction();
  const toast = useToast();
  const p = id ? m.pairing.get(id) : undefined;
  if (!p) return <Empty>Pair not found.</Empty>;

  const clutches = m.clutchesOf.get(p.id) ?? [];
  const season = m.season.get(p.season_id);
  const count = youngstersOfPairing(m, p).length;

  return (
    <div className="space-y-4">
      <PageHeader
        back
        title={`${pairingTitle(m, p)} · Pairing ${p.pairing_no}`}
        action={
          <Link to={`/pairings/${p.id}/edit`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-slate-600">
            Edit
          </Link>
        }
      />
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {season?.name}
          {p.block && ` · ${p.block}`}
          {p.box_id && ` · Box ${m.box.get(p.box_id)?.name}`}
        </p>
        <dl className="mt-2 space-y-2">
          <div>
            <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">Cock</dt>
            <dd className="text-lg"><BirdLink bird={m.bird.get(p.cock_id)} /></dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-600 dark:text-slate-400">Hen</dt>
            <dd className="text-lg"><BirdLink bird={m.bird.get(p.hen_id)} /></dd>
          </div>
        </dl>
        {p.notes && <p className="mt-2 whitespace-pre-wrap">{p.notes}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {pairFlags(m, p).map((f, i) => (
            <Chip key={i} tone={f.level === 'warn' ? 'warn' : 'info'}>{f.text}</Chip>
          ))}
        </div>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-bold">Rounds · {count} young</h2>
          <Button onClick={() => setAdding(true)}>+ Rings</Button>
        </div>
        {clutches.length === 0 && <Empty>No rounds yet.</Empty>}
        {clutches.map((c) => {
          const ys = m.youngstersOf.get(c.id) ?? [];
          return (
            <Card key={c.id} className="p-3">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 font-bold">Round {c.round_no}</h3>
                <label className="flex items-center gap-1 text-sm">
                  Laid
                  <Input
                    type="date"
                    className="min-h-10 w-40"
                    value={c.laid_date ?? ''}
                    onChange={(e) => run(() => store.update('clutches', c.id, { laid_date: e.target.value || null }))}
                  />
                </label>
              </div>
              <ul className="mt-2 space-y-1">
                {ys.map((b) => (
                  <li key={b.id} className="flex items-center gap-2">
                    <BirdLink bird={b} className="text-lg" />
                    {b.hatch_date && <span className="text-sm text-slate-600">hatched {b.hatch_date}</span>}
                  </li>
                ))}
              </ul>
              {ys.length === 0 && (
                <Button variant="ghost" className="mt-1" disabled={busy} onClick={() => run(() => store.remove('clutches', c.id))}>
                  Delete empty round
                </Button>
              )}
            </Card>
          );
        })}
      </section>

      <Comments pairingId={p.id} />

      <ErrorText>{error}</ErrorText>
      <Button
        variant="danger"
        className="w-full"
        disabled={busy}
        onClick={() => {
          const msg = count
            ? `Delete this pair? Its ${count} youngsters are kept, with their sire and dam, but lose the box/round link.`
            : 'Delete this pair?';
          if (confirm(msg)) {
            void run(async () => {
              await store.remove('pairings', p.id);
              toast('Pair deleted');
              nav('/pairings', { replace: true });
            });
          }
        }}
      >
        Delete pair
      </Button>
      <AddRingsSheet pairing={p} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
