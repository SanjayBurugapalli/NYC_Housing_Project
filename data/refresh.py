"""Orchestrate ingestion + scoring with status tracking.

Each registered task runs in sequence, writes its start/end state to the
`data_refresh_status` table, and records the row count it produced. A failure
in one task does not abort the rest — the next task still runs and the failure
is surfaced via `last_status='fail'` plus `error_message` on that row.

Usage:
    python data/refresh.py                              # run every registered task
    python data/refresh.py --datasets=rodent            # run a subset
    python data/refresh.py --skip-scoring               # ingest only (no compute.py)
    python data/refresh.py --datasets=rodent --limit=50 # fast smoke test
"""

import argparse
import inspect
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import sentry_sdk
from sentry_sdk.crons import capture_checkin

# Initialize Sentry first so import-time failures in the puller modules are captured.
# DSN unset (e.g. local dev) → SDK is a no-op.
_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        release=os.environ.get("RAILWAY_GIT_COMMIT_SHA"),
        traces_sample_rate=0.0,  # batch jobs don't benefit from request tracing
        send_default_pii=False,
    )
    sentry_sdk.set_tag("service", "cron-refresh")

# Sentry Cron Monitoring: the nightly run checks in at start + finish so Sentry
# alerts if a scheduled run is missed entirely OR finishes with failures —
# closing the "cron silently didn't run / didn't complete" gap that error
# capture alone can't see (a job that never fires raises no exception). The
# schedule mirrors the Railway cron service (04:00 UTC daily).
_MONITOR_SLUG = "daily-refresh"
_MONITOR_CONFIG = {
    "schedule": {"type": "crontab", "value": "0 4 * * *"},
    "timezone": "UTC",
    "checkin_margin": 60,   # minutes a start may be late before it's "missed"
    "max_runtime": 480,     # minutes before a still-running job is flagged timed out
}

from sqlalchemy import text

# Make `data.ingest.*` importable when running as `python -m data.refresh`.
sys.path.insert(0, str(Path(__file__).resolve().parent / "ingest"))
from base import get_db_engine  # noqa: E402

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


# Each entry: dataset key (also row PK), human description, callable returning row count.
# Lazy-imported inside _load_tasks so a broken puller doesn't kill the whole orchestrator.
TASK_DEFINITIONS: list[tuple[str, str, str, str]] = [
    # (dataset_key, module, function_name, description)
    ("311_complaints",   "pull_311",          "pull_311",              "311 service requests"),
    ("hpd_violations",   "pull_hpd",          "pull_hpd_violations",   "HPD violations"),
    ("hpd_complaints",   "pull_hpd",          "pull_hpd_complaints",   "HPD complaints"),
    ("dob_violations",   "pull_dob",          "pull_dob_violations",   "DOB violations"),
    ("dob_complaints",   "pull_dob",          "pull_dob_complaints",   "DOB complaints"),
    ("litigations",      "pull_litigations",  "pull_litigations",      "Housing litigations"),
    ("rodent",           "pull_rodent",       "pull_rodent_inspections", "Rodent inspections"),
    ("evictions",        "pull_evictions",    "pull_evictions",        "Marshal evictions"),
    ("registrations",    "pull_registration", "pull_registrations",    "HPD owner registrations"),
    ("pluto",            "pull_pluto",        "pull_pluto",            "PLUTO building universe"),
]


def _accepts_limit(fn: Callable) -> bool:
    """True if `fn` can be called with a `limit=` kwarg (named param or **kwargs)."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return True
    return "limit" in params


def _load_tasks(
    filter_keys: set[str] | None, limit: int | None = None,
) -> list[tuple[str, str, Callable[[], int]]]:
    """Resolve task callables, optionally filtered by a set of dataset keys.

    `limit`, if set, is forwarded as the `limit` kwarg to each puller that
    accepts one; pullers without a `limit` parameter run unbounded (with a
    warning) rather than raising. Useful for smoke tests and previews.
    """
    tasks: list[tuple[str, str, Callable[[], int]]] = []
    for key, module_name, fn_name, description in TASK_DEFINITIONS:
        if filter_keys is not None and key not in filter_keys:
            continue
        module = __import__(module_name)
        fn = getattr(module, fn_name)
        if limit is not None and _accepts_limit(fn):
            bound: Callable[[], int] = lambda f=fn, l=limit: f(limit=l)
        else:
            if limit is not None:
                logger.warning(
                    "Puller %s does not accept limit=; running unbounded", fn_name
                )
            bound = fn
        tasks.append((key, description, bound))
    return tasks


def _set_running(engine, dataset: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO data_refresh_status (
                    dataset, last_started_at, last_status, updated_at
                ) VALUES (:dataset, NOW(), 'running', NOW())
                ON CONFLICT (dataset) DO UPDATE SET
                    last_started_at = EXCLUDED.last_started_at,
                    last_status = 'running',
                    error_message = NULL,
                    updated_at = NOW()
            """),
            {"dataset": dataset},
        )


