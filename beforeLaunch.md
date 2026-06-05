# Pre-launch checklist

Track everything that needs to happen before this goes public. Check items off as they ship.

**Priority**
- **P0** — launch blocker. Skipping risks data loss, outsized bills, security incident, or a broken UX on day one.
- **P1** — strongly recommended. Skip only if you accept silent rot or fast follow-up.
- **P2** — polish. Defer if launch is time-pressured.

**Owner**
- 🤖 **Claude** — I can implement this in code (PR-ready).
- 👤 **You** — requires a dashboard, an external account, billing, or domain knowledge I don't have.
- 🤝 **Both** — I write the code, you provide credentials/assets/approval.

**Status**
- ✅ = done (changes already in this branch — review before pushing)
- 🟡 = partially done / blocked on data
- (no marker) = not started

## Critical action required before deploying backend

~~The CORS rework introduced a new env var — **set `ALLOWED_ORIGINS`** on the Railway backend service before redeploying, otherwise the prod frontend will get blocked on every request.~~ ✅ Set in production on the backend service. Frontend now loads buildings and bubbles correctly.

---

## Cost protection

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 🤖 | ✅ Rate-limit `/api/search` | Already wired (`60/minute`). I also consolidated the per-router `Limiter()` instances onto a shared one in [app/core/rate_limit.py](backend/app/core/rate_limit.py) so the counters and `app.state.limiter` reference the same storage. |
| P0 | 🤖 | ✅ Rate-limit `/api/buildings` | Already wired (`300/minute` viewport, `120/minute` detail). Same shared-limiter cleanup applied. |
| P0 | 👤 | 🟡 Mapbox usage alert | Deferred — the in-dashboard notification UI doesn't surface for free-tier accounts with no charges yet. Revisit once first charges appear, or wire programmatic monitoring via UptimeRobot against the Mapbox Statistics API. URL restriction (Security row below) is the more important protection and is done. |

## Security

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | ✅ Rotate Postgres password | Rotated; linked services picked up the new value automatically via `${{Postgres.DATABASE_URL}}` references. |
| P0 | 🤖 | ✅ Restrict CORS to Vercel domain | Replaced wildcard with env-driven allowlist via new `ALLOWED_ORIGINS` setting. Var is now set in production. |
| P0 | 👤 | ✅ Restrict Mapbox token by URL | Token now restricted to Vercel + custom domain. |
| P0 | 🤖 | ✅ Validate AI-search filters server-side | Audited [search_service.py](backend/app/services/search_service.py). `validate_filters()` whitelists borough, clamps numeric ranges, regex-checks building classes, and gates ORDER BY columns through a `_ALLOWED_SORT_COLUMNS` set. All SQL is parameterized. No changes needed. |
| P1 | 👤 | HTTPS enforcement on Railway custom domain | Vercel is automatic. For Railway, verify HTTPS-only is on. |
| P1 | 🤖 | ✅ Audit logs for secret leakage | DB connection failure in `lifespan()` now logs only `type(e).__name__` — `str(e)` from asyncpg can include host:port. No other paths log credentials. |

## Reliability

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | ✅ Trigger + verify first cron run | Confirmed complete — all datasets ran and scoring populated `health_scores`. |
| P0 | 🤝 | ✅ Sentry on frontend + backend | SDKs + source maps wired across frontend, backend, and the cron orchestrator (with cron check-ins); React render errors surfaced. |
| P1 | 👤 | Uptime monitoring on `/health` | UptimeRobot or healthchecks.io. 5-min interval, email alert. Free. |
| P1 | 👤 | Refresh-staleness alert on `/api/refresh-status` | Same tool, daily ping, alert if `any_stale: true`. Catches broken pullers. |
| P2 | 🤖 | ✅ Review backend restart policy | `on_failure` + 3 retries in [railway.toml](railway.toml) is appropriate for this traffic profile. No change. |
| P1 | 👤 | Verify DB backups + document restore | Railway → Postgres → Backups. Add a one-paragraph restore runbook to README. |

