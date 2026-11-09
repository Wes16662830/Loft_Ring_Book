import { Link } from 'react-router-dom';
import { useModel } from '../data/store.tsx';
import { pairingTitle } from '../data/model.ts';
import type { Pairing } from '../data/types.ts';
import { BirdName } from './ui.tsx';

/** One-line description of a pairing: "2026 · Pairing 2 · Block 1 — Grizzle × Race 193 - Glenn". */
export function PairLine({ pairing, highlight }: { pairing: Pairing; highlight?: string }) {
  const m = useModel();
  const season = m.season.get(pairing.season_id);
  return (
    <Link to={`/pairings/${pairing.id}`} className="block rounded-xl border border-slate-200 p-3 active:bg-slate-100 dark:border-slate-700 dark:active:bg-slate-800">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        {season?.year} · Pairing {pairing.pairing_no} · <strong className="text-slate-900 dark:text-slate-100">{pairingTitle(m, pairing)}</strong>
      </div>
      <div className="mt-0.5">
        <span className={highlight === pairing.cock_id ? 'font-bold' : ''}>
          <BirdName bird={m.bird.get(pairing.cock_id)} />
        </span>
        <span className="mx-1 text-slate-500">×</span>
        <span className={highlight === pairing.hen_id ? 'font-bold' : ''}>
          <BirdName bird={m.bird.get(pairing.hen_id)} />
        </span>
      </div>
    </Link>
  );
}
