-- OudeLuck Loft Book — core schema.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Breeding boxes in the loft (L1–L12, R1–R12, Q1–Q8, Race 1…). Add and rename freely.
create table public.boxes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  section     text not null default 'Other',   -- used for filtering: L / R / Q / Race / anything
  sort_order  int  not null default 0,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index boxes_name_key on public.boxes (lower(name));

-- A breeding season, normally one per year.
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  year        int  not null check (year between 1900 and 2200),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- At most one active season.
create unique index seasons_one_active on public.seasons (is_active) where is_active;

-- Ring sequences issued to the loft, e.g. ZA BORD 2026 3901–4000. Gaps are computed inside these.
create table public.ring_sequences (
  id          uuid primary key default gen_random_uuid(),
  country     text not null default 'ZA',
  code        text not null,
  year        int  not null,
  start_no    int  not null check (start_no >= 0),
  end_no      int  not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_no >= start_no)
);

create type public.bird_sex as enum ('cock', 'hen', 'unknown');
create type public.bird_status as enum ('active', 'sold', 'lost', 'dead');

create table public.birds (
  id            uuid primary key default gen_random_uuid(),
  -- Ring: country, number, letters, year — "ZA 3979 BORD 2026". All null for name-only birds.
  ring_country  text,
  ring_number   int check (ring_number >= 0),
  ring_code     text,
  ring_year     int check (ring_year between 1900 and 2200),
  name          text,
  sex           public.bird_sex not null default 'unknown',
  colour        text,
  hatch_date    date,
  sire_id       uuid references public.birds(id) on delete set null,
  dam_id        uuid references public.birds(id) on delete set null,
  clutch_id     uuid,  -- FK added after clutches exists
  status        public.bird_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ring_number is not null or nullif(trim(name), '') is not null),
  check (sire_id is distinct from id and dam_id is distinct from id)
);
-- A ring number is unique per country/letters/year. NULLS NOT DISTINCT so a missing year can't hide a duplicate.
create unique index birds_ring_key on public.birds (upper(ring_country), ring_number, upper(ring_code), ring_year)
  nulls not distinct where ring_number is not null;
create index birds_ring_number_idx on public.birds (ring_number);
create index birds_name_idx on public.birds (lower(name));
create index birds_sire_idx on public.birds (sire_id);
create index birds_dam_idx on public.birds (dam_id);

create table public.pairings (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id) on delete cascade,
  pairing_no  int  not null default 1 check (pairing_no >= 1),  -- 1 = first pairing, 2 = re-pairing…
  box_id      uuid references public.boxes(id) on delete set null,
  block       text,
  -- RESTRICT: deleting a bird that is still in a pair is refused; remove it from the pair first.
  cock_id     uuid not null references public.birds(id) on delete restrict,
  hen_id      uuid not null references public.birds(id) on delete restrict,
  sort_order  int  not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (cock_id <> hen_id)
);
create index pairings_season_idx on public.pairings (season_id, pairing_no);
create index pairings_cock_idx on public.pairings (cock_id);
create index pairings_hen_idx on public.pairings (hen_id);

-- One round (nest) of a pair. Youngsters link here via birds.clutch_id.
create table public.clutches (
  id          uuid primary key default gen_random_uuid(),
  pairing_id  uuid not null references public.pairings(id) on delete cascade,
  round_no    int  not null check (round_no >= 1),
  laid_date   date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pairing_id, round_no)
);

-- Deleting a pair or round keeps the youngsters (their sire/dam stay set) but unlinks the clutch.
alter table public.birds
  add constraint birds_clutch_fk foreign key (clutch_id) references public.clutches(id) on delete set null;
create index birds_clutch_idx on public.birds (clutch_id);

-- Timestamped comments on a bird (youngster or parent) or a pair.
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  bird_id     uuid references public.birds(id) on delete cascade,
  pairing_id  uuid references public.pairings(id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(bird_id, pairing_id) = 1)
);
create index comments_bird_idx on public.comments (bird_id);
create index comments_pairing_idx on public.comments (pairing_id);

do $$
declare t text;
begin
  foreach t in array array['boxes','seasons','ring_sequences','birds','pairings','clutches','comments'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
