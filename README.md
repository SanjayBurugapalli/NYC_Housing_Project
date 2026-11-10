# BeforeYouRent

An interactive full-stack map application that analyzes NYC residential buildings using public data and assigns each one a composite health score (0–100) based on complaints, violations, and inspections.

## Features

- Interactive Mapbox map with color-coded building health scores
- Neighborhood-level heatmap at low zoom, individual buildings at street level
- Natural language search (rule-based parser first, with a Claude Haiku fallback for ambiguous queries; degrades to pure rule-based when no API key is configured)
- Building detail panel with score breakdowns, violation history, and StreetEasy links
- Grade filter (A–F) and custom scoring weight sliders (on both the map detail panel and the rankings page)
- Neighborhood resolution from NTA names and community-district codes
- Search history and example suggestion dropdown
- CSV export for search results
- Paste a StreetEasy or Zillow link to jump to that building
- Subway + walking commute to a saved work address (via Transitous)
- Food nearby: delis, groceries and restaurants with estimated price tiers

## Tech Stack

- **Frontend:** Next.js (TypeScript), Mapbox GL JS, Tailwind CSS, shadcn/ui, React Query, Zustand
- **Backend:** FastAPI (Python), PostgreSQL + PostGIS, SQLAlchemy/asyncpg
- **Data Pipeline:** sodapy (Socrata), pandas; scheduled refresh via `data/refresh.py` (Railway cron)
- **Infra:** Docker Compose (local), Vercel (frontend), Railway/Render (backend)

## Getting Started

```bash
docker-compose up                    # Start Postgres, backend, frontend
cd backend && uvicorn app.main:app --reload  # Backend dev server (port 8000)
cd frontend && npm run dev           # Frontend dev server (port 3000)
```

## Data Pipeline

```bash
python data/ingest/pull_pluto.py     # Pull PLUTO dataset
python data/ingest/pull_311.py       # Pull 311 complaints (incremental)
python data/ingest/pull_hpd.py       # Pull HPD violations/complaints
python data/transform/normalize.py   # Address normalization + BBL joining
python data/scoring/compute.py       # Recompute health scores
python data/ingest/pull_food.py      # Restaurants (DOHMH) + delis/groceries (NY State), full replace
```

## API

| Endpoint | What it returns |
|---|---|
| `GET /api/buildings?bbox=&zoom=` | Buildings in the map viewport |
| `GET /api/buildings/{bbl}` | Full building detail: score breakdown, records, owner portfolio |
| `GET /api/buildings/{bbl}/food?radius_m=400` | Food places within walking distance (counts + nearest 200) |
| `GET /api/commute?from_lat=&from_lng=&to_lat=&to_lng=` | Weekday 8:30 AM subway + walking trip (Transitous) |
| `POST /api/resolve-listing` | StreetEasy/Zillow listing URL → building (address parsed from the URL, never fetched) |
| `POST /api/search` | Address / BBL / plain-English search; returns interpreted filter chips. Accepts `filters` (structured override) and `bbox` |
| `GET /api/search/by-owner`, `/api/search/by-manager` | An owner's or managing agent's buildings |
| `GET /api/neighborhoods`, `/api/neighborhoods/polygons` | Neighborhood aggregate scores |
| `GET /api/rankings/buildings`, `/api/rankings/landlords` | Worst buildings / landlords |
| `GET /api/refresh-status` | Per-dataset data freshness |

