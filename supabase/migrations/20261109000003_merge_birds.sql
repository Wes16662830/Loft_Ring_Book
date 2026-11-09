-- Merge two records of the same bird (e.g. "57 Money Penny" and "57 Kingpin x Money Penny").
-- Every reference to drop_id moves to keep_id; empty fields on keep_id are filled from drop_id;
-- notes are combined; drop_id is deleted. Runs as the caller, so RLS still applies.

create or replace function public.merge_birds(keep_id uuid, drop_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  k public.birds;
  d public.birds;
begin
  if not public.is_owner() then
    raise exception 'Not allowed';
  end if;
  if keep_id = drop_id then
    raise exception 'Choose two different birds';
  end if;
  select * into k from public.birds where id = keep_id for update;
  select * into d from public.birds where id = drop_id for update;
  if k.id is null or d.id is null then
    raise exception 'Bird not found';
  end if;
  if k.sire_id = d.id or k.dam_id = d.id or d.sire_id = k.id or d.dam_id = k.id then
    raise exception 'One bird is a parent of the other — they cannot be the same bird';
  end if;
  if k.ring_number is not null and d.ring_number is not null
     and (k.ring_country, k.ring_number, k.ring_code, k.ring_year) is distinct from (d.ring_country, d.ring_number, d.ring_code, d.ring_year) then
    raise exception 'Both birds have different rings — edit one first';
  end if;
  if k.sex <> 'unknown' and d.sex <> 'unknown' and k.sex <> d.sex then
    raise exception 'One bird is a cock and the other a hen';
  end if;

  update public.birds set sire_id = keep_id where sire_id = drop_id;
  update public.birds set dam_id  = keep_id where dam_id  = drop_id;
  update public.pairings set cock_id = keep_id where cock_id = drop_id;
  update public.pairings set hen_id  = keep_id where hen_id  = drop_id;
  update public.comments set bird_id = keep_id where bird_id = drop_id;
  insert into public.comments (bird_id, body)
    values (keep_id, format('Merged with "%s".', coalesce(d.name, d.ring_number::text, d.id::text)));

  delete from public.birds where id = drop_id;

  update public.birds set
    ring_country = coalesce(k.ring_country, d.ring_country),
    ring_number  = coalesce(k.ring_number,  d.ring_number),
    ring_code    = coalesce(k.ring_code,    d.ring_code),
    ring_year    = coalesce(k.ring_year,    d.ring_year),
    name         = coalesce(k.name,         d.name),
    sex          = case when k.sex = 'unknown' then d.sex else k.sex end,
    colour       = coalesce(k.colour,       d.colour),
    hatch_date   = coalesce(k.hatch_date,   d.hatch_date),
    sire_id      = coalesce(k.sire_id,      d.sire_id),
    dam_id       = coalesce(k.dam_id,       d.dam_id),
    clutch_id    = coalesce(k.clutch_id,    d.clutch_id),
    notes        = nullif(concat_ws(E'\n', k.notes, d.notes), '')
  where id = keep_id;
end $$;

revoke all on function public.merge_birds(uuid, uuid) from public, anon;
grant execute on function public.merge_birds(uuid, uuid) to authenticated;
