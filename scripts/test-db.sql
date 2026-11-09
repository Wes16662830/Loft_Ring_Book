-- Assertions run by scripts/test-db.sh. Any failed assert aborts with an error.
insert into public.allowed_users (email) values ('owner@example.com');

do $$
declare n int;
begin
  select count(*) into n from pairings where pairing_no = 1; assert n = 38, format('pairing 1 pairs: %s', n);
  select count(*) into n from pairings where pairing_no = 2; assert n = 33, format('pairing 2 pairs: %s', n);
  select count(*) into n from birds where ring_number is not null; assert n = 122, format('youngsters: %s', n);
  select count(*) into n from boxes; assert n = 38, format('boxes: %s', n);
  select count(*) into n from (select generate_series(3901, 3988) g) s
    where not exists (select 1 from birds where ring_number = s.g);
  assert n = 7, format('gaps 3901-3988: %s', n);
end $$;

-- Duplicate ring is rejected by the database (including when year is null).
do $$
begin
  begin
    insert into birds (ring_country, ring_number, ring_code, ring_year) values ('za', 3901, 'bord', 2026);
    assert false, 'duplicate ring was accepted';
  exception when unique_violation then null;
  end;
  insert into birds (ring_number, name) values (1, 'a');
  begin
    insert into birds (ring_number, name) values (1, 'b');
    assert false, 'duplicate ring with null year was accepted';
  exception when unique_violation then null;
  end;
  delete from birds where ring_number = 1 and ring_year is null;
end $$;

-- RLS: a stranger sees nothing and cannot write; the owner can.
set role authenticated;
select set_config('request.jwt.claims', '{"email":"stranger@example.com"}', false);
do $$
declare n int;
begin
  select count(*) into n from birds; assert n = 0, format('stranger sees %s birds', n);
  begin
    insert into birds (name) values ('x');
    assert false, 'stranger insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform merge_birds(gen_random_uuid(), gen_random_uuid());
    assert false, 'stranger merge accepted';
  exception when raise_exception then null;
  end;
end $$;
set role anon;
do $$
begin
  begin
    perform count(*) from birds;
    assert false, 'anon could read birds';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"email":"OWNER@example.com"}', false);
do $$
declare n int; keep uuid; drop_ uuid; pairs_before int;
begin
  select count(*) into n from birds; assert n > 122, 'owner cannot read birds';
  select id into keep from birds where name = '57 Money Penny';
  select id into drop_ from birds where name = '57 Kingpin x Money Penny';
  select count(*) into pairs_before from pairings where hen_id in (keep, drop_);
  perform merge_birds(keep, drop_);
  select count(*) into n from birds where id = drop_; assert n = 0, 'dropped bird still exists';
  select count(*) into n from pairings where hen_id = keep; assert n = pairs_before, format('merged pairs %s vs %s', n, pairs_before);
  select count(*) into n from birds where dam_id = keep; assert n = 4, format('offspring of merged hen: %s', n);
  -- Deleting a bird that is in a pair is refused.
  begin
    delete from birds where id = keep;
    assert false, 'deleted a paired bird';
  exception when foreign_key_violation then null;
  end;
  -- Deleting a pair keeps youngsters with their parents.
  delete from pairings where pairing_no = 1 and hen_id = keep;
  select count(*) into n from birds where dam_id = keep and clutch_id is null; assert n = 4, 'youngsters lost on pair delete';
end $$;
reset role;