## Performance

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 🤖 | ✅ Verify spatial + BBL indexes | Confirmed in migration 001: `idx_buildings_bbl`, GeoAlchemy2 auto-GIST on `buildings.geom` + `geom_footprint`, plus compound indexes on `(borough, building_class)`, `(building_class, composite_score)`, etc. Joins and viewport queries are indexed. |
| P0 | 🤝 | 🟡 Vector tile pipeline (tippecanoe) | **Built.** [tiles/generate.sh](tiles/generate.sh) + [data/publish_tiles.py](data/publish_tiles.py) generate PMTiles and the nightly refresh regenerates + uploads them to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set. **Remaining:** set `BLOB_READ_WRITE_TOKEN` on the cron service, set `NEXT_PUBLIC_TILES_URL` on Vercel, and verify the high-zoom dots actually stream from PMTiles — the `Map.tsx` vector path is still flagged UNVERIFIED until a reachable tiles URL exists. |
| P1 | 🤖 | ✅ Tune SQLAlchemy pool size | Bumped from `pool_size=10, max_overflow=5` → `20, 10` in [database.py](backend/app/core/database.py). Confirm Railway Postgres allows ≥30 connections (default plan allows 100). |
| P1 | 🤝 | Load test `/api/buildings` | I write a `k6` script for 100 RPS sustained. You run it against prod (or I run it if you give the go-ahead). |
| P1 | 🤖 | ✅ Verify scoring + nightly refresh | The README mentions a materialized view; reality is `health_scores` is a regular table populated by `compute_all_scores()` and refreshed nightly by the cron service. Functionally equivalent — no code change. (Could document this in CLAUDE.md if you want.) |

