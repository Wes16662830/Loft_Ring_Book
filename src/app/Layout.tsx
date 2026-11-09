import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../data/store.tsx';
import { cx } from '../components/ui.tsx';
import { MenuIcon, PairsIcon, SearchIcon, StatsIcon } from '../components/icons.tsx';
import { ToastProvider } from '../components/toast.tsx';

const tabs = [
  { to: '/', label: 'Lookup', Icon: SearchIcon, end: true },
  { to: '/pairings', label: 'Pairs', Icon: PairsIcon },
  { to: '/stats', label: 'Stats', Icon: StatsIcon },
  { to: '/more', label: 'More', Icon: MenuIcon },
];

export function Layout() {
  const { error, model, reload } = useStore();
  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        {error && (
          <div role="alert" className="flex items-center gap-2 bg-red-700 px-4 py-2 text-white">
            <span className="flex-1">Could not load data: {error}</span>
            <button type="button" className="min-h-10 rounded-lg border border-white/60 px-3 font-semibold" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}
        <main className="flex-1 px-4 pb-28">{model ? <Outlet /> : !error && <Loading />}</main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
          <ul className="mx-auto grid max-w-xl grid-cols-4">
            {tabs.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'group flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold',
                      isActive ? 'text-slate-950 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cx('rounded-full px-4 py-1', isActive && 'bg-amber-300 text-slate-950 dark:bg-amber-400/20 dark:text-amber-300')}>
                        <Icon size={22} />
                      </span>
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </ToastProvider>
  );
}

function Loading() {
  return (
    <div className="space-y-3 pt-4" aria-label="Loading loft data">
      <div className="h-16 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}
