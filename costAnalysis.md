# Cost Analysis — what drives cost and how to contain it

A walk through the things that cost money (or will, at scale) for BeforeYouRent,
what already mitigates each, and what to do next. Ordered roughly by how quickly
each can bite as traffic grows. Effort tags: **S** (hours) · **M** (a day or two)
· **L** (larger).

---

## 1. Claude API calls (search) — the most elastic cost

Every natural-language search currently calls Claude Haiku
(`claude_search_parser.py`) *first*, before the deterministic rule-based parser.
This is the cost line that scales directly with traffic and is the easiest to
run up via bots or a viral moment.

**Already mitigating it:**
- BBL and address lookups short-circuit *before* Claude (`search.py` →
  `BBL_PATTERN` / `looks_like_address`). The most common single-building search
  never hits the API.
- 60-second in-memory TTL cache on NL results (`_SEARCH_CACHE`).
- System prompt + tool schema marked `cache_control: ephemeral` → prompt
  caching once the prefix is warm.
- Haiku (cheapest tier), `max_tokens=1024`, `tool_choice` forced (one tool call,
  no rambling).
- Rate limit: 60 searches/min/IP.

**✅ Done — parser order flipped:** the **rule-based parser now runs first**
(`search_buildings_ai` in `search_service.py`), and Claude is only consulted when
the rule-based pass extracts no entity filter at all. The rule-based parser
handles boroughs, neighborhoods, complaint types, and score/size/year/class/owner
intent — a large share of real queries — at **zero** marginal cost, so
well-formed searches like "worst buildings in Brooklyn" no longer incur an API
call. Only genuinely ambiguous queries escalate.

**Other levers:**
- Lengthen the cache TTL (60 s → 10–30 min; the data only changes nightly) and
  raise `_CACHE_MAX_ENTRIES`. Move it to Redis if multi-instance. **S**
- Lower `max_tokens` (the tool output is small; 1024 is generous). **S**
- Debounce/guard on the frontend so an Enter-mashing user can't fire N calls. **S**
- A hard daily spend ceiling / circuit breaker that falls back to rule-based when
  tripped, so a traffic spike can't produce a surprise bill. **M**

## 2. Database (Postgres on Railway/Render) — storage + query compute

**Drivers:** the 311 table (30M+ rows), full-table scans, always-on storage,
and egress.

**Already mitigating it:**
- Map rendering uses pre-generated **vector tiles** (tippecanoe + pmtiles), not
  GeoJSON from the API — the per-pan/zoom DB load is bounded.
- Viewport queries are bbox-clamped to NYC and `LIMIT`ed; low zoom serves the
  pre-aggregated `neighborhoods` table instead of scanning buildings.
- Address search is now backed by a **pg_trgm index** (migration 007) instead of
  scanning 859k rows per `LIKE`.

**Next steps:**
- **Prune data older than 5 years (M, high value).** Now that *both* scoring
  (`DATA_CUTOFF_YEARS`) and the detail panel (`_DISPLAY_WINDOW_SQL`) only use the
  last 5 years, rows older than that are dead weight. A periodic delete (or
  partition-drop) on `complaints` / `violations` older than ~5.5 years would cut
  the largest table dramatically — less storage, faster index builds, cheaper
  backups. This is the single biggest storage win and it's now safe to do.
- **Partition the big tables by date** so the 5-year window is a partition prune
  rather than a filter, and old partitions drop in O(1). **M–L**
- Make sure the nightly refresh is **incremental** (it is, via `--days-back`) so
  we're not re-writing the world each night.
- Scale the DB to demand; avoid an oversized always-on instance.

## 3. Map / Mapbox usage

Mapbox bills per map load and per tile/API request. The project already serves
its own vector tiles via **pmtiles** (`mapbox-pmtiles`), so tile *requests* don't
hit Mapbox — but map **loads** and the GL JS SDK may still count against a Mapbox
plan, plus geocoding if used.

**Levers:**
- Since tiles are already self-hosted as pmtiles, consider **MapLibre GL** in
  place of Mapbox GL to drop Mapbox session/load billing entirely. **M**
- Serve the `.pmtiles` from a CDN/object store with long cache headers so repeat
  visitors don't re-download. **S–M**
- Avoid any per-keystroke geocoding; our address search is our own DB. **S**

## 4. Hosting / compute

**Drivers:** an always-on backend instance, the frontend (Vercel), and the cron
refresh job (`railway.cron-daily.toml` / `Dockerfile.cron`).

**Levers:**
- Right-size / scale-to-zero the backend if the platform supports it; the API is
  bursty and idle most of the time.
- Keep the refresh job on a **scheduled cron** (it is) rather than a long-running
  worker, so we only pay for the nightly window.
- Cache GET endpoints (`/neighborhoods`, building detail) at the edge / with
  `Cache-Control` — the data is nightly-stable, so a short s-maxage offloads a
  lot of repeat reads from the backend and DB. **S–M**

## 5. Abuse / bot traffic — the cost multiplier

Bots hit the *same* expensive paths (Claude search, DB) as real users and can
multiply every cost above.

**Already mitigating it:** SlowAPI rate limits (search 60/min, buildings
300/min, rankings/detail 120/min).

**Levers:**
- Front the app with Cloudflare / a WAF for bot filtering and burst absorption. **S**
- Tighten the search limit and/or add a lightweight challenge (Turnstile) on the
  search endpoint specifically, since it's the one with per-call API cost. **M**
- The daily Claude spend circuit-breaker from §1 doubles as abuse protection.

## 6. Observability & analytics

Sentry and Vercel Analytics bill by event/volume.

**Levers:**
- Set a Sentry **traces/error sample rate** < 1.0 in production so a spike in
  traffic (or a noisy error loop) doesn't blow through the event quota. **S**
- Drop known-benign errors (aborted fetches, bot 404s) at the SDK
  `beforeSend`. **S**

---

## Priorities

1. ✅ **Rule-based-first, Claude-on-escalation** (§1) — done; the biggest
   variable-cost reduction, proportional to search traffic.
2. **Prune / partition data older than 5 years** (§2) — biggest fixed-cost
   (storage + backup) reduction, now unlocked by the 5-year display/score window.
3. **Edge-cache nightly-stable GETs + a Claude spend circuit-breaker** (§4, §1)
   — protect against both steady load and spikes.
4. **MapLibre swap + CDN-hosted pmtiles** (§3) — removes a whole vendor line if
   Mapbox load billing becomes material.