Commute routing is by [Transitous](https://transitous.org), which requires visible
attribution and open-source, non-commercial use.

### Incremental pulls & wide re-pull / backfill

The nightly refresh pulls each **event** dataset (311, HPD violations, DOB violations, litigations, rodent, evictions) with a rolling **60-day** window (`NIGHTLY_LOOKBACK_DAYS` in `data/ingest/base.py`) and upserts — it never deletes, so the full multi-year store stays complete as long as runs don't lapse for ~60 days straight. Scoring still considers 5 years (`DATA_CUTOFF_YEARS`). HPD/DOB *complaints*, PLUTO, and registrations are pulled in full each run (their date fields aren't safely range-filterable, or they're snapshot/universe datasets), but their writes are batched so it stays fast.

To backfill the full window in one command — e.g. after a scoring change, after a lapse, or to recover complaint→building links dropped for a missing BBL — pass `--days-back`, which widens **every** incremental puller:

```bash
python data/refresh.py --days-back=1825                              # wide re-pull of all event datasets, then rescore
python data/refresh.py --datasets=311_complaints --days-back=1825    # just 311
```

In prod, run it with `railway run` against the cron service, or temporarily point the cron service at a one-off branch that overrides its start command (drop `cronSchedule` so it runs on deploy), then switch the service back to `main`.

---

## TODO

Items below are known improvements that have not yet been implemented, along with the reason each is deferred.

### Security & Reliability

- **HTTPS enforcement** — Redirect HTTP → HTTPS at the infrastructure layer. Vercel enforces HTTPS automatically; for Railway/Render add a reverse-proxy rule (e.g. Caddy or the host's built-in redirect setting). Cannot be done in application code alone.

- **Secrets rotation policy** — Document the process for rotating `DATABASE_URL`, `MAPBOX_TOKEN`, and `ANTHROPIC_API_KEY`. Recommended: store secrets in Vercel/Railway secret manager, set calendar reminders for rotation every 90 days. Cannot be implemented in code — requires ops process and team agreement.

### Performance

- **Grade-colored building outlines** — [data/publish_footprints.py](data/publish_footprints.py) joins the city's building footprints (`5zhs-2jue`) to grades by BBL and tiles them (z15–16) into `footprints.pmtiles`; the map fills each outline in its grade color when `NEXT_PUBLIC_FOOTPRINTS_URL` is set and falls back to dots otherwise. Grades are baked in, so rebuild after rescoring. Locally: build with `--no-upload`, copy to `frontend/public/local-tiles/`, and point the env var at `pmtiles://http://localhost:3000/local-tiles/footprints.pmtiles`.
- **Vector tile serving** — Verified locally. [tiles/generate.sh](tiles/generate.sh) produces `buildings.pmtiles` (tippecanoe) and [data/publish_tiles.py](data/publish_tiles.py) uploads it to Vercel Blob on the nightly refresh; [Map.tsx](frontend/src/components/Map.tsx) draws the building dots from it when `NEXT_PUBLIC_TILES_URL` is set. Tiles carry every building, thinned evenly by tippecanoe at lower zooms, so the dots cover the whole screen with the true grade mix. Without the env var the map falls back to the API's capped, worst-first GeoJSON (500 per viewport), which clumps and skews red. Locally: run `generate.sh` with `OUTPUT_FORMAT=pmtiles`, copy the archive to `frontend/public/local-tiles/`, and set `NEXT_PUBLIC_TILES_URL=pmtiles://http://localhost:3000/local-tiles/buildings.pmtiles`. Remaining for production: set `BLOB_READ_WRITE_TOKEN` (cron) + `NEXT_PUBLIC_TILES_URL` (Vercel) and confirm Blob serves range requests to the site's origin.

- **Scheduled refresh** — Handled by `data/refresh.py`, run nightly on Railway cron (04:00 UTC), with Sentry cron monitoring for missed/failed runs. The earlier Celery beat scaffold was unused (empty stub task bodies) and has been removed.

- **Frontend bundle analysis** — Run `ANALYZE=true npm run build` (after adding `@next/bundle-analyzer` to `devDependencies`) to identify large chunks and apply `next/dynamic` imports. This is a one-time developer analysis task, not a code change with a clear outcome until profiling is done.

### UX & Accessibility

- **Keyboard navigation on map markers** — Mapbox GL JS renders markers on a `<canvas>` element, which is inherently not keyboard-navigable. Making individual building dots accessible would require replacing the Mapbox `data-driven circle` layer with HTML overlay markers (`mapboxgl.Marker`) for every visible building — prohibitively expensive at the scale of tens of thousands of buildings in view. A practical alternative would be to make only search-result buildings accessible as overlays, but that is a significant architectural change.

- **Mobile layout** — Already implemented. `page.tsx` renders `BuildingPanel`, `SearchResultsPanel`, and `InfoPanel` as full-width bottom sheets at `< md` breakpoints, and as a right sidebar at `md+`.

- **Building class legend** — Already implemented. The building detail panel shows the full class description (e.g. `D3 — ELEVATOR APT; FIREPROOF WITHOUT STORES`) via `getBuildingClassLabel` in `buildingClasses.ts`.

### Data & Accuracy

- **StreetEasy Queens link accuracy** — StreetEasy keys Queens building URLs by neighborhood, so the building panel feeds each building's `nta_name` into the slug builder ([streeteasy.ts](frontend/src/components/building/streetEasy.ts)). NTA names mostly match StreetEasy's neighborhood slugs, but some merged/hyphenated NTAs won't, and the Queens house-number/ordinal slug rules are unverified — StreetEasy 403s automated requests, so confirming 200 vs. 404 needs a real browser. Deferred until manual verification is possible.
