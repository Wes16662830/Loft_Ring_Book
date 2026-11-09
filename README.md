# OudeLuck Loft Book

A mobile-first web app for OudeLuck Lofts (Tarkastad, Eastern Cape). Type a ring number and you get that youngster's sire, dam, box, round and nest mate. You can also record rings as youngsters are rung, and manage pairings, boxes and seasons.

React + TypeScript + Vite + Tailwind CSS. It runs on **Cloudflare Pages**, with the API in **Pages Functions** (`functions/`) and the data in **Cloudflare D1** (SQLite). It's an installable PWA. All of this fits within Cloudflare's free plan.

> **No sign-in.** Anyone with the URL can view *and change* the data. Keep the URL to yourself. D1's Time Travel can restore the database to an earlier point if something goes wrong (see below).
>
> **Connection needed.** The app shell is cached so it opens without signal, but lookups and saves go to the database live.

## Rings

A full ring reads **country · number · letters · year**, e.g. `ZA 3979 BORD 2026`. A ring is unique across all four parts. In Lookup you can type just the number (`3979`) or the full ring.

**Ring sequences** (More → Ring sequences) record the ring numbers issued to you, e.g. `ZA 3901–4000 BORD 2026`. A number counts as a **gap** when it lies between the lowest and highest ring used from a sequence but isn't recorded on any bird. That means it is unused, lost or not logged.

## Deploy (GitHub Actions → Cloudflare)

This works the same way as the Sunstone Pricing app. `.github/workflows/deploy.yml` deploys on every push.

1. In this GitHub repo, open *Settings → Secrets and variables → Actions* and add two secrets. You can reuse the same token and account as Sunstone.
   - `CLOUDFLARE_API_TOKEN`: a token with **Cloudflare Pages: Edit** and **D1: Edit**.
   - `CLOUDFLARE_ACCOUNT_ID`: shown in the right sidebar of the Cloudflare dashboard.
2. Push. On the first run the workflow does the following:
   - creates the D1 database `loft-ring-book` and the Pages project `loft-ring-book`
   - applies `db/schema.sql`
   - loads `db/seed.sql`: the 2026 season, 38 + 33 pairs and 122 youngsters
   - deploys the site

   It only seeds when the database has **no birds**, so later deploys never touch your data.
3. A push to `main` deploys **production**, at `https://loft-ring-book.pages.dev`. Any other branch gets its own **preview** URL, which uses the same database.
4. On Android, open the site in Chrome and choose *⋮ → Add to Home screen* (or *Install app*).

### Backups and undo

- **Export** (More → Import / Export) downloads every bird, with sire and dam, as CSV. Do this now and then.
- **Time Travel** restores D1 to an earlier minute. Find the bookmark for a time, then restore it:

  ```bash
  npx wrangler d1 time-travel info loft-ring-book --timestamp=2026-11-09T12:00:00Z
  ```

  ```bash
  npx wrangler d1 time-travel restore loft-ring-book --bookmark=<bookmark>
  ```

  Check Cloudflare's docs for how far back the free plan reaches.

## Run locally

```bash
npm install
```

```bash
npm run db:local
```

```bash
npm run cf:dev
```

`db:local` creates a local D1 database under `.wrangler/` and loads the schema and seed. Run it once. `cf:dev` builds the app and serves the site plus the API on Cloudflare's local runtime at http://localhost:8788.

`npm run dev` (Vite on :5173) is faster for UI work but has no `/api`. Use `cf:dev` to work with data.

## Tests

```bash
npm test
```

51 tests, covering:
- ring parsing (`2927/2928`, `3901`, `ZA 3979 BORD 2026`)
- duplicate and gap detection, CSV, lookup and stats
- the seed totals: 38 and 33 pairs, 122 youngsters, no duplicates, and gaps 3963, 3964, 3969–3972 and 3987
- the API, run against the **real `db/schema.sql` and `db/seed.sql` on SQLite**: duplicate rings, delete rules, merge, atomic inserts, request limits

The deploy workflow runs the tests first and stops if any fail.

## Data model

| Table | Holds |
|---|---|
| `birds` | ring (country, number, letters, year — all empty for name-only birds), name, sex, colour, hatch date, sire, dam, round (`clutch_id`), status, notes |
| `seasons` | e.g. "2026 breeding" (one active) |
| `pairings` | season, pairing number (1, 2…), box, block, cock, hen |
| `clutches` | a pair's rounds (1, 2, 3…), laid date |
| `boxes` | your breeding boxes; add and rename freely |
| `ring_sequences` | ring numbers issued to you, for gap detection |
| `comments` | timestamped comments on a bird or a pair |

Rules the database enforces:
- A ring is unique, even when the year is missing.
- A bird that is still in a pair can't be deleted.
- Deleting a pair keeps its youngsters, with their sire and dam.

### Regenerating the seed

`db/seed.sql` is generated from `db/seed/seed-data.ts` by the same parser the in-app import uses:

```bash
npm run seed:generate
```

The seeded ring sequences (2901–3000 and 3901–4000) are a guess. Edit them in the app to match the rings you were issued.

## Import and export

- **Export:** all birds with sire and dam as CSV, and all pairs with rings per round.
- **Import a pairing list:** one pair per line, in the same format as the seed (`L1 | Grizzle | Mia D | 2927/2928 | 3944/3945`, or `Block 1 | cock | hen`). It goes into any season and pairing number. Parents are matched by exact name, ignoring case and spacing. A duplicate ring blocks the import.
- **Import birds:** a CSV with the same columns as the bird export.

## Folder structure

```
src/              the app (React)
  app/            routes, layout, theme
  components/     shared UI, bird picker, comments
  data/           types, API client, store, derived model (lookup, stats)
  features/       lookup, pairings (+ add rings), birds, stats, settings, importExport
  lib/            rings (parse/dupes/gaps), pairing-list parser, CSV
functions/        Cloudflare Pages Functions: /api/* (logic in _lib/api.ts)
db/               schema.sql, seed.sql, seed data + generator
wrangler.toml     Pages + D1 binding
.github/workflows/deploy.yml
```
