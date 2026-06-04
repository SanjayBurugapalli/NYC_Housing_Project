# BeforeYouRent

## Project Overview
BeforeYouRent is a full-stack application that analyzes NYC residential buildings using public data and assigns each one a composite "health score" (0-100) based on complaints, violations, and inspections. Features an interactive map UI and AI-powered natural language search.

## Tech Stack
- **Frontend:** Next.js (TypeScript), Mapbox GL JS, Tailwind CSS, shadcn/ui, React Query, Zustand
- **Backend:** FastAPI (Python), PostgreSQL + PostGIS, SQLAlchemy/asyncpg
- **Data Pipeline:** sodapy (Socrata client), pandas/polars; scheduled refresh via `data/refresh.py` (Railway cron)
- **AI Search:** Claude API with tool-use pattern (natural language → structured DB query)
- **Geospatial Tooling:** tippecanoe (vector tiles), GDAL/ogr2ogr, GeoAlchemy2
- **Infra:** Docker Compose for local dev, Vercel (frontend), Railway or Render (backend)

## Project Structure
```
before-you-rent/
├── frontend/              # Next.js app
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components (map, search bar, building panel, etc.)
│   │   ├── hooks/         # Custom hooks (useMapViewport, useBuildingSearch, etc.)
│   │   ├── lib/           # API client, utils
│   │   └── types/         # TypeScript types
│   └── public/
├── backend/               # FastAPI app
│   ├── app/
│   │   ├── api/           # Route handlers
│   │   ├── models/        # SQLAlchemy models
│   │   ├── services/      # Business logic (scoring, AI search, data ingestion)
│   │   ├── core/          # Config, database connection
│   │   └── main.py        # FastAPI app entry point
│   └── alembic/           # DB migrations
├── data/                  # Data pipeline scripts
│   ├── ingest/            # Scripts to pull from NYC Open Data
│   ├── transform/         # Cleaning, normalization, joining
│   └── scoring/           # Health score computation
├── tiles/                 # Vector tile generation (tippecanoe configs)
├── docker-compose.yml
└── CLAUDE.md
```

## Key Domain Concepts

### Building Identifiers
- **BBL (Borough-Block-Lot):** 10-digit identifier for every tax lot in NYC. This is the PRIMARY join key across datasets. Format: 1 digit borough + 5 digit block + 4 digit lot.
- **BIN (Building Identification Number):** 7-digit identifier for individual buildings. One BBL can have multiple BINs (multiple buildings on one lot).
- Always prefer BBL for joins. Fall back to address matching (with normalization) only when BBL is unavailable.

### NYC Data Sources (all via Socrata API)
| Dataset | Socrata Endpoint | Join Key | Notes |
|---------|-----------------|----------|-------|
| PLUTO (building universe) | `64uk-42ks` | BBL | Master dataset — defines our building list |
| 311 Complaints | `erm2-nwe9` | Address (needs normalization) | 30M+ rows, use incremental sync |
| HPD Violations | `wvxf-dwi5` | BBL | Class A/B/C severity levels |
| HPD Complaints | `uwyv-629c` | BBL | Tenant complaints |
| DOB Violations | `3h2n-5cm9` | BIN | Dept of Buildings |
| DOB Complaints | `eabe-havv` | BIN | Building complaints |
| Housing Litigations | `59kj-x8nc` | BBL | Lawsuits against landlords |
| Rodent Inspections | `p937-wjvj` | Address | Rat inspections |
| MapPLUTO Shapefiles | NYC DCP download | BBL | Building footprint geometries |

### Health Score Formula
Composite score 0-100 (higher = healthier). Weighted sub-scores:
- Heat/hot water complaints (311 + HPD): 20%
- Pest/rodent (311 + rodent inspections): 15%
- Structural/safety violations (DOB): 20%
- HPD violation severity (Class A/B/C): 20%
- Noise complaints (311): 5%
- Litigation history (HPD): 10%
- Building age & maintenance (PLUTO + DOB): 10%

**Important scoring rules:**
- Normalize all complaint counts PER RESIDENTIAL UNIT (a 200-unit building naturally gets more complaints)
- Apply time decay — recent complaints (last 12 months) weigh 3x vs older ones
- Use percentile ranking within building class (compare rentals to rentals, co-ops to co-ops)
- Store as a PostgreSQL materialized view, refresh nightly

## API Design

### Core Endpoints
- `GET /api/buildings?bbox={west,south,east,north}&zoom={z}` — returns buildings visible in map viewport. At low zoom return neighborhood aggregates, at high zoom return individual buildings.
- `GET /api/buildings/{bbl}` — full detail for one building (score breakdown, complaint history, violations timeline)
- `POST /api/search` — AI-powered natural language search. Sends user query to Claude API with tool-use, executes resulting structured query against DB, returns matching buildings.
- `GET /api/neighborhoods` — pre-computed neighborhood-level aggregate scores

### Performance Requirements
- Viewport queries must respond in <200ms (use PostGIS spatial indexes, GIST on geometry columns)
- Building detail queries must respond in <100ms (index on BBL)
- Pre-generate vector tiles with tippecanoe for map rendering — do NOT send GeoJSON from the API for map display

## Map Behavior
- **Low zoom (city-wide):** Neighborhood-level heatmap of average health scores
- **Medium zoom (neighborhood):** Individual building dots, color-coded green (healthy) → red (unhealthy)
- **High zoom (street-level):** Building footprint polygons with score overlay
- Clicking a building opens a detail side panel
- AI search results highlight matching buildings and fly the camera to them

## AI Search (Claude Tool-Use Pattern)
The search endpoint sends the user's natural language query to Claude with a `search_buildings` tool definition. Claude translates the query into structured filters (neighborhood, borough, score range, complaint types, unit count, year built, etc.). The backend validates and executes the resulting query against PostGIS. Results are returned to the frontend for display on the map.

**Guardrails:**
- Always LIMIT results to 100 max
- Validate all Claude-generated filter values before executing queries
- Cache frequent query patterns
- If Claude's query is too vague, return a clarification prompt to the user

## Commands

### Local Development
```bash
docker-compose up                    # Start Postgres, Redis, backend, frontend
cd backend && uvicorn app.main:app --reload  # Backend dev server
cd frontend && npm run dev           # Frontend dev server
```

### Data Pipeline
```bash
python data/ingest/pull_pluto.py     # Pull PLUTO dataset
python data/ingest/pull_311.py       # Pull 311 complaints (incremental)
python data/ingest/pull_hpd.py       # Pull HPD violations/complaints
python data/transform/normalize.py   # Address normalization + BBL joining
python data/scoring/compute.py       # Recompute health scores
```

### Tile Generation
```bash
ogr2ogr -f GeoJSON buildings.geojson PG:"dbname=nyc_buildings" -sql "SELECT * FROM buildings_with_scores"
tippecanoe -o tiles/buildings.mbtiles -z 16 -Z 10 --drop-densest-as-needed buildings.geojson
```

### Database Migrations
```bash
cd backend && alembic upgrade head   # Run migrations
cd backend && alembic revision --autogenerate -m "description"  # Create migration
```

## Code Conventions
- Python: Use type hints everywhere, async endpoints in FastAPI, pydantic models for request/response validation
- TypeScript: Strict mode, prefer named exports, colocate component types in same file
- SQL: Use parameterized queries only — never string interpolation (SQL injection risk)
- All spatial data stored as EPSG:4326 (WGS84 lat/lng) in PostGIS
- Environment variables for all secrets and config (database URL, API keys, Mapbox token, Anthropic key)
- Never commit .env files
