import { useMemo, useState, type ChangeEvent } from 'react';
import { useModel, useStore } from '../../data/store.tsx';
import type { Backend } from '../../data/backend.ts';
import type { TableName, Tables } from '../../data/types.ts';
import { birdsToCsv, planBirdCsv } from '../../lib/birdCsv.ts';
import { toCsv } from '../../lib/csv.ts';
import { buildImportPlan, parsePairingText } from '../../lib/pairingText.ts';
import { formatRing } from '../../lib/rings.ts';
import { youngstersOfPairing } from '../../data/model.ts';
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea, WarnText, useAction } from '../../components/ui.tsx';
import { loadRingDefaults } from '../pairings/AddRingsSheet.tsx';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

async function insertChunks<T extends TableName>(backend: Backend, table: T, rows: Partial<Tables[T]>[]) {
  // Small requests keep each one well inside Cloudflare D1's per-request limits.
  for (let i = 0; i < rows.length; i += 150) await backend.insert(table, rows.slice(i, i + 150));
}

export function ImportExportPage() {
  const m = useModel();
  return (
    <div className="space-y-4">
      <PageHeader back title="Import / Export" />
      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Export</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">Opens in Excel or Google Sheets.</p>
        <Button className="w-full" onClick={() => download(`loft-book-birds-${today()}.csv`, birdsToCsv(m.data))}>
          All birds with sire and dam (CSV)
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            const rows = [...m.data.pairings]
              .sort((a, b) => (m.season.get(b.season_id)?.year ?? 0) - (m.season.get(a.season_id)?.year ?? 0) || a.pairing_no - b.pairing_no || a.sort_order - b.sort_order)
              .map((p) => {
                const b = (id: string) => m.bird.get(id);
                const clutches = m.clutchesOf.get(p.id) ?? [];
                return [
                  m.season.get(p.season_id)?.name, p.pairing_no, p.box_id ? m.box.get(p.box_id)?.name : '', p.block,
                  formatRing(b(p.cock_id)!) || b(p.cock_id)?.name, formatRing(b(p.hen_id)!) || b(p.hen_id)?.name,
                  youngstersOfPairing(m, p).length,
                  ...clutches.map((c) => (m.youngstersOf.get(c.id) ?? []).map((y) => y.ring_number).join('/')),
                ];
              });
            download(`loft-book-pairs-${today()}.csv`, toCsv([['season', 'pairing', 'box', 'block', 'cock', 'hen', 'youngsters', 'round 1', 'round 2', 'round 3', 'round 4'], ...rows]));
          }}
        >
          All pairs with rings per round (CSV)
        </Button>
      </Card>
      <PairingImport />
      <BirdImport />
    </div>
  );
}

function readFile(e: ChangeEvent<HTMLInputElement>, set: (s: string) => void) {
  const f = e.target.files?.[0];
  if (f) void f.text().then(set);
}

