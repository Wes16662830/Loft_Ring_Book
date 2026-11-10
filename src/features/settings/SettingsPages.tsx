import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import type { Box, RingSequenceRow, Season } from '../../data/types.ts';
import { boxSection, boxSortOrder } from '../../lib/pairingText.ts';
import { sequenceUsage } from '../../lib/rings.ts';
import { Button, Card, Chip, cx, Empty, ErrorText, Field, Input, PageHeader, useAction } from '../../components/ui.tsx';
import { getThemePref, setThemePref, type ThemePref } from '../../app/theme.ts';
import { useInstall } from '../../app/install.ts';

export function MorePage() {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const links = [
    ['/birds/new', 'Add a bird'],
    ['/pairings/new', 'Add a pair'],
    ['/boxes', 'Boxes'],
    ['/seasons', 'Seasons'],
    ['/sequences', 'Ring sequences'],
    ['/import-export', 'Import / Export'],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="More" />
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-300 dark:divide-slate-700 dark:border-slate-700">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="flex min-h-14 items-center px-4 text-lg font-semibold active:bg-slate-100 dark:active:bg-slate-800">
              <span className="flex-1">{label}</span>›
            </Link>
          </li>
        ))}
      </ul>
      <InstallCard />
      <Card>
        <h2 className="mb-2 font-bold">Theme</h2>
        <div className="grid grid-cols-3 gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Button key={t} variant={theme === t ? 'primary' : 'secondary'} onClick={() => { setTheme(t); setThemePref(t); }}>
              {t[0].toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InstallCard() {
  const inst = useInstall();
  if (inst.installed) return null;
  return (
    <Card className="space-y-2">
      <h2 className="font-bold">Install on this phone</h2>
      {inst.canPrompt ? (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-300">Adds Loft Book to your home screen. It opens full-screen like an app.</p>
          <Button className="w-full" onClick={() => void inst.install()}>Install app</Button>
        </>
      ) : inst.inAppBrowser ? (
        <p className="text-sm">
          This page is open inside another app (e.g. WhatsApp or Gmail), which can’t install apps. Tap <strong>⋮</strong> and choose{' '}
          <strong>Open in Chrome</strong>, then come back here.
        </p>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open <strong>loft-ring-book.pages.dev</strong> in <strong>Chrome</strong>.</li>
          <li>Tap <strong>⋮</strong> (top right) → <strong>Add to home screen</strong> or <strong>Install app</strong> → <strong>Install</strong>.</li>
          <li>Samsung Internet: tap <strong>☰</strong> → <strong>Add page to</strong> → <strong>Home screen</strong>.</li>
        </ol>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function BoxesPage() {
  const m = useModel();
  const store = useStore();
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();
  const boxes = [...m.data.boxes].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const sections = [...new Set(boxes.map((b) => b.section))];

  return (
    <div className="space-y-4">
      <PageHeader back title="Boxes" />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(async () => {
            await store.insert('boxes', [{ name: name.trim(), section: boxSection(name), sort_order: boxSortOrder(name) }]);
            setName('');
          });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New box, e.g. L13" aria-label="New box name" />
        <Button type="submit" disabled={busy || !name.trim()}>Add</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <p className="text-sm text-slate-600 dark:text-slate-400">Section is used for the filter on Pairs. Order sets the list order.</p>
      {sections.map((sec) => (
        <section key={sec} className="space-y-2">
          <h2 className="font-bold">{sec}</h2>
          {boxes.filter((b) => b.section === sec).map((b) => (
            <BoxRow key={b.id} box={b} />
          ))}
        </section>
      ))}
      {boxes.length === 0 && <Empty>No boxes yet.</Empty>}
    </div>
  );
}

function BoxRow({ box }: { box: Box }) {
  const m = useModel();
  const store = useStore();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(box.name);
  const [section, setSection] = useState(box.section);
  const [order, setOrder] = useState(String(box.sort_order));
  const { busy, error, run } = useAction();
  const used = m.data.pairings.filter((p) => p.box_id === box.id).length;

  if (!edit) {
    return (
      <button type="button" onClick={() => setEdit(true)} className={cx('flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-300 px-3 text-left dark:border-slate-600', !box.active && 'opacity-50')}>
        <strong className="flex-1">{box.name}</strong>
        {!box.active && <Chip>inactive</Chip>}
        <span className="text-sm text-slate-600 dark:text-slate-400">{used} pairs</span>
      </button>
    );
  }
  return (
    <Card className="space-y-2 p-3">
      <div className="grid grid-cols-[1fr_6rem_5rem] gap-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Section"><Input value={section} onChange={(e) => setSection(e.target.value)} /></Field>
        <Field label="Order"><Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !name.trim()} onClick={() => run(async () => { await store.update('boxes', box.id, { name: name.trim(), section: section.trim() || 'Other', sort_order: Number(order) || 0 }); setEdit(false); })}>Save</Button>
        <Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button>
        <Button variant="secondary" onClick={() => run(() => store.update('boxes', box.id, { active: !box.active }))}>{box.active ? 'Deactivate' : 'Activate'}</Button>
        <Button
          variant="danger"
          onClick={() => confirm(used ? `Delete ${box.name}? ${used} pair(s) will be left without a box.` : `Delete ${box.name}?`) && run(() => store.remove('boxes', box.id))}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function SeasonsPage() {
  const m = useModel();
  const store = useStore();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();
  const seasons = [...m.data.seasons].sort((a, b) => b.year - a.year);

  const makeActive = async (s: Season) => {
    // Only one active season: clear the old one first (unique index).
    for (const o of m.data.seasons) if (o.is_active && o.id !== s.id) await store.backend.update('seasons', o.id, { is_active: false });
    await store.backend.update('seasons', s.id, { is_active: true });
    await store.reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader back title="Seasons" />
      <Card className="space-y-2">
        <h2 className="font-bold">New season</h2>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Field label="Year"><Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${year} breeding`} /></Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button
          disabled={busy || !/^\d{4}$/.test(year)}
          onClick={() =>
            run(async () => {
              const [s] = await store.backend.insert('seasons', [{ year: Number(year), name: name.trim() || `${year} breeding` }]);
              await makeActive(s);
              setName('');
            })
          }
        >
          Add and make active
        </Button>
      </Card>
      <ul className="space-y-2">
        {seasons.map((s) => {
          const n = m.data.pairings.filter((p) => p.season_id === s.id).length;
          return (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center gap-2 p-3">
                <span className="flex-1">
                  <strong>{s.name}</strong> <span className="text-sm text-slate-600 dark:text-slate-400">· {n} pairs</span>
                </span>
                {s.is_active ? (
                  <Chip tone="ok">Active</Chip>
                ) : (
                  <Button variant="secondary" onClick={() => run(() => makeActive(s))}>Make active</Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    confirm(n ? `Delete ${s.name} and its ${n} pairs? Youngsters are kept with their parents.` : `Delete ${s.name}?`) &&
                    run(() => store.remove('seasons', s.id))
                  }
                >
                  Delete
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SequencesPage() {
  const m = useModel();
  const [editing, setEditing] = useState<RingSequenceRow | 'new' | null>(null);
  const seqs = [...m.data.ring_sequences].sort((a, b) => b.year - a.year || a.start_no - b.start_no);
  return (
    <div className="space-y-4">
      <PageHeader back title="Ring sequences" action={<Button onClick={() => setEditing('new')}>+ Add</Button>} />
      <p className="text-slate-700 dark:text-slate-300">
        The ring numbers issued to you, e.g. <span className="ringnum">ZA 3901–4000 BORD 2026</span>. Gaps are counted between the lowest and highest ring used in each sequence.
      </p>
      {editing === 'new' && <SequenceForm onDone={() => setEditing(null)} />}
      {seqs.length === 0 && editing !== 'new' && <Empty>No sequences yet.</Empty>}
      {seqs.map((s) => {
        if (editing !== 'new' && editing?.id === s.id) return <SequenceForm key={s.id} seq={s} onDone={() => setEditing(null)} />;
        const u = sequenceUsage(s, m.data.birds);
        return (
          <button key={s.id} type="button" onClick={() => setEditing(s)} className="block w-full text-left">
            <Card className="p-3">
              <p className="ringnum text-xl font-bold">
                {s.country} {s.start_no}–{s.end_no} {s.code} {s.year}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {u.used.length} used · {u.gaps.length} gaps · {u.remaining} not yet used
              </p>
              {s.notes && <p className="text-sm">{s.notes}</p>}
            </Card>
          </button>
        );
      })}
    </div>
  );
}

function SequenceForm({ seq, onDone }: { seq?: RingSequenceRow; onDone: () => void }) {
  const m = useModel();
  const store = useStore();
  const [country, setCountry] = useState(seq?.country ?? 'ZA');
  const [code, setCode] = useState(seq?.code ?? 'BORD');
  const [year, setYear] = useState(String(seq?.year ?? m.activeSeason?.year ?? new Date().getFullYear()));
  const [start, setStart] = useState(seq ? String(seq.start_no) : '');
  const [end, setEnd] = useState(seq ? String(seq.end_no) : '');
  const [notes, setNotes] = useState(seq?.notes ?? '');
  const { busy, error, run } = useAction();

  const save = () =>
    run(async () => {
      const s = Number(start);
      const e = Number(end);
      if (!/^\d+$/.test(start) || !/^\d+$/.test(end) || e < s) throw new Error('Enter a start and end ring, end ≥ start.');
      if (!/^\d{4}$/.test(year)) throw new Error('Year must be four digits.');
      const row = { country: country.trim().toUpperCase(), code: code.trim().toUpperCase(), year: Number(year), start_no: s, end_no: e, notes: notes.trim() || null };
      if (seq) await store.update('ring_sequences', seq.id, row);
      else await store.insert('ring_sequences', [row]);
      onDone();
    });

  return (
    <Card className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        <Field label="Letters"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Year"><Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        <Field label="First ring"><Input inputMode="numeric" className="ringnum text-xl!" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Last ring"><Input inputMode="numeric" className="ringnum text-xl!" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>Save</Button>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        {seq && (
          <Button variant="danger" onClick={() => confirm('Delete this ring sequence? Birds are not affected.') && run(async () => { await store.remove('ring_sequences', seq.id); onDone(); })}>
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}
