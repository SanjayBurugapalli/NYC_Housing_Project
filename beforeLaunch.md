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

## Cost protection

## Security

## Reliability

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | Refresh-staleness alert on `/api/refresh-status` | Same tool, daily ping, alert if `any_stale: true`. Catches broken pullers. |
| P1 | 👤 | Verify DB backups + document restore | Railway → Postgres → Backups. Add a one-paragraph restore runbook to README. |

## Performance

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 🤝 | Load test `/api/buildings` | k6 script exists ([load_test/buildings_viewport.js](load_test/buildings_viewport.js)). Run it against prod for ~100 RPS sustained — but **not while a refresh/rescore is running** (it competes for the DB). |

## UX / launch polish

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 👤 | Mobile responsiveness on real device | iOS Safari + Android Chrome. DevTools emulation misses real touch + viewport quirks. |

## Legal / attribution

| P | Owner | Item | Notes |
|---|---|---|---|
| P1 | 🤝 | Privacy policy | A `/privacy` page exists — confirm it covers the IP/UA hashes + emails collected by the `analytics_events` and `feedback` tables, then have it reviewed (or run by a lawyer). |

## How to use this file

When you're ready to tackle an item, say e.g. *"do the load-test item from beforeLaunch.md"* and I'll handle the 🤖 / 🤝 ones. Ping me with the result of the 👤 items so I can keep this file trimmed as things ship.
