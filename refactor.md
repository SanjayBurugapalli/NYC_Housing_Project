# Refactor Notes

Concise audit of redundancies, dead code, and complexity worth addressing.

## Dead / Stub Code (delete or finish)

- ~~**Celery is unused.** celery_app.py + tasks.py define a beat schedule with two empty `# TODO` bodies; real scheduling is data/refresh.py via Railway cron. Delete both files; drop `celery`/`redis` from requirements and CLAUDE.md.~~ **Done** — deleted both files; dropped celery + redis from requirements and `redis_url` from config; removed the redis service + commented celery blocks from docker-compose; updated CLAUDE.md/README. (Redis was orphaned — only Celery used it.)
- ~~**`age_maintenance_score` is deprecated but lingers.** writes a hardcoded `0.0`; SELECTed in building_service.py; listed in CLAUDE.md as a 10% weight. Either drop the column via Alembic migration, or revive the metric.~~ **Done (dropped)** — Alembic 006 drops the column; removed from compute.py's upsert, the ORM model, the detail SELECT, and the dead `settings.weight_*` block; CLAUDE.md formula corrected. Verified against the dev DB.
- ~~**`GRADE_MAP` constant is dead.** [building_service.py:67](backend/app/services/building_service.py#L67) — defined but never read; only `score_to_grade()` is used.~~ **Done** — removed.
- ~~**`backend/test_search.py`** is a manual `urllib`-based localhost smoke test sitting outside `tests/`. Move into `tests/manual/` or delete.~~ **Done** — moved to `backend/tests/manual/search_smoke.py` (renamed so pytest won't collect it).
- ~~**`data/listings/` is not wired in.** No imports from `backend/`, `refresh.py`, or any Docker/cron config reference it. ~600 lines of fetcher/store/aggregator/playwright code is either dead or in-progress; mark it clearly.~~ **Done (marked)** — added `data/listings/README.md` + package docstring stating it is not wired in (only the Alembic 003 schema is). Whether to schedule or remove it is still an open decision.

## Triplicated Scoring Weights — User-Facing Inconsistency

Three different weight tables exist:

| Location | HPD | Heat | Pest | Struct | Lit | Noise | Age |
|---|---|---|---|---|---|---|---|
| [compute.py:101](data/scoring/compute.py#L101) (truth) | 20 | 20 | 22 | 20 | 13 | 5 | — |
| [store.ts:14](frontend/src/lib/store.ts#L14) | 20 | 20 | 22 | 20 | 13 | 5 | — |
| [page.tsx:44](frontend/src/app/page.tsx#L44) (landing) | **30** | 20 | **15** | **15** | **12** | **8** | — |
| CLAUDE.md | 20 | 20 | 15 | 20 | 10 | 5 | 10 |

**Frontend single-sourced; cross-language sync still manual.** Landing-page weights corrected (Pest 22, Heat 20, HPD 20, Struct 20, Lit 13, Noise 5) and the frontend now derives both the slider defaults and the landing bars from one `lib/scoringWeights.ts` (`DEFAULT_WEIGHTS` → `SCORING_WEIGHTS`), so they can't drift again. **Still open:** the Python source (`compute.py` WEIGHTS) and the TS source are hand-kept in sync — a shared JSON / generator would close that. (CLAUDE.md's formula table has since been corrected to match — Pest 22 / Litigation 13, no "age" weight.)

## Duplicated Definitions (single-source-of-truth violations)

- ~~**`score_to_grade` defined twice** with identical thresholds: [building_service.py:70](backend/app/services/building_service.py#L70) and [schemas.py:8](backend/app/api/schemas.py#L8). Only the building_service version is imported anywhere. Delete the schemas.py copy.~~ **Done** — schemas.py copy removed.
- ~~**CD → neighborhood name map exists twice with different values.** `CD_NAMES` in compute.py vs `NEIGHBORHOOD_NAMES` in the API.~~ **Obsolete** — `CD_NAMES` no longer exists in compute.py; it now stores the raw CD code (e.g. `"106"`) and the API resolves the display name via `NEIGHBORHOOD_NAMES`/`get_neighborhood_name` at read time. Single source already.
- ~~**Sub-neighborhood centroids duplicated between languages.** `sub_neighborhood_splits.py` (Python, keyed by CD) and `neighborhoodSplits.ts` (TS, keyed by compound name) carry the same lat/lng pairs.~~ **Obsolete** — both files have since been removed and the sub-neighborhood/Voronoi split feature is gone. `sub_neighborhood` survives only as an always-null field on the detail response; the StreetEasy URL builder now derives the Queens neighborhood from `nta_name` instead.
- **Address suffix maps in three places** with overlapping but non-identical entries: [search.py:32-42](backend/app/api/search.py#L32) (`_DIR_CONTRACT`/`_SFX_CONTRACT`), [normalize.py:20-37](data/transform/normalize.py#L20) (`SUFFIX_MAP`), and [streetEasy.ts:6-10](frontend/src/components/building/streetEasy.ts#L6) (`STREET_SUFFIX_EXPANSIONS`). Promote to one shared mapping per side (Python + TS) and keep them in sync via a generator or shared JSON.
- ~~**Grade→color map in 3 spots inside [Map.tsx](frontend/src/components/Map.tsx).** `GRADE_COLORS` at line 13 (unused), then inline `match` expressions at lines 362-370 and 422-430. Use the top-level constant in both paint specs.~~ **Done** — the three inline `match` expressions now use a single `GRADE_COLOR_EXPRESSION` derived from `GRADE_COLORS`.

## search_service.py (1,299 lines) — Largest File in the Repo

- ~~**Negation detection is implemented twice.** Once in `match_concepts` and once in `_extract_complaint_types` with subtly different regexes (`no\s+` vs `no`). Factor into one `_negation_spans(q)` helper.~~ **Done** — unified on a single `_NEGATION_RE` + `_negation_spans()`.
- ~~**`search.py:250` re-checks NaN that was already stripped.** `_sanitize_row` (line 16) already replaced NaN with 0.0, so the inline `isinstance(...float) and math.isnan(...)` on line 250 is redundant. Just call `score_to_grade(b["health_score"])`.~~ **Done** — grade now derived from the sanitized row.
- ~~**Bare `except Exception` returns silent empty results** ([search.py:262](backend/app/api/search.py#L262)). Mask real failures (DB outage, schema drift). At minimum, log the exception.~~ **Done** — `logger.exception(...)` before the fallback response.

## compute.py (583 lines) — Copy-Paste Score Computation

- **5 near-identical sub-score functions.** `compute_complaint_score`, `compute_pest_score`, `compute_structural_score`, `compute_hpd_severity_score`, `compute_litigation_score` all follow: load rows → `time_weight` → groupby/sum → merge → per-unit → `absolute_score`. The only meaningful variation is the SQL and (for HPD) a severity multiplier. Collapse into one helper `_score_from_rows(rows_df, decay_rate, per_unit=True)`.
- ~~**`since = (datetime.now... - timedelta).strftime(...)` repeated 6 times**. Extract `_data_since_iso()` once.~~ **Done** — `_data_since_iso()` helper.
- **`upsert_scores` runs one INSERT per row** ([line 500](data/scoring/compute.py#L500)) inside a transaction. For ~860k buildings this is the slow path. Use `executemany` with a single VALUES batch, or stage to a temp table + single `INSERT … SELECT … ON CONFLICT`.
- ~~**`update_neighborhood_aggregates` builds SQL via f-string interpolation** over `CD_NAMES`. ... Replace with a `VALUES (...) AS m(cd, name)` join.~~ **Obsolete** — the function was rewritten; it now does `INSERT ... SELECT CONCAT(b.neighborhood,'-',b.borough) ... GROUP BY b.neighborhood, b.borough` with no name interpolation, so there is no apostrophe-injection risk.

## Repeated SELECT Block (4 places)

~~The 12-column buildings + composite_score projection is duplicated verbatim in five queries. Either factor into a string constant or create a Postgres view `v_building_summary`.~~ **Done** — extracted `BUILDING_SUMMARY_SELECT` in building_service.py, imported by search.py and search_service.py. (Note: the `building_service.py:165` detail query is a *wider* projection and intentionally left separate.)

## get_building_detail — 9 Sequential Round-trips

[building_service.py:158-389](backend/app/services/building_service.py#L158) awaits 9 independent queries one-after-the-other (complaints, violations, lit count, lit list, rodent, FDNY, evictions, category counts, HPD severity, DOB count). They have no inter-dependencies past the first.

> **Caveat (not safe as written):** a plain `asyncio.gather` over the *same* `AsyncSession` will raise — asyncpg/SQLAlchemy cannot multiplex concurrent operations on one connection ("another operation is in progress"). To parallelize, each concurrent query needs its own connection (e.g. `async with engine.connect()` per query / `asyncio.gather` over separate sessions), which trades latency for connection-pool pressure. Worth doing, but it's a deliberate connection-management change, not a one-line wrap.

~~Also the neighborhood-derivation expression at line 396 is unparseable (mixed `or` + ternary). Unpack into a multi-line `if/else`.~~ **Done** — unpacked into an explicit `if/else` computing `neighborhood_label` before the response dict. (The 9-round-trip `asyncio.gather` optimization above is still open.)

## Map.tsx (588 lines) — Effect Soup

- The "store grade/mapFilters in refs so callbacks don't tear down the map" pattern ([lines 38-41](frontend/src/components/Map.tsx#L38)) is a workaround. Split the one giant `useEffect` (lines 195-497) into: (a) one-time setup, (b) viewport-fetch effect, (c) filter-apply effect — then you can depend on `gradeFilter`/`mapFilters` directly and drop the refs.
- ~~Two `m.on("mouseenter"/"mouseleave"...)` pairs for `buildings-dots` and `search-results-dots` are identical cursor toggles; loop over the layer ids.~~ **Done** — looped over the dot-layer ids.

## BuildingPanel.tsx (729 lines)

- ~~File contains 5 sub-components (Skeleton, FDNYViolationsList, EvictionsList, ViolationsList, ComplaintsList) plus StreetEasy URL builders. Split into `components/building/` directory.~~ **Done** — extracted to `components/building/` (streetEasy.ts + the 5 components); BuildingPanel.tsx dropped from ~738 to ~390 lines. Dead `SkeletonRow` removed.
- ~~Rent-status rendering is a 5-arm `&&` chain ([lines 358-372](frontend/src/components/BuildingPanel.tsx#L358)). Use a `{ [status]: { label, className } }` lookup.~~ **Done** — replaced with the typed `RENT_STATUS_DISPLAY` lookup. (Splitting the file's 5 sub-components into `components/building/` is still open.)

## Minor

- ~~[search_service.py:209](backend/app/services/search_service.py#L209) declares `"east williamsburg"` twice in `NTA_ALIASES` (also at line 155). Harmless but noisy.~~ **Done** — duplicate removed.
- ~~`data/refresh.py:_load_tasks` assumes every puller accepts a `limit=` kwarg. Pullers added later may not; either enforce a `Protocol` or guard with `inspect.signature`.~~ **Done** — `_accepts_limit()` guards via `inspect.signature`; unsupported pullers run unbounded with a warning.
- ~~`MAX_RESULTS = 100` is defined in 3 places ([search.py:29](backend/app/api/search.py#L29), [search_service.py:433](backend/app/services/search_service.py#L433), [claude_search_parser.py SEARCH_TOOL](backend/app/services/claude_search_parser.py#L142)). Centralize.~~ **Done** — single definition in `core/config.py`, imported everywhere.
