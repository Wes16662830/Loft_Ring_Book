import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../data/store.tsx';
import { cx } from '../components/ui.tsx';

const tabs = [
  { to: '/', label: 'Lookup', icon: '⌕', end: true },
  { to: '/pairings', label: 'Pairs', icon: '⚭' },
  { to: '/stats', label: 'Stats', icon: '▤' },
  { to: '/more', label: 'More', icon: '☰' },
];

export function Layout() {
  const { backend, error, model } = useStore();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      {backend.kind === 'demo' && (
        <div className="bg-amber-400 px-4 py-1 text-center text-sm font-semibold text-slate-950">Demo — changes are not saved</div>
      )}
      {error && <div className="bg-red-700 px-4 py-2 text-white">Could not load data: {error}</div>}
      <main className="flex-1 px-4 pb-28">{model ? <Outlet /> : <p className="py-10 text-center">Loading loft data…</p>}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-300 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-950">
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-16 flex-col items-center justify-center text-sm font-semibold',
                    isActive ? 'text-slate-950 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400',
                  )
                }
              >
                <span aria-hidden className="text-2xl leading-none">{t.icon}</span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
