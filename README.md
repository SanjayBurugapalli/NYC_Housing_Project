# BeforeYouRent

An interactive full-stack map application that analyzes NYC residential buildings using public data and assigns each one a composite health score (0–100) based on complaints, violations, and inspections.

## Features

- Interactive Mapbox map with color-coded building health scores
- Neighborhood-level heatmap at low zoom, individual buildings at street level
- Natural language search (deterministic rule-based parser — no AI dependency)
- Building detail panel with score breakdowns, violation history, and StreetEasy links
- Grade filter (A–F) and custom scoring weight sliders
- Sub-neighborhood resolution using nearest-centroid Voronoi assignment
- Search history and example suggestion dropdown
- CSV export for search results

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
```

### Wide re-pull / backfill

The nightly refresh pulls 311 with a 365-day window, but scoring considers 5 years (`DATA_CUTOFF_YEARS`). To backfill the full window in one command — e.g. after a scoring change, or to recover complaint→building links dropped for a missing BBL — pass `--days-back`:

```bash
python data/refresh.py --datasets=311_complaints --days-back=1825  # wide 311 re-pull, then rescore
```

In prod, run it with `railway run` against the cron service, or temporarily point the cron service at a one-off branch that overrides its start command (drop `cronSchedule` so it runs on deploy), then switch the service back to `main`.

---

## TODO

Items below are known improvements that have not yet been implemented, along with the reason each is deferred.

### Security & Reliability

- **HTTPS enforcement** — Redirect HTTP → HTTPS at the infrastructure layer. Vercel enforces HTTPS automatically; for Railway/Render add a reverse-proxy rule (e.g. Caddy or the host's built-in redirect setting). Cannot be done in application code alone.

- **Secrets rotation policy** — Document the process for rotating `DATABASE_URL`, `MAPBOX_TOKEN`, and `ANTHROPIC_API_KEY`. Recommended: store secrets in Vercel/Railway secret manager, set calendar reminders for rotation every 90 days. Cannot be implemented in code — requires ops process and team agreement.

### Performance

- **Vector tile serving** — Pre-generate `.mbtiles` with tippecanoe and serve them via `martin` or `pg_tileserv` instead of returning building GeoJSON from the API. This requires running tippecanoe (external CLI tool), deploying a tile server sidecar, and updating the Mapbox source configuration. Deferred because it requires infrastructure changes outside the application codebase.

- **Scheduled refresh** — Handled by `data/refresh.py`, run nightly on Railway cron (04:00 UTC), with Sentry cron monitoring for missed/failed runs. The earlier Celery beat scaffold was unused (empty stub task bodies) and has been removed.

- **Frontend bundle analysis** — Run `ANALYZE=true npm run build` (after adding `@next/bundle-analyzer` to `devDependencies`) to identify large chunks and apply `next/dynamic` imports. This is a one-time developer analysis task, not a code change with a clear outcome until profiling is done.

### UX & Accessibility

- **Keyboard navigation on map markers** — Mapbox GL JS renders markers on a `<canvas>` element, which is inherently not keyboard-navigable. Making individual building dots accessible would require replacing the Mapbox `data-driven circle` layer with HTML overlay markers (`mapboxgl.Marker`) for every visible building — prohibitively expensive at the scale of tens of thousands of buildings in view. A practical alternative would be to make only search-result buildings accessible as overlays, but that is a significant architectural change.

- **Mobile layout** — Already implemented. `page.tsx` renders `BuildingPanel`, `SearchResultsPanel`, and `InfoPanel` as full-width bottom sheets at `< md` breakpoints, and as a right sidebar at `md+`.

- **Building class legend** — Already implemented. The building detail panel shows the full class description (e.g. `D3 — ELEVATOR APT; FIREPROOF WITHOUT STORES`) via `getBuildingClassLabel` in `buildingClasses.ts`.

### Data & Accuracy

- **StreetEasy neighborhood mapping completeness** — The Queens sub-neighborhood slug lookup covers the major neighborhoods mapped from our Voronoi centroid data. Adding the remaining edge neighborhoods (Ozone Park, Maspeth, Woodhaven, etc.) requires verifying each slug against live StreetEasy URLs — this cannot be done reliably without browser access to confirm 200 vs. 404 responses. Deferred until manual verification is possible.
