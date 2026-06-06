# Filter Ideas

Brainstormed filters to add to the map, search, and rankings. Each is tagged by
the data it needs and a rough effort estimate: **S** (hours) · **M** (a day or
two) · **L** (needs a new ingest or schema work).

For reference, the filters that exist today are:
- **Map:** grade chips (A–F), min/max units, min/max year built, include 1–2
  family homes.
- **Search (NL + filter row):** borough, neighborhood (NTA), score range,
  complaint types, litigation, units, year built, building class, owner.
- **Rankings:** borough, owner vs. managing agent, and now custom score weights.

Everything below is grouped by whether the underlying data is **already in the
DB** (cheap to add) or **needs new ingest/derivation**.

---

## Tier 1 — Data is already in the DB (mostly UI work)

- **Rent-regulation status** — `not_regulated` / `likely_stabilized` / `condo` /
  `coop`. Already computed per building (`_compute_rent_status` in
  `building_service.py`) and shown in the panel; expose it as a first-class
  filter. Arguably the single most decision-relevant facet for a renter. **S**
  (surface the existing heuristic) → **M** if we want it filterable in the
  viewport layer too (needs the field on the tiles / summary projection).
- **Open vs. closed violations** — the `violations.status` /
  `litigations.case_status` columns let us filter to buildings with *currently
  open* hazardous violations rather than any historical one. "Show me buildings
  with open Class C violations" is a much sharper signal than a lifetime count.
  **M** (needs an `EXISTS (… AND status open)` predicate + an index on status).
- **Recent-activity window** — "a new HPD violation or 311 complaint in the last
  3 / 6 / 12 months." Surfaces *deteriorating* buildings, which a raw score
  hides. All date columns exist; this is a date-windowed `EXISTS`. **M**.
- **Eviction activity** — buildings with executed evictions in the last N years
  (the `evictions` table is already ingested and shown in the panel, but not
  filterable). A high-eviction building is a red flag a health score can miss.
  **S–M**.
- **Active fire-safety hazards (FDNY)** — filter to buildings with open
  `fdny_violations`. Already ingested per BIN. **S–M**.
- **Per-unit complaint / violation rate** — we already store
  `complaints_per_unit` / `violations_per_unit`. Let a user filter by "worst per
  unit" so a well-run 300-unit tower isn't penalized for raw volume. **S**.
- **Zip code** — `buildings.zipcode` exists and is a more familiar geography for
  many renters than NTA. A plain text/zip filter. **S**.
- **Floors / has-elevator** — `num_floors` plus building class (`D*` = elevator,
  `C*` = walk-up) supports a "walk-up vs. elevator" toggle, which matters for
  accessibility and for what kinds of complaints to expect. **S**.
- **Specific complaint descriptor** — `complaints.descriptor` is finer than the
  6 score categories: bed bugs vs. roaches vs. mice, mold, lead paint, no gas.
  A "what specifically?" sub-filter under the pest/heat categories. **M** (need
  a curated descriptor → keyword map; the search parser already has the start of
  one in `COMPLAINT_KEYWORDS`).
- **Score / grade as a numeric range on the map** — today the map filters by
  discrete grade chips; a continuous min/max score slider (already supported by
  the search backend's `min_score`/`max_score`) gives finer control. **S**.
- **Landlord portfolio size** — "only buildings owned by landlords with 3+
  buildings." Reuses the entity-normalization already built for the rankings
  page; lets a renter avoid serial operators. **M**.

## Tier 2 — Needs a derivation or a small new computed field

- **Trend: improving vs. declining** — compare the weighted issue count in the
  most recent 12 months against the prior 12–24. Store a per-building trend flag
  during the nightly scoring run, then filter "getting worse." High value, and
  we already load all the dated rows in `compute.py`. **M**.
- **Outperforming / underperforming its neighborhood** — score delta vs. the NTA
  average (the `neighborhoods` aggregate already exists). "Best building on a bad
  block" / "worst building on a good block." **M**.
- **Heat-season heat filter** — restrict heat/hot-water complaints to the legal
  heat season (Oct 1 – May 31) so summer noise doesn't dilute the signal a
  winter renter cares about. **S** (a date predicate on the existing data).
- **New-construction / recently-renovated** — `year_built` ≥ 2015 or
  `year_altered` recent. The NL parser already understands "new construction";
  expose it as a UI chip. **S**.

## Tier 3 — Needs a new dataset / external infra

- **Active construction & sidewalk sheds** — DOB permits / scaffolding within
  ~200 ft (a real quality-of-life hit). New Socrata ingest + spatial join. **L**.
- **Flood / climate risk** — FEMA + NYC stormwater flood zones as a filter and
  overlay. Static GeoJSON ingest. **L**.
- **Commute / isochrone** — "within 30 min transit of this address." Needs an
  isochrone source (Mapbox Isochrone or OTP). **L**.
- **Rent / $ per sqft band** — needs a listings/rent source (the `data/listings`
  scaffold is a start, but coverage is the long pole). **L**.

---

## Suggested first batch

1. **Rent-regulation status filter** (Tier 1) — highest renter value, data is
   already computed.
2. **Open-violations / recent-activity filter** (Tier 1) — turns a lifetime
   score into a "what's wrong *right now*" view.
3. **Per-unit rate + numeric score slider** (Tier 1) — cheap precision wins that
   reuse fields we already store.
4. **Trend flag** (Tier 2) — a genuinely differentiated filter once the nightly
   job computes it.

> Implementation note: viewport-layer filters (rent status, open violations)
> need the field present on the **vector tiles** or summary projection, not just
> the detail endpoint — otherwise they only work in search/rankings, not on the
> live map. Plan the tile schema change alongside any Tier-1 map filter.
