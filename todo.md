#ME

Fix text in website, sounds too AI now.

#Claude

All items below are done (commits on `main`).

- [x] HPD violations should not include class I (administrative); check DOB; weight A<B<C.
      → HPD severity now counts only Class A/B/C (drops 66,947 Class I) in scoring,
        stored counts, and the building-detail breakdown/list. A=1/B=3/C=5 weighting
        was already correct and kept. DOB are construction/safety, not administrative
        ("failure to file" + dismissed were already excluded) — no change needed.

- [x] Replace neighborhood bubbles with more precise outlines if feasible, else bubbles.
      → Feasible: rendered as filled/outlined NTA polygons (197, full building coverage)
        from a new /api/neighborhoods/polygons endpoint, replacing the centroid bubbles.

- [x] Map units filter shows <100-unit buildings when filtering for 100+.
      → Filter logic was correct; it was being silently dropped when the map style
        reported mid-stream. Now applied on map idle so the change is never lost.
        (Couldn't reproduce interactively here — verify in the browser.)

- [x] Search results should appear over an open building detail panel.
      → Layering now tracks the most recently opened panel: a new search raises the
        results above an open building panel; clicking a result still raises the building.

- [x] Soften the big-building penalty (between units and sqrt(units)).
      → Per-unit normalization is now units**0.75 (midpoint of 1.0 and 0.5). Scores
        recomputed; multi-family grade spread is ~65% A with a real D/F tail.

- [x] Daily refresh shows as failed though the log looks fine. Investigate.
      → Any single puller raising made the whole job exit 1 (Railway red). Now the run
        is fatal only if scoring fails or all pullers fail; partial failures stay green
        but still alert per-dataset (data_refresh_status + Sentry). Merged with the
        upstream tile-publishing step.
