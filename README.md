# OudeLuck Loft Book

A mobile-first web app for OudeLuck Lofts (Tarkastad, Eastern Cape). Type a ring number and you get that youngster's sire, dam, box, round and nest mate. You can also record rings as youngsters are rung, and manage pairings, boxes and seasons.

React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, Row Level Security), installable PWA, deployed on Vercel.

> **Connection needed.** Data is read live from Supabase. The app shell is cached, so it opens without signal, but lookups and saves need a connection.

## Rings

A full ring reads **country · number · letters · year**, e.g. `ZA 3979 BORD 2026`. A ring is unique across all four parts. In Lookup you can type just the number (`3979`) or the full ring.

**Ring sequences** (More → Ring sequences) record the ring numbers issued to you, e.g. `ZA 3901–4000 BORD 2026`. A number counts as a **gap** when it lies between the lowest and highest ring used from a sequence but isn't recorded on any bird. That means it is unused, lost or not logged.

## Try it without Supabase

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and tap **Try with seed data**. Everything works in demo mode, but changes are lost when you reload.

## Set up Supabase

1. Create a project at https://supabase.com. Then copy **Project URL** and the **anon public** key from *Project Settings → API*.
2. Create `.env.local` in this folder:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

3. **Run the migrations.** Use either option:
   - **SQL editor:** paste and run each file in `supabase/migrations/`, in name order.
   - **Supabase CLI:**

     ```bash
     npx supabase login
     ```

     ```bash
     npx supabase link --project-ref YOUR-PROJECT-REF
     ```

     ```bash
     npx supabase db push --include-seed
     ```

     This runs the migrations and loads the seed data in one step.

4. **Load the seed data** (2026 season: 38 + 33 pairs, 122 youngsters), unless you already used `--include-seed` in step 3. Paste and run `supabase/seed.sql` in the SQL editor. Run it once only: a second run fails on duplicate IDs.
5. **Allow yourself in.** Run this in the SQL editor:

   ```sql
   insert into public.allowed_users (email) values ('you@example.com');  -- lower case
   ```

6. **Create your login.** Under *Authentication → Users → Add user → Create new user*, enter the same email and tick *Auto confirm*. The app never creates accounts itself, so nobody else can sign up.
7. **Allow the redirect.** Under *Authentication → URL Configuration*, set *Site URL* to your Vercel address. Add `http://localhost:5173` and your Vercel address to *Redirect URLs*.

Sign in with your email and open the magic link on your phone.

### Access control

There is one role: the owner. Every table has Row Level Security that allows read and write only when the signed-in email is in `allowed_users`. A signed-in user who isn't on that list sees nothing. The anon key can read nothing. To give someone else access later, add their email to `allowed_users` and create their user. They then get full write access too, because there is no read-only role.

### Regenerating the seed

`supabase/seed.sql` is generated from `supabase/seed/seed-data.ts` by the same parser the in-app import uses:

```bash
npm run seed:generate
```

The seeded ring sequences (2901–3000 and 3901–4000) are a guess. Edit them in the app to match the rings you were issued.

## Tests

```bash
npm test
```

This runs unit tests for:
- ring parsing (`2927/2928`, `3901`, `ZA 3979 BORD 2026`)
- duplicate detection
- gap detection
- CSV
- lookup
- the seed totals: 38 and 33 pairs, 122 youngsters, no duplicates, and gaps 3963, 3964, 3969–3972 and 3987

```bash
scripts/test-db.sh
```

This runs the real migrations and seed on a throwaway local Postgres 16+, using a stub of Supabase's `auth` schema. It checks totals, the duplicate-ring constraint, RLS (stranger, anon and owner), `merge_birds` and the delete rules. It needs `initdb`/`pg_ctl` (set `PG_BIN` if they aren't on `PATH`).

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel. The framework preset is **Vite**, the build command is `npm run build`, and the output directory is `dist`.
2. Under *Settings → Environment Variables*, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy, then add the Vercel URL to Supabase's redirect URLs (step 7 above).
4. On Android, open the site in Chrome and choose *⋮ → Add to Home screen* (or *Install app*).

`vercel.json` sends every route to `index.html` and stops the service worker file from being cached.

## Import and export

- **Export:** all birds with sire and dam as CSV, and all pairs with rings per round.
- **Import a pairing list:** one pair per line, in the same format as the seed (`L1 | Grizzle | Mia D | 2927/2928 | 3944/3945`, or `Block 1 | cock | hen`). It goes into any season and pairing number. Parents are matched by exact name, ignoring case and spacing. A duplicate ring blocks the import.
- **Import birds:** a CSV with the same columns as the bird export.

## Folder structure

```
src/
  app/            routes, layout, theme
  components/     shared UI, bird picker, comments
  data/           types, Supabase + demo backends, store, derived model (lookup, stats)
  features/       lookup, pairings (+ add rings), birds, stats, settings, importExport, auth
  lib/            rings (parse/dupes/gaps), pairing-list parser, CSV
supabase/
  migrations/     schema, RLS, merge_birds
  seed/           seed data, generator, seed tests
  seed.sql        generated seed
scripts/          test-db.sh / test-db.sql
```
