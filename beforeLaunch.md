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

The CORS rework introduced a new env var — **set `ALLOWED_ORIGINS`** on the Railway backend service before redeploying, otherwise the prod frontend will get blocked on every request. Format: comma-separated, e.g. `https://nycbuildings.vercel.app,https://your-custom-domain.com`. The default only allows `http://localhost:3000` so dev keeps working.

---

## Cost protection

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | Anthropic API spending cap | console.anthropic.com → set monthly limit + 50%/80% email alerts. A buggy search loop can burn real money in hours. |
| P0 | 🤖 | ✅ Rate-limit `/api/search` | Already wired (`60/minute`). I also consolidated the per-router `Limiter()` instances onto a shared one in [app/core/rate_limit.py](backend/app/core/rate_limit.py) so the counters and `app.state.limiter` reference the same storage. |
| P0 | 🤖 | ✅ Rate-limit `/api/buildings` | Already wired (`300/minute` viewport, `120/minute` detail). Same shared-limiter cleanup applied. |
| P0 | 👤 | Mapbox usage alert | account.mapbox.com → token settings → set load limit + alert. Free tier is ~50k loads/mo. |
| P0 | 👤 | Railway usage alert | Railway → Settings → Usage → hard limit + email warning. |

## Security

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | Rotate Postgres password | Was visible in a Claude session. Railway → Postgres → Variables → regenerate `POSTGRES_PASSWORD`. Linked services auto-update if you used "Add Reference". |
| P0 | 🤖 | ✅ Restrict CORS to Vercel domain | Replaced wildcard with env-driven allowlist via new `ALLOWED_ORIGINS` setting. **You must set this var in Railway before deploying** — see the critical note at the top. |
| P0 | 👤 | Restrict Mapbox token by URL | Mapbox token → URL restrictions → add `*.vercel.app` and custom domain only. |
| P0 | 🤖 | ✅ Validate AI-search filters server-side | Audited [search_service.py](backend/app/services/search_service.py). `validate_filters()` whitelists borough, clamps numeric ranges, regex-checks building classes, and gates ORDER BY columns through a `_ALLOWED_SORT_COLUMNS` set. All SQL is parameterized. No changes needed. |
| P1 | 👤 | HTTPS enforcement on Railway custom domain | Vercel is automatic. For Railway, verify HTTPS-only is on. |
| P1 | 🤖 | ✅ Audit logs for secret leakage | DB connection failure in `lifespan()` now logs only `type(e).__name__` — `str(e)` from asyncpg can include host:port. No other paths log credentials. |

## Reliability

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | Trigger + verify first cron run | Railway → `refresh-daily` → manual redeploy. Confirm `data_refresh_status` has all ~10 datasets at `success` + `scoring` ran. |
| P0 | 🤝 | Sentry on frontend + backend | I'll wire the SDKs and source maps. You create the Sentry project and provide the DSN. |
| P1 | 👤 | Uptime monitoring on `/health` | UptimeRobot or healthchecks.io. 5-min interval, email alert. Free. |
| P1 | 👤 | Refresh-staleness alert on `/api/refresh-status` | Same tool, daily ping, alert if `any_stale: true`. Catches broken pullers. |
| P2 | 🤖 | ✅ Review backend restart policy | `on_failure` + 3 retries in [railway.toml](railway.toml) is appropriate for this traffic profile. No change. |
| P1 | 👤 | Verify DB backups + document restore | Railway → Postgres → Backups. Add a one-paragraph restore runbook to README. |

## Performance

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 🤖 | ✅ Verify spatial + BBL indexes | Confirmed in migration 001: `idx_buildings_bbl`, GeoAlchemy2 auto-GIST on `buildings.geom` + `geom_footprint`, plus compound indexes on `(borough, building_class)`, `(building_class, composite_score)`, etc. Joins and viewport queries are indexed. |
| P0 | 🤝 | Vector tile pipeline (tippecanoe) | CLAUDE.md explicitly says no GeoJSON from the API for map display. Biggest scale risk. I write the build + serve code; you host the tile output (Mapbox Studio or CDN). |
| P1 | 🤖 | ✅ Tune SQLAlchemy pool size | Bumped from `pool_size=10, max_overflow=5` → `20, 10` in [database.py](backend/app/core/database.py). Confirm Railway Postgres allows ≥30 connections (default plan allows 100). |
| P1 | 🤝 | Load test `/api/buildings` | I write a `k6` script for 100 RPS sustained. You run it against prod (or I run it if you give the go-ahead). |
| P1 | 🤖 | ✅ Verify scoring + nightly refresh | The README mentions a materialized view; reality is `health_scores` is a regular table populated by `compute_all_scores()` and refreshed nightly by the cron service. Functionally equivalent — no code change. (Could document this in CLAUDE.md if you want.) |

## Data quality

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | Spot-check 5 known buildings | Pick addresses you can verify externally (your apt, a friend's, a notorious building). Sanity-check counts + grade. |
| P0 | 🤖 | 🟡 Score distribution sanity check | Blocked on first cron run completing. Ping me after and I'll run `SELECT grade, COUNT(*) GROUP BY` and flag if any grade dominates >70%. |
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

Updated sequence based on what's already done. Items I already shipped are marked ✅:

1. 👤 Set Anthropic spending cap (10 min)
2. 👤 Rotate the prod DB password (10 min)
3. ✅ 🤖 Rate limits, CORS allowlist, pool tuning, log sanitization, attribution, caveats — all merged in this branch. Review the diff before pushing.
4. 👤 **Set `ALLOWED_ORIGINS` in Railway** to your Vercel URL before redeploying the backend (otherwise CORS blocks every frontend request) (5 min)
5. 👤 Trigger today's cron and watch it complete; then ping me for the score sanity query (30 min)
6. 🤝 Add Sentry to frontend + backend (30 min)
7. 👤 UptimeRobot on `/health` + `/api/refresh-status` (15 min)

Everything else is fast-follow unless you're expecting press-level traffic on day one.

## How to use this file

When you're ready to tackle an item, say e.g. *"do the rate-limit item from beforeLaunch.md"* and I'll handle the 🤖 / 🤝 ones. Ping me with the result of the 👤 items so I can update the file as things get done.
