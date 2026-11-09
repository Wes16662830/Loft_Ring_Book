import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import { pairingTitle } from '../../data/model.ts';
import type { Pairing } from '../../data/types.ts';
import { DEFAULT_RING, parseRingEntry, ringClashes, type RingDefaults } from '../../lib/rings.ts';
import { Button, Chip, cx, ErrorText, Field, Input, Sheet, WarnText, useAction } from '../../components/ui.tsx';
import { useToast } from '../../components/toast.tsx';

const DEFAULTS_KEY = 'loftbook.ringDefaults';
const LAST_PAIR_KEY = 'loftbook.lastPair';

/** The pair rings were last added to on this phone (for "Continue ringing" on the home screen). */
export function getLastPairId(): string | null {
  try {
    return localStorage.getItem(LAST_PAIR_KEY);
  } catch {
    return null;
  }
}

function setLastPairId(id: string) {
  try {
    localStorage.setItem(LAST_PAIR_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadRingDefaults(seasonYear?: number): RingDefaults {
  try {
    const v = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null');
    if (v && v.country && v.code && v.year) return v;
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_RING, year: seasonYear ?? DEFAULT_RING.year };
}

export function saveRingDefaults(d: RingDefaults) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

/** Next unused ring after the highest one recorded with these defaults, if any. */
function nextRing(birds: { ring_number: number | null; ring_code: string | null; ring_year: number | null }[], d: RingDefaults): number | null {
  let max = -1;
  for (const b of birds) {
    if (b.ring_number != null && b.ring_year === d.year && (b.ring_code ?? '').toUpperCase() === d.code.toUpperCase()) max = Math.max(max, b.ring_number);
  }
  return max >= 0 ? max + 1 : null;
}

export function AddRingsSheet({ pairing, open, onClose }: { pairing: Pairing; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add rings">
      <AddRingsForm pairing={pairing} onDone={onClose} />
    </Sheet>
  );
}

function AddRingsForm({ pairing, onDone }: { pairing: Pairing; onDone: () => void }) {
  const m = useModel();
  const store = useStore();
  const clutches = m.clutchesOf.get(pairing.id) ?? [];
  const nextRound = (clutches[clutches.length - 1]?.round_no ?? 0) + 1;
  const last = clutches[clutches.length - 1];
  const lastCount = last ? (m.youngstersOf.get(last.id) ?? []).length : 0;
  const [round, setRound] = useState<number>(last && lastCount < 2 && lastCount > 0 ? last.round_no : nextRound);
  const [defaults, setDefaults] = useState(() => loadRingDefaults(m.season.get(pairing.season_id)?.year));
  const [editDefaults, setEditDefaults] = useState(false);
  const [r1, setR1] = useState('');
  const [r2, setR2] = useState('');
  const [confirmWarn, setConfirmWarn] = useState(false);
  const { busy, error, run } = useAction();
  const toast = useToast();

  const existingClutch = clutches.find((c) => c.round_no === round);
  const existingInRound = existingClutch ? (m.youngstersOf.get(existingClutch.id) ?? []) : [];
  const parsed = useMemo(() => parseRingEntry([r1, r2].filter((x) => x.trim()).join(' ')), [r1, r2]);
  const clashes = parsed.errors.length
    ? []
    : parsed.numbers.flatMap((n) => ringClashes(m.data.birds, { country: defaults.country, number: n, code: defaults.code, year: defaults.year }));
  const total = existingInRound.length + parsed.numbers.length;
  const warnings = [...parsed.warnings];
  if (existingInRound.length && total >= 3) warnings.push(`Round ${round} will have ${total} youngsters — a clutch is normally 1–2.`);
  const suggestion = nextRing(m.data.birds, defaults);

  const save = () =>
    run(async () => {
      if (parsed.errors.length || clashes.length || !parsed.numbers.length) return;
      if (warnings.length && !confirmWarn) {
        setConfirmWarn(true);
        return;
      }
      let clutchId = existingClutch?.id;
      if (!clutchId) {
        const [c] = await store.backend.insert('clutches', [{ pairing_id: pairing.id, round_no: round }]);
        clutchId = c.id;
      }
      try {
        await store.backend.insert(
          'birds',
          parsed.numbers.map((n) => ({
            ring_country: defaults.country,
            ring_number: n,
            ring_code: defaults.code,
            ring_year: defaults.year,
            sire_id: pairing.cock_id,
            dam_id: pairing.hen_id,
            clutch_id: clutchId,
            sex: 'unknown' as const,
          })),
        );
      } catch (e) {
        if (!existingClutch) await store.backend.remove('clutches', clutchId);
        throw e;
      } finally {
        await store.reload();
      }
      setLastPairId(pairing.id);
      toast(`Saved ${parsed.numbers.join('/')} to ${pairingTitle(m, pairing)} · round ${round}`);
      onDone();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-lg">
        <strong>{pairingTitle(m, pairing)}</strong> · Pairing {pairing.pairing_no}
      </p>

      <div>
        <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Round</span>
        <div className="flex flex-wrap gap-2">
          {[...clutches.map((c) => c.round_no), ...(clutches.some((c) => c.round_no === nextRound) ? [] : [nextRound])].map((r) => {
            const n = (m.youngstersOf.get(clutches.find((c) => c.round_no === r)?.id ?? '') ?? []).length;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRound(r);
                  setConfirmWarn(false);
                }}
                className={cx(
                  'min-h-12 rounded-xl border-2 px-4 font-semibold',
                  r === round ? 'border-slate-900 bg-slate-900 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950' : 'border-slate-300 dark:border-slate-600',
                )}
              >
                {r === nextRound && !clutches.some((c) => c.round_no === r) ? `New round ${r}` : `Round ${r} (${n})`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="ringnum text-lg">
          {defaults.country} ···· {defaults.code} {defaults.year}
        </span>
        <button type="button" className="min-h-10 px-2 font-semibold text-amber-800 underline dark:text-amber-300" onClick={() => setEditDefaults((v) => !v)}>
          {editDefaults ? 'Done' : 'Change'}
        </button>
      </div>
      {editDefaults && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Country">
            <Input value={defaults.country} onChange={(e) => { const d = { ...defaults, country: e.target.value.toUpperCase() }; setDefaults(d); saveRingDefaults(d); }} />
          </Field>
          <Field label="Letters">
            <Input value={defaults.code} onChange={(e) => { const d = { ...defaults, code: e.target.value.toUpperCase() }; setDefaults(d); saveRingDefaults(d); }} />
          </Field>
          <Field label="Year">
            <Input inputMode="numeric" value={defaults.year} onChange={(e) => { const d = { ...defaults, year: Number(e.target.value) || defaults.year }; setDefaults(d); saveRingDefaults(d); }} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Ring">
          <Input
            autoFocus
            inputMode="numeric"
            className="ringnum h-14 text-2xl! font-bold"
            value={r1}
            placeholder={suggestion ? String(suggestion) : ''}
            onChange={(e) => {
              setR1(e.target.value);
              setConfirmWarn(false);
            }}
            aria-label="First ring"
          />
        </Field>
        <Field label="Second ring (optional)">
          <Input
            inputMode="numeric"
            className="ringnum h-14 text-2xl! font-bold"
            value={r2}
            onChange={(e) => {
              setR2(e.target.value);
              setConfirmWarn(false);
            }}
            aria-label="Second ring"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestion != null && !r1 && (
          <Button variant="secondary" onClick={() => { setR1(String(suggestion)); setR2(String(suggestion + 1)); }}>
            <span className="ringnum text-lg">{suggestion}/{suggestion + 1}</span>
          </Button>
        )}
        {/^\d+$/.test(r1.trim()) && !r2 && (
          <Button variant="secondary" onClick={() => setR2(String(Number(r1) + 1))}>
            + <span className="ringnum text-lg">{Number(r1) + 1}</span>
          </Button>
        )}
      </div>

      {r1 && parsed.errors.length > 0 && <ErrorText>{parsed.errors.join(' ')}</ErrorText>}
      {clashes.length > 0 && (
        <ErrorText>
          Already recorded:{' '}
          {clashes.map((b) => (
            <Link key={b.id} to={`/birds/${b.id}`} className="ringnum mr-2 underline">
              {b.ring_number}
            </Link>
          ))}
        </ErrorText>
      )}
      {warnings.length > 0 && <WarnText>{warnings.join(' ')}</WarnText>}
      {existingInRound.length > 0 && (
        <p className="text-sm">
          Already in round {round}:{' '}
          {existingInRound.map((b) => (
            <Chip key={b.id} className="ringnum mr-1">{b.ring_number}</Chip>
          ))}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="h-14 w-full text-lg" disabled={busy || !parsed.numbers.length || parsed.errors.length > 0 || clashes.length > 0}>
        {confirmWarn ? 'Save anyway' : `Save ${parsed.numbers.length > 1 ? parsed.numbers.length + ' rings' : 'ring'}`}
      </Button>
    </form>
  );
}
