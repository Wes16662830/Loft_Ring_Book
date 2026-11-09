import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useModel, useStore } from '../../data/store.tsx';
import type { Bird, BirdStatus, Sex } from '../../data/types.ts';
import { ringClashes } from '../../lib/rings.ts';
import { BirdPicker, resolvePicked, type PickedBird } from '../../components/BirdPicker.tsx';
import { Button, Empty, ErrorText, Field, Input, PageHeader, Select, Textarea, useAction } from '../../components/ui.tsx';
import { loadRingDefaults } from '../pairings/AddRingsSheet.tsx';
import { useToast } from '../../components/toast.tsx';

export function BirdFormPage() {
  const { id } = useParams();
  const m = useModel();
  const store = useStore();
  const nav = useNavigate();
  const b = id ? m.bird.get(id) : undefined;
  const d = loadRingDefaults(m.activeSeason?.year);

  const [country, setCountry] = useState(b ? (b.ring_country ?? '') : d.country);
  const [number, setNumber] = useState(b?.ring_number != null ? String(b.ring_number) : '');
  const [code, setCode] = useState(b ? (b.ring_code ?? '') : d.code);
  const [year, setYear] = useState(b ? (b.ring_year != null ? String(b.ring_year) : '') : String(d.year));
  const [name, setName] = useState(b?.name ?? '');
  const [sex, setSex] = useState<Sex>(b?.sex ?? 'unknown');
  const [colour, setColour] = useState(b?.colour ?? '');
  const [hatch, setHatch] = useState(b?.hatch_date ?? '');
  const [status, setStatus] = useState<BirdStatus>(b?.status ?? 'active');
  const [sire, setSire] = useState<PickedBird | null>(b?.sire_id ? { id: b.sire_id } : null);
  const [dam, setDam] = useState<PickedBird | null>(b?.dam_id ? { id: b.dam_id } : null);
  const [notes, setNotes] = useState(b?.notes ?? '');
  const { busy, error, run } = useAction();
  const toast = useToast();

  if (id && !b) return <Empty>Bird not found.</Empty>;

  const num = number.trim() ? Number(number) : null;
  const numberBad = number.trim() !== '' && !/^\d+$/.test(number.trim());
  const clashes =
    num != null && !numberBad
      ? ringClashes(m.data.birds, { country: country.trim().toUpperCase(), number: num, code: code.trim().toUpperCase(), year: Number(year) || (null as unknown as number) }, b?.id)
      : [];

  const save = () =>
    run(async () => {
      if (numberBad) throw new Error('Ring number must be digits only.');
      if (num == null && !name.trim()) throw new Error('Give the bird a ring number or a name.');
      if (year.trim() && !/^\d{4}$/.test(year.trim())) throw new Error('Year must be four digits.');
      const ins = (rows: Partial<Bird>[]) => store.backend.insert('birds', rows);
      const row: Partial<Bird> = {
        ring_country: num != null ? country.trim().toUpperCase() || null : null,
        ring_number: num,
        ring_code: num != null ? code.trim().toUpperCase() || null : null,
        ring_year: num != null && year.trim() ? Number(year) : null,
        name: name.trim() || null,
        sex,
        colour: colour.trim() || null,
        hatch_date: hatch || null,
        status,
        sire_id: sire ? await resolvePicked(sire, 'cock', ins) : null,
        dam_id: dam ? await resolvePicked(dam, 'hen', ins) : null,
        notes: notes.trim() || null,
      };
      if (b && (row.sire_id === b.id || row.dam_id === b.id)) throw new Error('A bird cannot be its own parent.');
      let bid = b?.id;
      if (b) await store.backend.update('birds', b.id, row);
      else bid = (await store.backend.insert('birds', [row]))[0].id;
      await store.reload();
      toast(b ? 'Bird saved' : 'Bird added');
      nav(`/birds/${bid}`, { replace: true });
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeader back title={b ? 'Edit bird' : 'New bird'} />
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">Ring (leave number empty for a name-only bird)</legend>
        <div className="grid grid-cols-[4rem_1fr_5rem_5rem] gap-2">
          <Input aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ZA" />
          <Input aria-label="Ring number" inputMode="numeric" className="ringnum text-xl! font-bold" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="3979" />
          <Input aria-label="Letters" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BORD" />
          <Input aria-label="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
        </div>
      </fieldset>
      {clashes.length > 0 && (
        <ErrorText>
          That ring is already recorded:{' '}
          {clashes.map((c) => (
            <Link key={c.id} to={`/birds/${c.id}`} className="underline">open it</Link>
          ))}
        </ErrorText>
      )}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Sex">
          <Select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="unknown">Unknown</option>
            <option value="cock">Cock</option>
            <option value="hen">Hen</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as BirdStatus)}>
            <option value="active">Active</option>
            <option value="sold">Sold</option>
            <option value="lost">Lost</option>
            <option value="dead">Dead</option>
          </Select>
        </Field>
        <Field label="Colour">
          <Input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. Blue bar" />
        </Field>
        <Field label="Hatch date">
          <Input type="date" value={hatch} onChange={(e) => setHatch(e.target.value)} />
        </Field>
      </div>
      <BirdPicker label="Sire" sex="cock" value={sire} onChange={setSire} excludeId={b?.id} />
      <BirdPicker label="Dam" sex="hen" value={dam} onChange={setDam} excludeId={b?.id} />
      <Field label="Notes">
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || clashes.length > 0}>
        {b ? 'Save bird' : 'Add bird'}
      </Button>
    </form>
  );
}
