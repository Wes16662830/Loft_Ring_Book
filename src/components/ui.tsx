import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { formatRing } from '../lib/rings.ts';
import type { Bird } from '../data/types.ts';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white dark:bg-amber-400 dark:text-slate-950 active:opacity-80',
  secondary: 'bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-slate-50 dark:border-slate-600 active:bg-slate-200 dark:active:bg-slate-700',
  danger: 'bg-red-700 text-white active:bg-red-800',
  ghost: 'text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800',
};

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cx('min-h-12 rounded-xl px-4 text-base font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2', variants[variant], className)}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900', className)}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full min-h-12 rounded-xl border border-slate-400 bg-white px-3 text-base text-slate-950 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-50';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, className)} />;
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, className)} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'py-2', className)} />;
}

/** A ring number in the condensed tabular face. */
export function Ring({ bird, className, short }: { bird: Bird; className?: string; short?: boolean }) {
  if (bird.ring_number == null) return null;
  return <span className={cx('ringnum', className)}>{short ? bird.ring_number : formatRing(bird)}</span>;
}

export function BirdName({ bird, className }: { bird: Bird | null | undefined; className?: string }) {
  if (!bird) return <span className="text-slate-500">—</span>;
  return (
    <span className={className}>
      {bird.ring_number != null && <Ring bird={bird} className="mr-1 text-lg font-bold" />}
      {bird.name && <span>{bird.name}</span>}
      {bird.ring_number == null && !bird.name && <span className="text-slate-500">(unnamed)</span>}
    </span>
  );
}

export function BirdLink({ bird, className }: { bird: Bird | null | undefined; className?: string }) {
  if (!bird) return <span className="text-slate-500">—</span>;
  return (
    <Link to={`/birds/${bird.id}`} className={cx('underline decoration-slate-400 underline-offset-4', className)}>
      <BirdName bird={bird} />
    </Link>
  );
}

export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'info' | 'ok'; className?: string }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
    warn: 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-600',
    info: 'bg-sky-50 text-sky-950 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-700',
    ok: 'bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-700',
  };
  return <span className={cx('inline-flex items-center rounded-lg border px-2 py-0.5 text-sm font-medium', tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, back, action }: { title: ReactNode; back?: boolean; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 flex min-h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      {back && (
        <button type="button" onClick={() => history.back()} className="-ml-2 min-h-12 min-w-12 rounded-xl text-2xl" aria-label="Back">
          ‹
        </button>
      )}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">{children}</p>;
}

export function WarnText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">{children}</p>;
}

/** Bottom sheet dialog. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-white p-0 text-slate-950 backdrop:bg-black/60 dark:bg-slate-900 dark:text-slate-50 sm:mx-auto sm:mb-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center">
            <h2 className="flex-1 text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="min-h-12 min-w-12 rounded-xl text-2xl" aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Runs an async action, tracking busy state and error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-slate-600 dark:text-slate-400">{children}</p>;
}
