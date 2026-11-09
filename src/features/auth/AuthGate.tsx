import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createDemoBackend, supabase, supabaseConfigured, SupabaseBackend, type Backend } from '../../data/backend.ts';
import { Button, Card, ErrorText, Field, Input, useAction } from '../../components/ui.tsx';

const DEMO_KEY = 'loftbook.demo';

function Centre({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">{children}</main>;
}

function Brand() {
  return (
    <div className="mb-2 text-center">
      <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
      <h1 className="text-2xl font-bold">OudeLuck Loft Book</h1>
    </div>
  );
}

export function signOut() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
  if (supabaseConfigured()) void supabase().auth.signOut();
  location.href = '/';
}

export function AuthGate({ children }: { children: (backend: Backend) => ReactNode }) {
  const [demo, setDemo] = useState<Backend | null>(null);
  const [wantDemo, setWantDemo] = useState(() => {
    try {
      return localStorage.getItem(DEMO_KEY) === '1' || new URLSearchParams(location.search).has('demo');
    } catch {
      return false;
    }
  });
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured() ? undefined : null);
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const [real] = useState(() => (supabaseConfigured() ? new SupabaseBackend() : null));

  useEffect(() => {
    if (!wantDemo) return;
    try {
      localStorage.setItem(DEMO_KEY, '1');
    } catch {
      /* ignore */
    }
    void createDemoBackend().then(setDemo);
  }, [wantDemo]);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    void supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const email = (session.user.email ?? '').toLowerCase();
    void supabase()
      .from('allowed_users')
      .select('email')
      .eq('email', email)
      .then(({ data }) => setAllowed(Boolean(data && data.length)));
  }, [session]);

  if (wantDemo) return demo ? <>{children(demo)}</> : <Centre><p className="text-center">Loading demo…</p></Centre>;

  if (!supabaseConfigured()) {
    return (
      <Centre>
        <Brand />
        <Card>
          <p className="mb-3">
            Supabase isn’t configured yet. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README).
          </p>
          <Button className="w-full" onClick={() => setWantDemo(true)}>
            Try with seed data (changes not saved)
          </Button>
        </Card>
      </Centre>
    );
  }

  if (session === undefined) return <Centre><p className="text-center">Loading…</p></Centre>;
  if (!session) return <Login onDemo={() => setWantDemo(true)} />;
  if (allowed === undefined) return <Centre><p className="text-center">Checking access…</p></Centre>;
  if (!allowed) {
    return (
      <Centre>
        <Brand />
        <Card>
          <p className="mb-3">
            <strong>{session.user.email}</strong> isn’t on this loft’s access list. Add it to <code>allowed_users</code> in Supabase (see README).
          </p>
          <Button variant="secondary" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </Card>
      </Centre>
    );
  }
  return <>{children(real!)}</>;
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Centre>
      <Brand />
      <Card>
        {sent ? (
          <p>
            Check <strong>{email}</strong> for a sign-in link. Open it on this phone.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { error } = await supabase().auth.signInWithOtp({
                  email: email.trim(),
                  options: { emailRedirectTo: location.origin, shouldCreateUser: true },
                });
                if (error) throw error;
                setSent(true);
              });
            }}
          >
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              Email me a sign-in link
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}
      </Card>
      <button type="button" className="min-h-12 text-sm text-slate-600 underline dark:text-slate-400" onClick={onDemo}>
        Try with seed data instead (changes not saved)
      </button>
    </Centre>
  );
}
