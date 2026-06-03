# Listing signals (NOT wired into the running app)

> **Status: in-progress / not integrated.** This package is *not* imported by
> the backend (`backend/app/**`), the scheduled refresh (`data/refresh.py`),
> Docker Compose, or any cron job. Nothing in the deployed system runs it. It
> only executes when invoked manually:
>
> ```bash
> python -m data.listings.cli run            # full job over all NYC tiles
> python -m data.listings.cli --mock run     # synthetic listings, no network
> python -m data.listings.cli tile -74.01 40.72 -73.99 40.74
> ```

## What it is

An experimental pipeline to capture rental-listing signals (price, beds,
availability) from external search sites and attach them to buildings:

- `fetchers/` — per-source fetchers (`zillow`, `streeteasy`, plus a `mock`
  fetcher and a shared Playwright browser base).
- `tiles.py` — splits the city into bbox tiles for iteration.
- `matcher.py` — matches a fetched listing to a building.
- `aggregator.py` — rolls raw listings up into per-building signals.
- `store.py` — upserts into `listings_raw` / `building_listing_signal` /
  `listing_raw_log`.
- `runner.py` / `cli.py` — orchestration and entry point.

## Database

The tables it writes to **do** exist in the schema — Alembic migration
[`003_add_listing_signals`](../../backend/alembic/versions/003_add_listing_signals.py)
creates `listings_raw`, `building_listing_signal`, and `listing_raw_log`. So
the schema half is wired; only the ingestion half is unscheduled.

## Before relying on this

- Decide whether to schedule it (add to `data/refresh.py` + cron) or remove it.
- The real fetchers depend on Playwright and are subject to the target sites'
  terms of service and anti-bot measures; only the `--mock` path is safe to run
  unattended.
