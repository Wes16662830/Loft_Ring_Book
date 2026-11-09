import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import { pairFlags, pairingTitle, youngstersOfPairing } from '../../data/model.ts';
import type { Pairing } from '../../data/types.ts';
import { BirdName, Button, Card, Chip } from '../../components/ui.tsx';
import { AddRingsSheet } from './AddRingsSheet.tsx';

export function PairCard({ pairing }: { pairing: Pairing }) {
  const m = useModel();
  const [adding, setAdding] = useState(false);
  const clutches = m.clutchesOf.get(pairing.id) ?? [];
  const count = youngstersOfPairing(m, pairing).length;
  const flags = pairFlags(m, pairing);
  const comments = m.commentsOfPairing.get(pairing.id)?.length ?? 0;

  return (
    <Card className="p-3">
      <Link to={`/pairings/${pairing.id}`} className="flex items-start gap-3">
        <span className="min-w-14 rounded-lg bg-slate-900 px-2 py-1 text-center text-lg font-bold text-white dark:bg-amber-400 dark:text-slate-950">
          {pairingTitle(m, pairing)}
        </span>
        <span className="flex-1 leading-snug">
          <span className="block">
            <span className="text-slate-500" aria-label="Cock">♂ </span>
            <BirdName bird={m.bird.get(pairing.cock_id)} />
          </span>
          <span className="block">
            <span className="text-slate-500" aria-label="Hen">♀ </span>
            <BirdName bird={m.bird.get(pairing.hen_id)} />
          </span>
        </span>
        <span className="text-right">
          <span className="ringnum block text-2xl font-bold">{count}</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">young</span>
        </span>
      </Link>

      {clutches.length > 0 && (
        <div className="mt-2 space-y-1">
          {clutches.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-7 text-sm font-semibold text-slate-600 dark:text-slate-400">R{c.round_no}</span>
              {(m.youngstersOf.get(c.id) ?? []).map((b) => (
                <Link
                  key={b.id}
                  to={`/birds/${b.id}`}
                  className="ringnum inline-flex min-h-10 min-w-16 items-center justify-center rounded-lg border border-slate-400 bg-slate-50 px-2 text-xl font-bold active:bg-slate-200 dark:border-slate-500 dark:bg-slate-800"
                >
                  {b.ring_number ?? b.name}
                </Link>
              ))}
              {(m.youngstersOf.get(c.id) ?? []).length === 0 && <span className="text-sm text-slate-500">empty</span>}
            </div>
          ))}
        </div>
      )}

      {(flags.length > 0 || comments > 0 || pairing.notes) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flags.map((f, i) => (
            <Chip key={i} tone={f.level === 'warn' ? 'warn' : 'info'}>
              {f.text}
            </Chip>
          ))}
          {comments > 0 && <Chip>💬 {comments}</Chip>}
        </div>
      )}

      <Button variant="secondary" className="mt-2 w-full" onClick={() => setAdding(true)}>
        + Rings
      </Button>
      <AddRingsSheet pairing={pairing} open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}
