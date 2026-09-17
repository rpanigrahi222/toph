# Toph — farm activity dashboard

Full-stack implementation of the Toph dashboard: farm workers record voice logs in
any language, Toph transcribes them live, extracts the compliance-relevant facts
(activity, field, chemical, rate, time), and the farmer reviews them here.

**Live demo:** _add your Vercel URL_

## What's in the box

| Area | Implementation |
|---|---|
| Dashboard (the Figma) | Stat cards from real queries, filter/sort/search via URL params, expandable rows with waveform, playback, tags, transcript, satellite map of the field |
| **Record a log** | Browser mic → Deepgram Nova‑3 live WebSocket → interim transcript → Claude structured extraction → row appears on the dashboard |
| Multilingual | Auto-detect (code-switching across 10 languages) or pick one of 16. Original transcript is kept; the farmer reads an English translation + summary |
| Confidence & review | Every log gets a 0–1 confidence and, when low, a `needs_review` flag with a reason. Admin fixes it inline; every edit lands in an audit trail |
| Map | All fields on satellite imagery, coloured by **restricted-entry interval** (REI) computed from the product label of the last spray |
| **Messages** | Office ↔ crew messaging. Admin writes English, the worker reads it in their own language (Claude translation, both versions stored). "View as worker" shows exactly what lands on the phone. Flagged logs have a one-click "Ask to re-record" that pre-fills a translated request |
| Activity Logs | All logs, status filter, bulk "mark reviewed", CSV export |
| Performance / Employees | Per-worker log counts, average confidence, flagged count |

## Architecture

```
Browser
 ├─ Dashboard (React Server Components + TanStack Query for live refresh)
 └─ /record
      ├─ GET /api/deepgram/token   → 60 s access token + farm keyterms (API key never leaves the server)
      ├─ WSS → Deepgram Live       → interim + final transcripts
      └─ POST /api/logs/ingest     → audio to Blob storage, transcript to Claude
                                     (structured output, zod-validated), insert log + applications + audit event
Next.js 16 (App Router) · Drizzle ORM · Postgres (Docker locally, Neon on Vercel)
```

Key decisions:

- **Postgres + Drizzle**, not a document store: applications-per-log, tags, audit
  events and field geometry are relational. Field polygons are stored as GeoJSON in
  `jsonb` so Neon's free tier works without PostGIS.
- **Filters live in the URL.** Every dashboard view is a shareable link and the back
  button works. Server components render the first paint; TanStack Query polls
  every 15 s so a log recorded on a phone shows up without a refresh.
- **Deepgram keyterm prompting.** Product names, active ingredients and field codes
  from the `products` / `fields` tables are sent as Nova‑3 keyterms, so "atrazine"
  and "2,4‑D" aren't transcribed as "at your scene" and "two four dee".
- **Extraction is a typed contract.** `src/lib/extract.ts` defines a zod schema; Claude
  is asked for that exact shape via structured outputs. If the key is missing or the
  call fails, a conservative keyword fallback produces a low-confidence, flagged
  log rather than nothing.
- **Docker is for local parity, Vercel for hosting.** `docker compose up` gives any
  reviewer Postgres in one command; the `Dockerfile` proves the app runs anywhere
  containers do. Vercel deploys the same code with Neon as the database.

## Run it locally

```bash
cp .env.example .env          # add DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
npm install
npm run setup                 # docker compose up db → drizzle push → seed
npm run dev                   # http://localhost:3000
```

Without API keys the dashboard, map and seeded data all work; `/record` falls back
to a typed transcript and keyword extraction.

Fully containerised: `docker compose --profile app up --build`.

## Deploy to Vercel

1. Create a Neon database and set `DATABASE_URL` (pooled connection string) in Vercel.
2. Add `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`. Attach a Blob store (sets `BLOB_READ_WRITE_TOKEN`).
3. Run the schema + seed once against Neon: `DATABASE_URL=... npm run db:push && npm run db:seed`.
4. `vercel deploy`. Every PR gets a preview URL.

## Scripts

| | |
|---|---|
| `npm run setup` | start Postgres, push schema, seed |
| `npm run db:seed` | reseed (wipes data) |
| `npm run db:studio` | Drizzle Studio |
| `npm run typecheck` / `npm run lint` | |

## Data model

`farms → users (admin/worker) · fields (GeoJSON) · products (REI hours, aliases)`
`logs → log_applications (product, rate, unit) · log_tags · audit_events`

## Not built (on purpose)

Audit Manager, Reports, Schedule, Settings and Support are honest stubs
that describe what they'd do. Auth is a seeded admin — "Switch User" and "Log Out"
are visual only.
