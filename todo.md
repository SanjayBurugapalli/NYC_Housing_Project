#ME

Fix text in website, sounds too AI now. 

Review UI, make changes if necessary.

Figure out how to put ads on website

#Claude

[DONE] Allow custom scoring for the 'worst landlords' page so users can prioritize what's most important to them
  → Added w_* weight params to both /rankings endpoints (rankings.py); custom score is a normalized weighted blend of the existing sub-score columns (pure SQL, no recompute). Rankings page now has a collapsible "Prioritize what matters to you" sliders panel that re-ranks both buildings and landlords. Defaults reproduce the stored composite.

[DONE] Add logo to map page and make it so if clicked will take user to home page. Move the 'data last updated' pill to the right of the logo.
  → Top-left logo (logo-mark.svg) links to "/"; FreshnessPill sits to its right on desktop. Search bar inset on mobile to clear the logo; pill is hidden on mobile (no room beside logo + search).

[DONE] Brainstorm new potential filters that I can add.
  → See filterIdeas.md (tiered by data availability + effort).

[DONE] Brainstorm potential issues that will increase costs and identify solutions.
  → See costAnalysis.md (Claude calls, DB storage/compute, Mapbox, hosting, abuse, observability).

[DONE] Fix the streeteasy links for buildings in queens ... should be a direct link.
  → Queens fell back to /search?query= only because sub_neighborhood was always null. BuildingPanel now feeds nta_name through, so Queens produces a direct /building/<slug>-<neighborhood> URL. (Heads-up: if some Queens links 404, the slug builder in streeteasy.ts — underscored house number / no ordinal / neighborhood match — may need a tweak; StreetEasy blocks automated verification.)

[DONE] Only display violations in a 5 year window; do this for other fields too and re-score if necessary.
  → building_service.py now windows complaints, violations, rodent inspections, and the breakdown counts (category/HPD/DOB) to NOW() - INTERVAL '5 years', matching the scoring cutoff. Litigation/FDNY/evictions were already windowed. No re-score needed: compute.py already enforces DATA_CUTOFF_YEARS = 5, so stored scores already exclude old data — this just makes the *displayed* records/counts consistent with it.

[DONE] Remove the source link to my github from the footer
  → Removed the "Source" GitHub link from the landing-page footer (page.tsx). (The per-building "Report incorrect data" link is a separate feature and was left in place.)

[DONE] Make sure single-building search is efficient and cheap, as I imagine that's what most users will do.
  → Address/BBL lookups already short-circuit before any Claude call. Made them efficient too: switched search_by_address to ILIKE and added a pg_trgm GIN index on buildings.address (migration 007) so the leading-wildcard match is index-served instead of scanning ~859k rows. (See costAnalysis.md §1 for a follow-up that cuts Claude cost on NL search.)


