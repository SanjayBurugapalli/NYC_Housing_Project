# Monetization Strategy

How BeforeYouRent can make money without burning the one asset that makes it
worth anything: **renters trust it because no landlord or broker pays for
placement.** Every option below is graded against that constraint.

Grounding facts (from `costAnalysis.md` and the codebase):

- Marginal cost per user is near zero — map tiles are self-hosted PMTiles,
  most searches resolve rule-based without a Claude call, data is public and
  refreshes nightly on a cheap cron. Fixed costs (DB, hosting) are low hundreds
  of dollars a month at most. **We don't need much revenue to be sustainable**,
  which means we can pick the trust-preserving options, not the desperate ones.
- The audience is high-intent and time-boxed: people actively deciding whether
  to sign a NYC lease, usually within a 2–6 week window. That shape favors
  **one-off purchases and point-of-decision referrals** over subscriptions.

---

## 1. Affiliate referrals at the point of decision — ship first

A renter looking at a building detail panel is days away from spending money on
exactly the products that pay referral fees:

| Product | Examples | Why it fits |
|---|---|---|
| Guarantor / deposit-replacement services | TheGuarantors, Insurent, Rhino | NYC-specific need (40x-rent requirements); commissions are meaningful per signed lease |
| Renters insurance | Lemonade, Goodcov | Required by most NYC leases; affiliate programs are turnkey |
| Moving services | moving marketplaces | Natural next step after signing |

**Why this is the right first move:** zero new infrastructure (a contextual
card in the building panel / post-search flow), zero conflict of interest —
none of these products benefit from a building scoring well or badly, so the
score stays incorruptible. Revenue scales with traffic from day one with no
paywall friction during the launch window when growth matters most.

**Effort:** S. Static affiliate links + a tasteful "getting this apartment?"
card. Disclose clearly ("we may earn a commission").

## 2. Premium one-off: the "Renter Report" — the core paid product

Keep the map, scores, and search free forever (that's the SEO/word-of-mouth
moat). Charge for **depth on a specific building once someone is serious**:

- **Building deep-dive report** (~$9 one-off, or 3-pack): full violation and
  litigation timeline, landlord portfolio across all their LLCs (the
  `potentialFeatures.md` landlord-portfolio feature is the engine for this),
  rent-stabilization likelihood signals, "why this score" narrative, exportable
  PDF to share with a partner/roommate.
- **Lease red-flag scanner** (already spec'd in `potentialFeatures.md`, M
  effort): upload the lease PDF, Claude flags illegal/unusual clauses. This is
  the highest willingness-to-pay moment in the entire funnel — someone holding
  a lease they're about to sign. Works standalone at ~$9–15 or bundled.
- **"Apartment Hunter Pass"** (~$19 for 30 days): unlimited reports + lease
  scans + watch-alerts on saved buildings for the duration of a hunt. Matches
  the episodic usage pattern far better than a monthly subscription —
  nobody wants a recurring charge for an apartment they already found.

**Why one-off, not subscription:** retention for a "find an apartment" tool is
structurally terrible; churn isn't a failure, it's the product working. Price
for the episode.

**Effort:** M–L. Needs payments (Stripe), lightweight accounts (already a
prerequisite for the watch-alerts feature), and the report generation itself —
most of which is repackaging data the DB already has.

## 3. B2B data & API licensing — the scale play (later)

The cleaned, joined, BBL-keyed, nightly-refreshed dataset with a calibrated
composite score is genuinely hard to replicate (address normalization across
30M+ 311 rows, severity weighting, per-unit normalization, time decay). Buyers:

- **Proptech / listing platforms** that want a building-quality signal next to
  listings.
- **Insurers and lenders** underwriting buildings or landlords.
- **Institutional renters' agents / relocation firms.**

Sell metered API access or flat-rate data licenses (e.g., $500–5k/mo per
client). One or two clients can exceed all consumer revenue combined.

**Guardrail:** license the *data*, never score-influence. A landlord-facing
"improve your score" consulting product is the obvious slippery slope — don't.

**Effort:** M for a keyed, metered API tier (the API already exists; add auth,
quotas, and a license). The real cost is sales effort, which is why this comes
after the consumer product proves the data's credibility.

## 4. What we deliberately do NOT do

- **No display ads.** Pennies per user, wrecks the product feel, and the
  obvious advertisers (brokers, landlords, listing sites) are exactly the
  conflict of interest the brand exists to avoid.
- **No paid placement or "featured buildings."** Same reason. The score must
  be unbuyable or the whole product is worthless.
- **No selling user data.** The privacy page (`/privacy`) and the trust
  positioning both forbid it; the `analytics_events` IP/UA hashes stay internal.
- **No landlord-side score remediation services.** Even structured carefully,
  it reads as pay-to-fix and invites a "ratings agency" credibility collapse.

## 5. Sequencing & rough numbers

| Phase | When | Revenue line | Why then |
|---|---|---|---|
| 1 | At/just after launch | Affiliate cards (guarantor, insurance) | Zero friction, zero trust cost, monetizes launch traffic immediately |
| 2 | After traction (steady organic search traffic) | Renter Report + lease scanner + Hunter Pass | Needs accounts + Stripe; conversion needs an audience first |
| 3 | After the score has public credibility | B2B API / data licensing | Sales-led; credibility is the pitch |

Back-of-envelope for sustainability (not riches): per `costAnalysis.md` the
fully-loaded run rate is on the order of $100–300/mo. ~10–30 guarantor
referrals **or** ~20–40 Renter Reports a month covers it. Everything beyond
that funds the `potentialFeatures.md` roadmap.

## 6. Open questions before Phase 2

- Accounts are a prerequisite for both the Hunter Pass and the watch-alerts
  feature — build once, serve both.
- Lease-scanner legal posture: the output must be framed as "flags to discuss,"
  not legal advice; add a disclaimer and have it reviewed alongside the
  existing privacy-policy review in `beforeLaunch.md`.
- Affiliate program acceptance usually requires a live site with traffic —
  apply right after launch, not before.
