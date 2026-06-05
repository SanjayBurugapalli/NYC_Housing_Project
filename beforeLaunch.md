# Pre-launch checklist

Outstanding work before this goes public. Completed items have been removed — see git history for what already shipped.

**Priority**
- **P0** — launch blocker. Skipping risks data loss, outsized bills, security incident, or a broken UX on day one.
- **P1** — strongly recommended. Skip only if you accept silent rot or fast follow-up.
- **P2** — polish. Defer if launch is time-pressured.

**Owner**
- 🤖 **Claude** — I can implement this in code (PR-ready).
- 👤 **You** — requires a dashboard, an external account, billing, or domain knowledge I don't have.
- 🤝 **Both** — I write the code, you provide credentials/assets/approval.

**Status**
- 🟡 = partially done / in progress
- (no marker) = not started

## Data quality

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 🤝 | 🟡 Apply scoring fixes in prod | Code is done & on `main` (311 BBL join-coverage fix, `units**0.75` per-unit normalization, HPD Class I exclusion). To apply: redeploy the cron off latest `main`, then run the wide re-pull + rescore — `python data/refresh.py --datasets=311_complaints --days-back=1825`. Until then the live site shows the old inflated grades (~78% A); the dev rescore lands at ~65% A with a real D/F tail. |

## Cost protection

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 👤 | 🟡 Mapbox usage alert | Deferred — the in-dashboard notification UI doesn't surface for free-tier accounts with no charges yet. Revisit once first charges appear, or wire programmatic monitoring via UptimeRobot against the Mapbox Statistics API. (URL restriction is the more important protection and is done.) |

## Security

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | HTTPS enforcement on Railway custom domain | Vercel is automatic. For Railway, verify HTTPS-only is on. |

## Reliability

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | Uptime monitoring on `/health` | UptimeRobot or healthchecks.io. 5-min interval, email alert. Free. |
| P1 | 👤 | Refresh-staleness alert on `/api/refresh-status` | Same tool, daily ping, alert if `any_stale: true`. Catches broken pullers. |
| P1 | 👤 | Verify DB backups + document restore | Railway → Postgres → Backups. Add a one-paragraph restore runbook to README. |

## Performance

| P | Owner | Item | Notes |
|---|---|---|---|
| P0 | 🤝 | 🟡 Vector tile pipeline | **Built** ([tiles/generate.sh](tiles/generate.sh) + [data/publish_tiles.py](data/publish_tiles.py); the nightly refresh regenerates + uploads PMTiles to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set). **Remaining:** set `BLOB_READ_WRITE_TOKEN` on the cron, set `NEXT_PUBLIC_TILES_URL` on Vercel, and verify the high-zoom dots actually stream from PMTiles — the `Map.tsx` vector path is UNVERIFIED until a reachable tiles URL exists. |
| P1 | 🤝 | Load test `/api/buildings` | k6 script exists ([load_test/buildings_viewport.js](load_test/buildings_viewport.js)). Run it against prod for ~100 RPS sustained — but **not while a refresh/rescore is running** (it competes for the DB). |

## UX / launch polish

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | Mobile responsiveness on real device | iOS Safari + Android Chrome. DevTools emulation misses real touch + viewport quirks. |
| P2 | 🤝 | Favicon / app icon | OG + Twitter share images exist ([opengraph-image.tsx](frontend/src/app/opengraph-image.tsx), [twitter-image.tsx](frontend/src/app/twitter-image.tsx)); no app icon under `app/`. I can wire a metadata icon to the existing `logo-mark.svg`. |

## Legal / attribution

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 🤝 | Privacy policy | A `/privacy` page exists — confirm it covers the IP/UA hashes + emails collected by the `analytics_events` and `feedback` tables, then have it reviewed (or run by a lawyer). |

---

## Suggested launch order

1. 🟡 🤝 **Apply scoring fixes in prod** — redeploy the cron off latest `main`, then the wide 311 re-pull + rescore (`--days-back=1825`). Puts the calibration + HPD/normalization changes live; until it runs, prod shows the old inflated grades.
2. 👤 UptimeRobot on `/health` + `/api/refresh-status` (15 min).
3. 👤 Switch cron `DATABASE_URL` to `${{Postgres.DATABASE_PRIVATE_URL}}` (5 min in the Railway dashboard — speeds up the rescore significantly).
4. 🟡 🤝 Vector tile pipeline — set `BLOB_READ_WRITE_TOKEN` (cron) + `NEXT_PUBLIC_TILES_URL` (Vercel) and verify dots stream from PMTiles. Biggest scale risk; deferrable until real traffic.

Everything else above is fast-follow unless you're expecting press-level traffic on day one.

## How to use this file

When you're ready to tackle an item, say e.g. *"do the load-test item from beforeLaunch.md"* and I'll handle the 🤖 / 🤝 ones. Ping me with the result of the 👤 items so I can keep this file trimmed as things ship.