function PairingImport() {
  const m = useModel();
  const store = useStore();
  const [text, setText] = useState('');
  const [seasonId, setSeasonId] = useState(m.activeSeason?.id ?? '');
  const [pairingNo, setPairingNo] = useState('1');
  const [first, setFirst] = useState<'box' | 'block'>('box');
  const [ring, setRing] = useState(() => loadRingDefaults(m.activeSeason?.year));
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parsePairingText(text, first);
    const existingRings = new Set(
      m.data.birds
        .filter((b) => b.ring_number != null && b.ring_year === ring.year && (b.ring_code ?? '').toUpperCase() === ring.code.toUpperCase() && (b.ring_country ?? '').toUpperCase() === ring.country.toUpperCase())
        .map((b) => b.ring_number!),
    );
    const plan = buildImportPlan({
      sections: [{ pairingNo: Math.max(1, Number(pairingNo) || 1), pairs: parsed.pairs }],
      ring,
      newId: () => crypto.randomUUID(),
      existingBirds: m.data.birds,
      existingBoxes: m.data.boxes,
      existingRings,
    });
    const dupRings = plan.notes.filter((n) => n.includes('duplicates'));
    return { parsed, plan, dupRings };
  }, [text, first, pairingNo, ring, m]);

  const usedBoxes = new Set(
    m.data.pairings.filter((p) => p.season_id === seasonId && p.pairing_no === Number(pairingNo) && p.box_id).map((p) => p.box_id),
  );
  const boxClashes = preview ? preview.plan.pairings.filter((p) => p.box_id && usedBoxes.has(p.box_id)).map((p) => m.box.get(p.box_id!)?.name ?? '') : [];
  const blocked = !preview || preview.parsed.issues.length > 0 || preview.dupRings.length > 0;

  const doImport = () =>
    run(async () => {
      if (!preview || !seasonId) return;
      const { plan } = preview;
      if (preview.parsed.issues.length || preview.dupRings.length) throw new Error('Fix the problems listed above first.');
      const b = store.backend;
      await insertChunks(b, 'boxes', plan.boxes.map((x) => ({ ...x, active: true })));
      await insertChunks(b, 'birds', plan.birds.filter((x) => !x.clutch_id));
      const startSort = Math.max(0, ...m.data.pairings.filter((p) => p.season_id === seasonId && p.pairing_no === Number(pairingNo)).map((p) => p.sort_order));
      await insertChunks(b, 'pairings', plan.pairings.map((p) => ({ ...p, season_id: seasonId, sort_order: startSort + p.sort_order })));
      await insertChunks(b, 'clutches', plan.clutches);
      await insertChunks(b, 'birds', plan.birds.filter((x) => x.clutch_id));
      await store.reload();
      setDone(`Imported ${plan.pairings.length} pairs, ${plan.birds.filter((x) => x.clutch_id).length} youngsters, ${plan.birds.filter((x) => !x.clutch_id).length} new parent birds, ${plan.boxes.length} new boxes.`);
      setText('');
    });

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">Import a pairing list</h2>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        One pair per line, columns separated by <code>|</code>:<br />
        <code>L1 | Grizzle | Mia D | 2927/2928 | 3944/3945</code> (box, cock, hen, rings per round) or<br />
        <code>Block 1 | Grizzle | Race 193 - Glenn</code> (block, cock, hen).<br />
        Parents are matched to existing birds by name (case and spacing ignored); new names become new birds.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Season">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {[...m.data.seasons].sort((a, b) => b.year - a.year).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pairing number">
          <Input inputMode="numeric" value={pairingNo} onChange={(e) => setPairingNo(e.target.value)} />
        </Field>
        <Field label="First column is">
          <Select value={first} onChange={(e) => setFirst(e.target.value as 'box' | 'block')}>
            <option value="box">Box (with rounds)</option>
            <option value="block">Block (no rounds)</option>
          </Select>
        </Field>
        <Field label="Rings are">
          <div className="flex gap-1">
            <Input aria-label="Country" value={ring.country} onChange={(e) => setRing({ ...ring, country: e.target.value.toUpperCase() })} />
            <Input aria-label="Letters" value={ring.code} onChange={(e) => setRing({ ...ring, code: e.target.value.toUpperCase() })} />
            <Input aria-label="Year" inputMode="numeric" value={ring.year} onChange={(e) => setRing({ ...ring, year: Number(e.target.value) || ring.year })} />
          </div>
        </Field>
      </div>
      <Textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setDone(null); }} placeholder="Paste lines here" aria-label="Pairing list" className="font-mono text-sm" />
      <input type="file" accept=".txt,.csv,text/plain" onChange={(e) => readFile(e, setText)} aria-label="Load file" />

      {preview && (
        <div className="space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
          <p>
            <strong>{preview.plan.pairings.length}</strong> pairs · <strong>{preview.plan.birds.filter((b) => b.clutch_id).length}</strong> youngsters ·{' '}
            <strong>{preview.plan.birds.filter((b) => !b.clutch_id).length}</strong> new parent birds · <strong>{preview.plan.boxes.length}</strong> new boxes
          </p>
          {preview.plan.birds.filter((b) => !b.clutch_id).length > 0 && (
            <details>
              <summary className="cursor-pointer">New parent birds</summary>
              <p className="text-sm">{preview.plan.birds.filter((b) => !b.clutch_id).map((b) => b.name).join(' · ')}</p>
            </details>
          )}
          {preview.parsed.issues.length > 0 && <ErrorText>{preview.parsed.issues.map((i) => `Line ${i.line}: ${i.message}`).join(' ')}</ErrorText>}
          {preview.dupRings.length > 0 && <ErrorText>{preview.dupRings.join(' ')} Remove or correct those rings to import.</ErrorText>}
          {preview.plan.notes.filter((n) => !preview.dupRings.includes(n)).length > 0 && (
            <WarnText>{preview.plan.notes.filter((n) => !preview.dupRings.includes(n)).join(' ')}</WarnText>
          )}
          {boxClashes.length > 0 && <WarnText>Already used in this pairing: box {boxClashes.join(', ')}. Importing adds a second pair to those boxes.</WarnText>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {done && <p className="font-semibold text-emerald-800 dark:text-emerald-300">{done}</p>}
      <Button className="w-full" disabled={busy || blocked || !preview.plan.pairings.length || !seasonId} onClick={doImport}>
        Import
      </Button>
    </Card>
  );
}

function BirdImport() {
  const m = useModel();
  const store = useStore();
  const [text, setText] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const plan = useMemo(() => (text.trim() ? planBirdCsv(text, m.data.birds, () => crypto.randomUUID()) : null), [text, m]);

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">Import birds (CSV)</h2>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Same columns as the bird export: <code>ring, name, sex, colour, hatch_date, status, sire, dam, notes</code>. Ring as{' '}
        <code>ZA 3979 BORD 2026</code>; sire/dam by ring or name. Existing birds are skipped. Pair and round columns are ignored.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { readFile(e, setText); setDone(null); }} aria-label="Load CSV file" />
      {plan && (
        <div className="space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
          <p><strong>{plan.birds.length}</strong> birds to add · <strong>{plan.skipped.length}</strong> already exist</p>
          {plan.errors.length > 0 && <ErrorText>{plan.errors.join(' ')}</ErrorText>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {done && <p className="font-semibold text-emerald-800 dark:text-emerald-300">{done}</p>}
      <Button
        className="w-full"
        disabled={busy || !plan || plan.errors.length > 0 || plan.birds.length === 0}
        onClick={() =>
          run(async () => {
            await insertChunks(store.backend, 'birds', plan!.birds);
            await store.reload();
            setDone(`Added ${plan!.birds.length} birds.`);
            setText('');
          })
        }
      >
        Import birds
      </Button>
    </Card>
  );
}
