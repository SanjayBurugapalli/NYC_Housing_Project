# Potential Features

Brainstormed from a NYC renter's perspective. Difficulty: **S** (small, hours) · **M** (medium, days) · **L** (large, weeks) · **XL** (multi-month / requires external infra).

## Tenant-Protection Signals

- **Rent stabilization lookup** — flag stabilized units using DHCR registration data + 421-a / J-51 tax abatement signals. Arguably the single most consequential fact for a NYC renter. **L** — DHCR data is hard to get cleanly; partial coverage from JustFix's open dataset is feasible faster.
- **Landlord portfolio view** — group buildings by owner (HPD registrations), surface a "worst landlord" leaderboard, link every building owned by the same LLC. Exposes serial slumlords behind shell companies. **M** — HPD Registrations dataset is already keyed by BBL; just need a new table + UI.
- **Eviction & litigation timeline** — per-building housing court filings. Extend the existing Housing Litigations ingest with OCA eviction case data. **M** — OCA data is bulk-downloadable but address-only (no BBL), so needs the same address-normalization path as 311.
- **Rent overcharge flag** — if a stabilized unit shows a registered rent jump beyond legal increase caps, flag it. **L** — depends on rent-stabilization data landing first.

## Pre-Signing Decision Support

- **Lease red-flag scanner** — upload lease PDF, Claude flags unusual clauses (illegal broker fees in HSTPA era, waiver of repair obligations, auto-renewal traps). **M** — PDF parse + a single Claude call with a structured rubric; main work is the rubric and the UX.
- **"Should I tour this?" score** — combine commute time to a user-entered work address + health score + $/sqft percentile in the zip. **M** — needs a transit isochrone source (Mapbox Isochrone API or OTP) and a rent comp source.
- **Multi-building compare** — extend [ComparePanel.tsx](frontend/src/components/ComparePanel.tsx) from 2 to 3–4 buildings with diffable score breakdowns and a "winner per category" view. **S** — purely frontend, the data is already there.

## Active-Tenant Features

- **Watch a building** — saved-building alerts when score drops, a new HPD violation lands, or DOB scaffolding is permitted on the block. **M** — needs user accounts (currently anonymous) + an email/push channel + a diff job in Celery.
- **Seasonal heat/hot-water watch** — Oct–May, surface neighborhood-level heat-complaint spikes so a tenant knows whether to file 311 themselves. **S** — re-aggregation of existing 311 data; new map layer toggle.
- **File-a-311 helper** — pre-filled 311 / HPD complaint forms based on the building's known issue pattern, deep-linked to the NYC 311 form. **S** — link composition + small explanatory UI. No new data.

## Map Overlays

- **Active construction & scaffolding (DOB permits)** — sidewalk-shed permits are a real quality-of-life hit; surface them as a layer. **M** — new Socrata ingest (DOB Permits) + a Mapbox layer.
- **Climate / flood risk** — FEMA + NYC stormwater flood maps overlaid on the building view. **M** — static GeoJSON ingest + a layer toggle; no live updates needed.
- **Noise environment** — SLA liquor licenses + DOB construction permits within ~200 ft; renders a "nightlife / noise" pill on the building panel. **M** — two new ingests + a spatial join.
- **Commute isochrone** — user enters a work address; draw a 30-min transit polygon and intersect with the grade filter. **M** — Mapbox Isochrone or OTP server; mostly a frontend feature once the API is wired.

## Trust & Community

- **Verified anonymous tenant reviews** — proof-of-tenancy gate (e.g. utility bill OCR or a mailed-postcard code) before a review counts. Prevents astroturfing. **XL** — moderation, abuse handling, legal review for defamation exposure. Don't ship lightly.
- **"Why this score?" explainer** — plain-English breakdown of the 3 biggest score hits per building, citing specific 311 complaints and HPD violations. **S** — the underlying numbers already feed [ScoreBreakdown.tsx](frontend/src/components/ScoreBreakdown.tsx); add a templated narrative layer.

## Suggested Order

1. **"Why this score?" explainer** (S) — immediate UX win on data we already have.
2. **Multi-building compare** (S) — small extension, high tenant value.
3. **Landlord portfolio view** (M) — uniquely defensible vs. StreetEasy; HPD Registrations data is clean.
4. **Lease red-flag scanner** (M) — high "wow" factor, leverages the existing Claude integration.
5. **Rent stabilization lookup** (L) — biggest single tenant-impact feature, but data acquisition is the long pole.