## Data quality

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | ✅ Spot-check 5 known buildings | Done — verified externally against the live UI. |
| P0 | 🤖 | ⚠️ Score distribution sanity check | **Flagged.** Excluding 1–2 family homes: **A 78.4%**, B 12.3%, C 6.6%, D 2.2%, F 0.5%; median 99.5, 39% score exactly 100, 35% have neither a complaint nor a violation. Root cause found — see join-coverage audit below. |
| P0 | 🤖 | ✅ Join-coverage audit + fix | **Root cause found & fixed.** `pull_311.py` never selected the source `bbl` field, so ~49% of complaints had no BBL and were dropped from scoring (which joins on BBL). Fix: select + normalize + persist `bbl` (commit 9747827). Verified locally with a 5-year re-pull + rescore: **complaint linkage 50.6% → 95.7%** (1.79M → 5.97M linked), and grade A dropped **78.4% → 71.3%** (B/C/D/F all rose, F nearly doubled). Effect is real but partial because of the 5-yr time-decay curve. Separately, 13% of `violations` reference BBLs outside the residential universe (expected — non-residential lots). **Apply in prod:** re-pull 311 with a wide `days_back` (default refresh only covers 365 days) + rerun scoring. |
| P1 | 🤖 | ✅ Score-curve recalibration | Implemented Option 2 (sqrt(units) per-unit normalization, so large buildings aren't auto-forgiven) + Option 3 (steeper `DECAY_RATES`). Local rescore: **A 71.3% → 49.4%**, B 16.1% → 25.2%, C 8.3% → 12.3%, D 3.3% → 6.6%, F 0.9% → 6.4% — a real spread, no overshoot. Decay rates are tunable if a more/less selective A is wanted. **Update (2026-06-04):** per product feedback that big buildings were over-penalized, softened the per-unit divisor from `sqrt(units)` to `units**0.75` (between linear and sqrt) and excluded HPD Class I (administrative) violations from severity scoring + counts. Latest dev rescore: multi-family **A 64.9% / B 15.7% / C 10.2% / D 5.7% / F 3.6%** (more lenient than the 49% A above — re-tighten the exponent/decay if a more selective A is wanted). **Apply in prod:** rerun scoring after the 311 re-pull. |
| P1 | 🤖 | ✅ Confirm per-unit normalization in scoring | Verified in [compute.py](data/scoring/compute.py): all per-building scoring functions divide `weighted_count / residential_units` (lines 270, 319, 363, 397). Litigation is intentionally per-building. `residential_units` clipped to ≥1 to avoid divide-by-zero. |

## UX / launch polish

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | Mobile responsiveness on real device | iOS Safari + Android Chrome. DevTools emulation misses real touch + viewport quirks. |
| P1 | 🤖 | ✅ Empty / loading / error states audit | Verified the major flows already handle every state: [BuildingPanel](frontend/src/components/BuildingPanel.tsx) has a full skeleton + error+retry block; [SearchBar](frontend/src/components/SearchBar.tsx) has spinner, loading bar, error toast with auto-clear, and a helpful empty-results clarification. No changes needed. |
| P2 | 🤝 | Favicon + OG share image | I wire the `<head>` tags. You provide the image assets (or approve AI-generated ones). |
| P2 | 🤖 | ✅ About page data caveats | Added a new "Limitations" section to [page.tsx](frontend/src/app/page.tsx) (with nav + footer link) and a compact caveats block to the InfoPanel About tab. Covers reporting bias, data lag, heuristic-not-verdict, and no-warranty. |

## Legal / attribution

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 🤖 | ✅ NYC Open Data attribution on About page | Footer text now links to opendata.cityofnewyork.us, and the InfoPanel About tab has the same link inline. |
| P1 | 🤝 | Privacy policy | `analytics_events` and `feedback` tables collect IP/UA hashes + emails. I draft a one-pager; you review or run by a lawyer. |
| P2 | 🤖 | ✅ Source code link in footer | "Source" link added to footer pointing to github.com/SanjayBurugapalli/NYC_Housing_Project. (BuildingPanel already had a "Report incorrect data" GitHub issues link.) |

---

## Suggested launch order

Updated sequence based on what's already done. Items already shipped are marked ✅, in-flight items 🟡:

1. ✅ 👤 Anthropic API spending cap
2. ✅ 👤 Railway hard usage limit
3. ✅ 👤 Rotated prod DB password
4. ✅ 🤖 Rate limits, CORS allowlist, pool tuning, log sanitization, attribution, caveats — all merged.
5. ✅ 👤 `ALLOWED_ORIGINS` set on Railway backend, frontend loads correctly.
6. ✅ 👤 Mapbox token URL-restricted.
7. ✅ 👤 First cron run complete.
8. ✅ 🤝 Sentry on frontend + backend + cron.
9. ✅ 👤 Spot-check 5 known buildings against the live UI.
10. ✅ 🤖 Score-distribution calibration — done in code: per-unit normalization + decay tuning, later softened to `units**0.75`, plus the 311 join-coverage fix and HPD Class I exclusion. Multi-family now ~65% A with a real D/F tail.
11. **Next: 🤝 Apply the scoring fixes in prod** — re-pull 311 with a wide `days_back` (the join-coverage fix; the default refresh only covers 365 days), then rerun scoring on Railway. This is what puts the calibration + the new HPD/normalization changes on the live site; until it runs, prod still shows the old inflated grades. Requires the cron service to be redeployed with the latest `main` first.
12. 👤 UptimeRobot on `/health` + `/api/refresh-status` (15 min).
13. 👤 Switch cron `DATABASE_URL` to `${{Postgres.DATABASE_PRIVATE_URL}}` (5 min in the Railway dashboard — speeds up future runs significantly).
14. 🟡 🤝 Vector tile pipeline — built (`generate.sh` + `publish_tiles.py` + nightly upload); set `BLOB_READ_WRITE_TOKEN` (cron) + `NEXT_PUBLIC_TILES_URL` (Vercel) and verify dots stream from PMTiles. Biggest scale risk; deferrable until real traffic.

Everything else is fast-follow unless you're expecting press-level traffic on day one.

## How to use this file

When you're ready to tackle an item, say e.g. *"do the rate-limit item from beforeLaunch.md"* and I'll handle the 🤖 / 🤝 ones. Ping me with the result of the 👤 items so I can update the file as things get done.
