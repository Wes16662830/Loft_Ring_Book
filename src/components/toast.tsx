import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckIcon } from './icons.tsx';

type Toast = (message: string) => void;
const Ctx = createContext<Toast>(() => {});

/** Brief confirmation shown above the bottom nav, e.g. "Saved 3989/3990 to Q3 · round 1". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback<Toast>((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
        {msg && (
          <div className="flex max-w-md items-center gap-2 rounded-2xl bg-emerald-800 px-4 py-3 font-semibold text-white shadow-lg">
            <CheckIcon size={20} />
            {msg}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Toast {
  return useContext(Ctx);
}