def _set_finished(
    engine, dataset: str, status: str, rows_changed: int | None,
    duration_seconds: int, error_message: str | None,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE data_refresh_status SET
                    last_completed_at = NOW(),
                    last_status = :status,
                    rows_changed = :rows_changed,
                    duration_seconds = :duration_seconds,
                    error_message = :error_message,
                    updated_at = NOW()
                WHERE dataset = :dataset
            """),
            {
                "dataset": dataset,
                "status": status,
                "rows_changed": rows_changed,
                "duration_seconds": duration_seconds,
                "error_message": error_message,
            },
        )


def _run_task(engine, dataset: str, description: str, fn: Callable[[], int]) -> bool:
    """Execute one task end-to-end. Returns True on success."""
    logger.info("Starting refresh: %s (%s)", dataset, description)
    _set_running(engine, dataset)
    started = time.monotonic()
    try:
        rows = fn()
        duration = int(time.monotonic() - started)
        _set_finished(engine, dataset, "success", rows, duration, None)
        logger.info("Finished %s in %ds (%s rows)", dataset, duration, rows)
        return True
    except Exception as exc:
        duration = int(time.monotonic() - started)
        message = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
        _set_finished(engine, dataset, "fail", None, duration, message[:4000])
        logger.exception("Failed %s after %ds", dataset, duration)
        # Surface the failure as a tagged Sentry event so an alert fires per dataset,
        # not just once per cron run. set_tag scopes the tag to this capture only.
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("dataset", dataset)
            scope.set_tag("duration_seconds", str(duration))
            sentry_sdk.capture_exception(exc)
        return False


def run(
    filter_keys: set[str] | None = None,
    skip_scoring: bool = False,
    limit: int | None = None,
) -> int:
    """Run all (or filtered) refresh tasks. Returns count of failed tasks."""
    engine = get_db_engine()
    tasks = _load_tasks(filter_keys, limit=limit)
    if not tasks:
        logger.warning("No tasks matched filter; nothing to do.")
        return 0

    failures = 0
    overall_start = datetime.now(timezone.utc)
    logger.info("Refresh run started at %s; %d tasks queued", overall_start.isoformat(), len(tasks))
    for key, description, fn in tasks:
        ok = _run_task(engine, key, description, fn)
        if not ok:
            failures += 1

    if skip_scoring:
        logger.info("Skipping scoring step.")
    else:
        logger.info("All ingest tasks done; running scoring.")
        sys.path.insert(0, str(Path(__file__).resolve().parent / "scoring"))
        from compute import compute_all_scores  # noqa: E402

        def _scoring_wrapper() -> int:
            compute_all_scores()
            # compute_all_scores doesn't return a count; report 0 so we still record duration/status.
            return 0

        _run_task(engine, "scoring", "Health score computation", _scoring_wrapper)

    logger.info(
        "Refresh complete. failures=%d total_tasks=%d",
        failures, len(tasks) + (0 if skip_scoring else 1),
    )
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh NYC Open Data + recompute scores.")
    parser.add_argument(
        "--datasets",
        type=str,
        default=None,
        help="Comma-separated dataset keys to run (default: all). "
             f"Available: {','.join(k for k, *_ in TASK_DEFINITIONS)}",
    )
    parser.add_argument(
        "--skip-scoring",
        action="store_true",
        help="Skip the scoring step (faster smoke tests).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap each puller at this many rows. Smoke-test only — leave unset in production.",
    )
    args = parser.parse_args()

    _check_env_or_exit()

    filter_keys: set[str] | None = None
    if args.datasets:
        filter_keys = {k.strip() for k in args.datasets.split(",") if k.strip()}

    # Only check in for the full nightly run — targeted smoke tests
    # (--datasets / --limit / --skip-scoring) must not mark the monitor.
    is_full_run = filter_keys is None and args.limit is None and not args.skip_scoring
    check_in_id = None
    if _sentry_dsn and is_full_run:
        check_in_id = capture_checkin(
            monitor_slug=_MONITOR_SLUG,
            status="in_progress",
            monitor_config=_MONITOR_CONFIG,
        )

    try:
        failures = run(filter_keys, skip_scoring=args.skip_scoring, limit=args.limit)
    except Exception:
        if check_in_id is not None:
            capture_checkin(monitor_slug=_MONITOR_SLUG, check_in_id=check_in_id, status="error")
            sentry_sdk.flush(timeout=5)
        raise

    if check_in_id is not None:
        capture_checkin(
            monitor_slug=_MONITOR_SLUG,
            check_in_id=check_in_id,
            status="ok" if failures == 0 else "error",
        )
        sentry_sdk.flush(timeout=5)

    sys.exit(1 if failures > 0 else 0)


def _check_env_or_exit() -> None:
    """Verify required env vars before attempting any DB or Socrata work.

    Logs the *host* (never credentials) of the resolved DB URL so a Railway
    operator can confirm at a glance that the cron container is pointing at
    the prod Postgres and not the local default.
    """
    db_url = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error(
            "Neither DATABASE_URL_SYNC nor DATABASE_URL is set — refusing to fall "
            "back to the dev default (localhost:5432). Set DATABASE_URL on this "
            "service in the Railway dashboard."
        )
        sys.exit(2)

    try:
        host = urlparse(db_url.replace("+asyncpg", "")).hostname or "<unknown>"
    except Exception:
        host = "<unparseable>"
    logger.info("DB target host: %s", host)

    if not os.environ.get("SOCRATA_APP_TOKEN"):
        logger.warning(
            "SOCRATA_APP_TOKEN is not set — Socrata will throttle anonymous "
            "requests aggressively and large pullers will likely time out."
        )


if __name__ == "__main__":
    main()
