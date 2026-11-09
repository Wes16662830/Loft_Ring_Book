import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import { pairingTitle } from '../../data/model.ts';
import type { Bird } from '../../data/types.ts';
import { BirdPicker, resolvePicked, type PickedBird } from '../../components/BirdPicker.tsx';
import { Button, Empty, ErrorText, Field, Input, PageHeader, Select, Textarea, WarnText, useAction } from '../../components/ui.tsx';

export function PairFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const m = useModel();
  const store = useStore();
  const nav = useNavigate();
  const existing = id ? m.pairing.get(id) : undefined;

  const [seasonId, setSeasonId] = useState(existing?.season_id ?? params.get('season') ?? m.activeSeason?.id ?? '');
  const [pairingNo, setPairingNo] = useState(String(existing?.pairing_no ?? params.get('no') ?? 1));
  const [boxId, setBoxId] = useState(existing?.box_id ?? '');
  const [block, setBlock] = useState(existing?.block ?? '');
  const [cock, setCock] = useState<PickedBird | null>(existing ? { id: existing.cock_id } : null);
  const [hen, setHen] = useState<PickedBird | null>(existing ? { id: existing.hen_id } : null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const { busy, error, run } = useAction();

  if (id && !existing) return <Empty>Pair not found.</Empty>;
  if (!m.data.seasons.length) return <Empty>Add a season first (More → Seasons).</Empty>;

  const no = Math.max(1, Number(pairingNo) || 1);
  const boxClash = boxId
    ? m.data.pairings.find((p) => p.id !== existing?.id && p.season_id === seasonId && p.pairing_no === no && p.box_id === boxId)
    : undefined;
  const cockId = cock && 'id' in cock ? cock.id : null;
  const henId = hen && 'id' in hen ? hen.id : null;
  const alreadyPaired = (bid: string | null) =>
    bid ? m.data.pairings.find((p) => p.id !== existing?.id && p.season_id === seasonId && p.pairing_no === no && (p.cock_id === bid || p.hen_id === bid)) : undefined;
  const cockBusy = alreadyPaired(cockId);
  const henBusy = alreadyPaired(henId);
  const boxes = [...m.data.boxes].filter((b) => b.active || b.id === boxId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const save = () =>
    run(async () => {
      if (!cock || !hen) throw new Error('Choose a cock and a hen.');
      const ins = (rows: Partial<Bird>[]) => store.backend.insert('birds', rows);
      const cId = await resolvePicked(cock, 'cock', ins);
      const hId = await resolvePicked(hen, 'hen', ins);
      if (cId === hId) throw new Error('Cock and hen must be different birds.');
      const row = { season_id: seasonId, pairing_no: no, box_id: boxId || null, block: block.trim() || null, cock_id: cId, hen_id: hId, notes: notes.trim() || null };
      let pid = existing?.id;
      if (existing) await store.backend.update('pairings', existing.id, row);
      else {
        const sort = Math.max(0, ...m.data.pairings.filter((p) => p.season_id === seasonId && p.pairing_no === no).map((p) => p.sort_order)) + 1;
        pid = (await store.backend.insert('pairings', [{ ...row, sort_order: sort }]))[0].id;
      }
      // Fill in sex for name-only birds that were unknown.
      for (const [bid, sex] of [[cId, 'cock'], [hId, 'hen']] as const) {
        if (m.bird.get(bid)?.sex === 'unknown') await store.backend.update('birds', bid, { sex });
      }
      await store.reload();
      nav(`/pairings/${pid}`, { replace: true });
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeader back title={existing ? 'Edit pair' : 'New pair'} />
      <Field label="Season">
        <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {[...m.data.seasons].sort((a, b) => b.year - a.year).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Pairing number" hint="1 = first pairing; 2 = re-pairing, etc. Change this to move the pair.">
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <Button key={n} variant={no === n ? 'primary' : 'secondary'} onClick={() => setPairingNo(String(n))}>{n}</Button>
          ))}
          <Input inputMode="numeric" className="w-24" value={pairingNo} onChange={(e) => setPairingNo(e.target.value)} aria-label="Pairing number" />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Box">
          <Select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
            <option value="">No box</option>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Block">
          <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="e.g. Block 1" />
        </Field>
      </div>
      {boxClash && <WarnText>Box {m.box.get(boxId)?.name} is already used by another pair in pairing {no} ({pairingTitle(m, boxClash)}).</WarnText>}
      <BirdPicker label="Cock" sex="cock" value={cock} onChange={setCock} excludeId={henId ?? undefined} />
      {cockBusy && <WarnText>This cock is already in another pair in pairing {no}.</WarnText>}
      <BirdPicker label="Hen" sex="hen" value={hen} onChange={setHen} excludeId={cockId ?? undefined} />
      {henBusy && <WarnText>This hen is already in another pair in pairing {no}.</WarnText>}
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !cock || !hen || !seasonId}>
        {existing ? 'Save pair' : 'Add pair'}
      </Button>
    </form>
  );
}
