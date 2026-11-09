import { Link } from 'react-router-dom';
import { useModel } from '../../data/store.tsx';
import type { Bird } from '../../data/types.ts';
import { cx } from '../../components/ui.tsx';

/** Three generations: parents and grandparents, tappable. Unknown ancestors show as —. */
export function Pedigree({ bird }: { bird: Bird }) {
  const m = useModel();
  const get = (id: string | null | undefined) => (id ? m.bird.get(id) : undefined);
  const sire = get(bird.sire_id);
  const dam = get(bird.dam_id);
  if (!sire && !dam) return null;
  const grand = [get(sire?.sire_id), get(sire?.dam_id), get(dam?.sire_id), get(dam?.dam_id)];

  if (grand.every((g) => !g)) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-bold">Pedigree</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <Cell bird={sire} role="Sire" strong />
          <Cell bird={dam} role="Dam" strong />
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Grandparents aren’t recorded yet. Open the sire or dam and set their parents to extend the pedigree.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">Pedigree</h2>
      <div className="grid grid-cols-2 grid-rows-4 gap-1.5">
        <Cell bird={sire} role="Sire" className="row-span-2" strong />
        <Cell bird={grand[0]} role="Sire’s sire" />
        <Cell bird={grand[1]} role="Sire’s dam" />
        <Cell bird={dam} role="Dam" className="row-span-2" strong />
        <Cell bird={grand[2]} role="Dam’s sire" />
        <Cell bird={grand[3]} role="Dam’s dam" />
      </div>
    </section>
  );
}

function Cell({ bird, role, className, strong }: { bird?: Bird; role: string; className?: string; strong?: boolean }) {
  const body = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{role}</span>
      {bird ? (
        <span className={cx('block leading-snug', strong ? 'text-base font-semibold' : 'text-sm')}>
          {bird.ring_number != null && <span className="ringnum mr-1 text-lg font-bold">{bird.ring_number}</span>}
          {bird.name}
        </span>
      ) : (
        <span className="block text-slate-400">—</span>
      )}
    </>
  );
  const cls = cx(
    'flex flex-col justify-center rounded-xl border px-3 py-2',
    strong ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-900' : 'border-slate-200 dark:border-slate-700',
    className,
  );
  return bird ? (
    <Link to={`/birds/${bird.id}`} className={cx(cls, 'active:bg-slate-100 dark:active:bg-slate-800')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
