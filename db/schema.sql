-- OudeLuck Loft Book — Cloudflare D1 (SQLite) schema.
-- Idempotent (IF NOT EXISTS): safe to run on every deploy. D1 enforces foreign keys.

-- Breeding boxes in the loft (L1–L12, R1–R12, Q1–Q8, Race 1…). Add and rename freely.
CREATE TABLE IF NOT EXISTS boxes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  section     TEXT NOT NULL DEFAULT 'Other',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS boxes_name_key ON boxes (lower(name));

CREATE TABLE IF NOT EXISTS seasons (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  year        INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  is_active   INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active ON seasons (is_active) WHERE is_active = 1;

-- Ring numbers issued to the loft, e.g. ZA BORD 2026 3901–4000. Gaps are computed inside these.
CREATE TABLE IF NOT EXISTS ring_sequences (
  id          TEXT PRIMARY KEY,
  country     TEXT NOT NULL DEFAULT 'ZA',
  code        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  start_no    INTEGER NOT NULL CHECK (start_no >= 0),
  end_no      INTEGER NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_no >= start_no)
);

CREATE TABLE IF NOT EXISTS birds (
  id            TEXT PRIMARY KEY,
  -- Ring: country, number, letters, year — "ZA 3979 BORD 2026". All null for name-only birds.
  ring_country  TEXT,
  ring_number   INTEGER CHECK (ring_number >= 0),
  ring_code     TEXT,
  ring_year     INTEGER CHECK (ring_year BETWEEN 1900 AND 2200),
  name          TEXT,
  sex           TEXT NOT NULL DEFAULT 'unknown' CHECK (sex IN ('cock', 'hen', 'unknown')),
  colour        TEXT,
  hatch_date    TEXT,
  sire_id       TEXT REFERENCES birds(id) ON DELETE SET NULL,
  dam_id        TEXT REFERENCES birds(id) ON DELETE SET NULL,
  clutch_id     TEXT REFERENCES clutches(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'lost', 'dead')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ring_number IS NOT NULL OR trim(coalesce(name, '')) <> ''),
  CHECK (sire_id IS NULL OR sire_id <> id),
  CHECK (dam_id IS NULL OR dam_id <> id)
);
-- A ring is unique per country/letters/year. coalesce() so a missing part can't hide a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS birds_ring_key ON birds (
  upper(coalesce(ring_country, '')), ring_number, upper(coalesce(ring_code, '')), coalesce(ring_year, 0)
) WHERE ring_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS birds_sire_idx ON birds (sire_id);
CREATE INDEX IF NOT EXISTS birds_dam_idx ON birds (dam_id);
CREATE INDEX IF NOT EXISTS birds_clutch_idx ON birds (clutch_id);

CREATE TABLE IF NOT EXISTS pairings (
  id          TEXT PRIMARY KEY,
  season_id   TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  pairing_no  INTEGER NOT NULL DEFAULT 1 CHECK (pairing_no >= 1),
  box_id      TEXT REFERENCES boxes(id) ON DELETE SET NULL,
  block       TEXT,
  -- RESTRICT: a bird that is still in a pair can't be deleted; remove it from the pair first.
  cock_id     TEXT NOT NULL REFERENCES birds(id) ON DELETE RESTRICT,
  hen_id      TEXT NOT NULL REFERENCES birds(id) ON DELETE RESTRICT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (cock_id <> hen_id)
);
CREATE INDEX IF NOT EXISTS pairings_season_idx ON pairings (season_id, pairing_no);
CREATE INDEX IF NOT EXISTS pairings_cock_idx ON pairings (cock_id);
CREATE INDEX IF NOT EXISTS pairings_hen_idx ON pairings (hen_id);

-- One round (nest) of a pair. Youngsters link here via birds.clutch_id.
-- Deleting a pair or round keeps the youngsters (sire/dam stay set) but unlinks the round.
CREATE TABLE IF NOT EXISTS clutches (
  id          TEXT PRIMARY KEY,
  pairing_id  TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  round_no    INTEGER NOT NULL CHECK (round_no >= 1),
  laid_date   TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (pairing_id, round_no)
);

-- Timestamped comments on a bird or a pair.
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  bird_id     TEXT REFERENCES birds(id) ON DELETE CASCADE,
  pairing_id  TEXT REFERENCES pairings(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (trim(body) <> ''),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((bird_id IS NULL) <> (pairing_id IS NULL))
);
CREATE INDEX IF NOT EXISTS comments_bird_idx ON comments (bird_id);
CREATE INDEX IF NOT EXISTS comments_pairing_idx ON comments (pairing_id);
