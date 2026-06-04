"""Health score computation.

Composite score 0-100 (higher = healthier). Weighted sub-scores:
- Heat/hot water (311 + HPD): 20%
- Pest/rodent (311 + rodent inspections): 22%
- Structural/safety (DOB): 20%
- HPD violation severity (Class A/B/C): 20%
- Noise (311): 5%
- Litigation history: 13%

Rules:
- Normalize per residential unit
- Gradual time decay: 0-6mo=2x, 6-12mo=1.5x, 1-2yr=1x, 2+yr=0.5x
- Absolute scoring via exponential decay (not percentile)
"""

import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
from base import get_db_engine, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Scoring weights
WEIGHTS = {
    "heat_hot_water": 0.20,
    "pest_rodent": 0.22,
    "structural_safety": 0.20,
    "hpd_severity": 0.20,
    "noise": 0.05,
    "litigation": 0.13,
}

# Decay rates per category (higher = harsher penalty per normalized issue count).
# Steepened from the original calibration because the old linear per-unit
# divisor made grades too lenient (78% of buildings scored A). Note these now
# act on a sqrt(units)-normalized count (see normalized_per_unit), so a given
# rate bites harder than under the old per-unit scale.
DECAY_RATES = {
    "heat": 0.45,
    "pest": 0.55,
    "structural": 0.65,  # structural issues are more serious
    "hpd": 0.20,         # HPD already has severity multiplier built in
    "noise": 0.30,
    "litigation": 0.60,  # per-building (not unit-normalized), so rate applies directly
}


# Hard cutoff: only consider data from the last 5 years
DATA_CUTOFF_YEARS = 5


def time_weight(dates: pd.Series) -> pd.Series:
    """Gradual time decay: recent issues matter more, old ones fade.

    Anything older than DATA_CUTOFF_YEARS gets weight 0 (excluded).
    Weights are assigned from oldest to newest so newer tiers override older ones.
    """
    now = datetime.now(timezone.utc)
    cutoff_5yr = now - timedelta(days=DATA_CUTOFF_YEARS * 365)
    cutoff_24mo = now - timedelta(days=730)
    cutoff_12mo = now - timedelta(days=365)
    cutoff_6mo = now - timedelta(days=180)

    dates = pd.to_datetime(dates, utc=True)
    # Assign from oldest → newest; newer tiers override older ones
    weights = pd.Series(0.0, index=dates.index)    # older than 5yr = excluded
    weights[dates >= cutoff_5yr] = 0.25            # 2-5 years
    weights[dates >= cutoff_24mo] = 0.5            # 1-2 years
    weights[dates >= cutoff_12mo] = 1.5            # 6-12 months
    weights[dates >= cutoff_6mo] = 2.0             # 0-6 months
    return weights


def absolute_score(weighted_per_unit: pd.Series, decay_rate: float) -> pd.Series:
    """Convert weighted issues per unit to 0-100 score using exponential decay.

    score = 100 * exp(-decay_rate * weighted_per_unit)
    0 issues → 100, more issues → smoothly approaches 0
    """
    return (100 * np.exp(-decay_rate * weighted_per_unit)).clip(0, 100)


def normalized_per_unit(
    weighted_count: pd.Series, residential_units: pd.Series
) -> pd.Series:
    """Normalize a weighted issue count by sqrt(units) rather than raw unit count.

    A linear divisor made large buildings nearly impossible to penalize — a
    200-unit building with 40 complaints scored like a 5-unit building with 1.
    sqrt(units) preserves the intent (bigger buildings legitimately see more
    issues) without letting size alone guarantee an A. units is already clipped
    to ≥1 upstream, so the denominator is always ≥1.
    """
    return weighted_count / np.sqrt(residential_units)


def compute_all_scores():
    """Compute health scores for all buildings."""
    engine = get_db_engine()

    logger.info("Loading building data...")
    buildings = pd.read_sql(
        "SELECT id, bbl, residential_units, building_class, year_built "
        "FROM buildings WHERE residential_units > 0",
        engine,
    )
    logger.info(f"Found {len(buildings)} residential buildings")

    if buildings.empty:
        logger.warning("No buildings found. Exiting.")
        return

    # Ensure residential_units is at least 1 to avoid division by zero
    buildings["residential_units"] = buildings["residential_units"].clip(lower=1)

    # Compute each sub-score
    logger.info("Computing heat/hot water scores...")
    heat_scores = compute_complaint_score(engine, buildings, "heat", DECAY_RATES["heat"])

    logger.info("Computing pest/rodent scores...")
    pest_scores = compute_pest_score(engine, buildings, DECAY_RATES["pest"])

    logger.info("Computing structural safety scores...")
    structural_scores = compute_structural_score(engine, buildings, DECAY_RATES["structural"])

    logger.info("Computing HPD severity scores...")
    hpd_scores = compute_hpd_severity_score(engine, buildings, DECAY_RATES["hpd"])

    logger.info("Computing noise scores...")
    noise_scores = compute_complaint_score(engine, buildings, "noise", DECAY_RATES["noise"])

    logger.info("Computing litigation scores...")
    litigation_scores = compute_litigation_score(engine, buildings)

    # Merge all scores
    scores = buildings[["id", "bbl", "building_class"]].copy()
    scores["heat_hot_water_score"] = heat_scores
    scores["pest_rodent_score"] = pest_scores
    scores["structural_safety_score"] = structural_scores
    scores["hpd_severity_score"] = hpd_scores
    scores["noise_score"] = noise_scores
    scores["litigation_score"] = litigation_scores
    scores["age_maintenance_score"] = 0.0  # Deprecated, kept for DB compatibility

    # Get complaint/violation counts
    counts = get_raw_counts(engine, buildings)
    scores = scores.merge(counts, on="bbl", how="left")

    # Compute weighted composite score
    scores["composite_score"] = (
        scores["heat_hot_water_score"] * WEIGHTS["heat_hot_water"]
        + scores["pest_rodent_score"] * WEIGHTS["pest_rodent"]
        + scores["structural_safety_score"] * WEIGHTS["structural_safety"]
        + scores["hpd_severity_score"] * WEIGHTS["hpd_severity"]
        + scores["noise_score"] * WEIGHTS["noise"]
        + scores["litigation_score"] * WEIGHTS["litigation"]
    ).round(2)

    # Round all sub-scores to 2 decimal places
    score_cols = [
        "heat_hot_water_score", "pest_rodent_score", "structural_safety_score",
        "hpd_severity_score", "noise_score", "litigation_score",
    ]
    for col in score_cols:
        scores[col] = scores[col].round(2)

    # Percentile ranking within building class
    scores["percentile_rank"] = (
        scores.groupby("building_class")["composite_score"].rank(pct=True) * 100
    ).round(2)

    # Upsert scores
    logger.info("Writing scores to database...")
    upsert_scores(engine, scores)

    # Update neighborhood aggregates
    logger.info("Updating neighborhood aggregates...")
    update_neighborhood_aggregates(engine)

    logger.info(f"Scoring complete. Processed {len(scores)} buildings.")
    logger.info(f"Score distribution: mean={scores['composite_score'].mean():.1f}, "
                f"median={scores['composite_score'].median():.1f}")


def compute_complaint_score(
    engine, buildings: pd.DataFrame, category: str, decay_rate: float
) -> pd.Series:
    """Compute a sub-score based on complaint counts per unit with time decay."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")
    complaints = pd.read_sql(
        text(
            "SELECT bbl, created_date FROM complaints "
            "WHERE category = :category AND bbl IS NOT NULL "
            "AND created_date >= :since"
        ),
        engine,
        params={"category": category, "since": since},
    )

    if complaints.empty:
        return pd.Series(100.0, index=buildings.index)

    complaints["weight"] = time_weight(complaints["created_date"])

    weighted_counts = complaints.groupby("bbl")["weight"].sum().reset_index()
    weighted_counts.columns = ["bbl", "weighted_count"]

    merged = buildings.merge(weighted_counts, on="bbl", how="left")
    merged["weighted_count"] = merged["weighted_count"].fillna(0)
    merged["per_unit"] = normalized_per_unit(merged["weighted_count"], merged["residential_units"])

    return absolute_score(merged["per_unit"], decay_rate)


def compute_pest_score(
    engine, buildings: pd.DataFrame, decay_rate: float
) -> pd.Series:
    """Combine pest complaints and rodent inspections."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")
    pest_complaints = pd.read_sql(
        text(
            "SELECT bbl, created_date FROM complaints "
            "WHERE category = 'pest' AND bbl IS NOT NULL "
            "AND created_date >= :since"
        ),
        engine,
        params={"since": since},
    )

    rodent = pd.read_sql(
        text(
            "SELECT bbl, inspection_date FROM rodent_inspections "
            "WHERE (result ILIKE '%%rat%%' OR result ILIKE '%%active%%') "
            "AND bbl IS NOT NULL "
            "AND inspection_date >= :since"
        ),
        engine,
        params={"since": since},
    )

    combined = pd.DataFrame()
    if not pest_complaints.empty:
        pest_complaints["date"] = pest_complaints["created_date"]
        combined = pd.concat([combined, pest_complaints[["bbl", "date"]]])
    if not rodent.empty:
        rodent["date"] = rodent["inspection_date"]
        combined = pd.concat([combined, rodent[["bbl", "date"]]])

    if combined.empty:
        return pd.Series(100.0, index=buildings.index)

    combined["weight"] = time_weight(combined["date"])

    weighted_counts = combined.groupby("bbl")["weight"].sum().reset_index()
    weighted_counts.columns = ["bbl", "weighted_count"]

    merged = buildings.merge(weighted_counts, on="bbl", how="left")
    merged["weighted_count"] = merged["weighted_count"].fillna(0)
    merged["per_unit"] = normalized_per_unit(merged["weighted_count"], merged["residential_units"])

    return absolute_score(merged["per_unit"], decay_rate)


def compute_structural_score(
    engine, buildings: pd.DataFrame, decay_rate: float
) -> pd.Series:
    """Score based on DOB violations/complaints (excluding administrative/filing violations)."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")
    violations = pd.read_sql(
        text(
            "SELECT bbl, inspection_date FROM violations "
            "WHERE source = 'DOB' AND bbl IS NOT NULL "
            "AND (description IS NULL OR description NOT ILIKE :filing_pattern) "
            "AND (violation_type NOT ILIKE :dismissed_pattern) "
            "AND inspection_date >= :since"
        ),
        engine,
        params={"filing_pattern": "%failure to file%", "dismissed_pattern": "%dismissed%", "since": since},
    )

    dob_complaints = pd.read_sql(
        text(
            "SELECT bbl, created_date as inspection_date FROM complaints "
            "WHERE source = 'DOB' AND bbl IS NOT NULL "
            "AND created_date >= :since"
        ),
        engine,
        params={"since": since},
    )

    combined = pd.concat([violations, dob_complaints])

    if combined.empty:
        return pd.Series(100.0, index=buildings.index)

    combined["weight"] = time_weight(combined["inspection_date"])

    weighted_counts = combined.groupby("bbl")["weight"].sum().reset_index()
    weighted_counts.columns = ["bbl", "weighted_count"]

    merged = buildings.merge(weighted_counts, on="bbl", how="left")
    merged["weighted_count"] = merged["weighted_count"].fillna(0)
    merged["per_unit"] = normalized_per_unit(merged["weighted_count"], merged["residential_units"])

    return absolute_score(merged["per_unit"], decay_rate)


def compute_hpd_severity_score(
    engine, buildings: pd.DataFrame, decay_rate: float
) -> pd.Series:
    """Score based on HPD violation severity (Class A/B/C). C is worst."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")
    violations = pd.read_sql(
        text(
            "SELECT bbl, severity, inspection_date FROM violations "
            "WHERE source = 'HPD' AND bbl IS NOT NULL "
            "AND inspection_date >= :since"
        ),
        engine,
        params={"since": since},
    )

    if violations.empty:
        return pd.Series(100.0, index=buildings.index)

    tw = time_weight(violations["inspection_date"])

    # Severity weights: C (immediately hazardous) = 5, B (hazardous) = 3, A (non-hazardous) = 1
    severity_weight = violations["severity"].map({"C": 5, "B": 3, "A": 1}).fillna(1)
    violations["weight"] = tw * severity_weight

    weighted_counts = violations.groupby("bbl")["weight"].sum().reset_index()
    weighted_counts.columns = ["bbl", "weighted_count"]

    merged = buildings.merge(weighted_counts, on="bbl", how="left")
    merged["weighted_count"] = merged["weighted_count"].fillna(0)
    merged["per_unit"] = normalized_per_unit(merged["weighted_count"], merged["residential_units"])

    return absolute_score(merged["per_unit"], decay_rate)


def compute_litigation_score(engine, buildings: pd.DataFrame) -> pd.Series:
    """Score based on litigation history with time decay."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")
    litigations = pd.read_sql(
        text(
            "SELECT bbl, case_open_date FROM litigations "
            "WHERE bbl IS NOT NULL AND case_open_date >= :since"
        ),
        engine,
        params={"since": since},
    )

    if litigations.empty:
        return pd.Series(100.0, index=buildings.index)

    litigations["weight"] = time_weight(litigations["case_open_date"])

    weighted_counts = litigations.groupby("bbl")["weight"].sum().reset_index()
    weighted_counts.columns = ["bbl", "weighted_count"]

    merged = buildings.merge(weighted_counts, on="bbl", how="left")
    merged["weighted_count"] = merged["weighted_count"].fillna(0)

    # Litigation is per-building not per-unit (a lawsuit affects the whole building)
    return absolute_score(merged["weighted_count"], DECAY_RATES["litigation"])


def get_raw_counts(engine, buildings: pd.DataFrame) -> pd.DataFrame:
    """Get raw complaint/violation/rodent/litigation counts per building (within cutoff)."""
    since = (datetime.now(timezone.utc) - timedelta(days=DATA_CUTOFF_YEARS * 365)).strftime("%Y-%m-%d")

    complaint_counts = pd.read_sql(
        text(
            "SELECT bbl, COUNT(*) as total_complaints FROM complaints "
            "WHERE bbl IS NOT NULL AND created_date >= :since GROUP BY bbl"
        ),
        engine,
        params={"since": since},
    )

    violation_counts = pd.read_sql(
        text(
            "SELECT bbl, COUNT(*) as total_violations FROM violations "
            "WHERE bbl IS NOT NULL "
            "AND (description IS NULL OR description NOT ILIKE :filing_pattern) "
            "AND (violation_type NOT ILIKE :dismissed_pattern) "
            "AND inspection_date >= :since "
            "GROUP BY bbl"
        ),
        engine,
        params={"filing_pattern": "%failure to file%", "dismissed_pattern": "%dismissed%", "since": since},
    )

    rodent_counts = pd.read_sql(
        text(
            "SELECT bbl, COUNT(*) as total_rodent FROM rodent_inspections "
            "WHERE bbl IS NOT NULL "
            "AND (result ILIKE :rat_pattern OR result ILIKE :active_pattern) "
            "AND inspection_date >= :since "
            "GROUP BY bbl"
        ),
        engine,
        params={"rat_pattern": "%rat%", "active_pattern": "%active%", "since": since},
    )

    litigation_counts = pd.read_sql(
        text(
            "SELECT bbl, COUNT(*) as total_litigations FROM litigations "
            "WHERE bbl IS NOT NULL AND case_open_date >= :since GROUP BY bbl"
        ),
        engine,
        params={"since": since},
    )

    counts = buildings[["bbl", "residential_units"]].copy()
    counts = counts.merge(complaint_counts, on="bbl", how="left")
    counts = counts.merge(violation_counts, on="bbl", how="left")
    counts = counts.merge(rodent_counts, on="bbl", how="left")
    counts = counts.merge(litigation_counts, on="bbl", how="left")
    counts["total_complaints"] = counts["total_complaints"].fillna(0).astype(int)
    counts["total_violations"] = counts["total_violations"].fillna(0).astype(int)
    counts["total_rodent"] = counts["total_rodent"].fillna(0).astype(int)
    counts["total_litigations"] = counts["total_litigations"].fillna(0).astype(int)
    counts["complaints_per_unit"] = (counts["total_complaints"] / counts["residential_units"]).round(2)
    counts["violations_per_unit"] = (counts["total_violations"] / counts["residential_units"]).round(2)

    return counts[["bbl", "total_complaints", "total_violations", "total_rodent", "total_litigations", "complaints_per_unit", "violations_per_unit"]]


def upsert_scores(engine, scores: pd.DataFrame):
    """Upsert computed scores into health_scores table."""
    records = [clean_row_for_sql(row.to_dict()) for _, row in scores.iterrows()]
    # Batch in chunks to avoid memory issues
    chunk_size = 10000
    with engine.begin() as conn:
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            for record in chunk:
                conn.execute(
                    text("""
                        INSERT INTO health_scores (
                            building_id, bbl, composite_score,
                            heat_hot_water_score, pest_rodent_score,
                            structural_safety_score, hpd_severity_score,
                            noise_score, litigation_score, age_maintenance_score,
                            percentile_rank, building_class,
                            total_complaints, total_violations,
                            complaints_per_unit, violations_per_unit,
                            computed_at
                        ) VALUES (
                            :id, :bbl, :composite_score,
                            :heat_hot_water_score, :pest_rodent_score,
                            :structural_safety_score, :hpd_severity_score,
                            :noise_score, :litigation_score, :age_maintenance_score,
                            :percentile_rank, :building_class,
                            :total_complaints, :total_violations,
                            :complaints_per_unit, :violations_per_unit,
                            NOW()
                        ) ON CONFLICT (bbl) DO UPDATE SET
                            composite_score = EXCLUDED.composite_score,
                            heat_hot_water_score = EXCLUDED.heat_hot_water_score,
                            pest_rodent_score = EXCLUDED.pest_rodent_score,
                            structural_safety_score = EXCLUDED.structural_safety_score,
                            hpd_severity_score = EXCLUDED.hpd_severity_score,
                            noise_score = EXCLUDED.noise_score,
                            litigation_score = EXCLUDED.litigation_score,
                            age_maintenance_score = EXCLUDED.age_maintenance_score,
                            percentile_rank = EXCLUDED.percentile_rank,
                            total_complaints = EXCLUDED.total_complaints,
                            total_violations = EXCLUDED.total_violations,
                            complaints_per_unit = EXCLUDED.complaints_per_unit,
                            violations_per_unit = EXCLUDED.violations_per_unit,
                            computed_at = NOW()
                    """),
                    record,
                )
            logger.info(f"  Upserted {min(i + chunk_size, len(records))}/{len(records)} scores")


def update_neighborhood_aggregates(engine):
    """Recompute neighborhood-level aggregate scores.

    The ``name`` column stores the raw ``"<cd>-<BOROUGH>"`` code (e.g.
    ``"105-MANHATTAN"``). Human-readable resolution happens at read time in the
    API via ``app.api.neighborhood_names.get_neighborhood_name`` — that dict is
    the single source of truth and is what the frontend's NEIGHBORHOOD_SPLITS
    keys are aligned to. Do NOT resolve names here: storing a resolved name
    ("Midtown") makes the API re-resolve it and emit "District Midtown".
    """
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE neighborhoods RESTART IDENTITY"))
        conn.execute(
            text("""
                INSERT INTO neighborhoods (name, borough, avg_health_score, building_count,
                    total_complaints, total_violations, centroid_lat, centroid_lng, computed_at)
                SELECT
                    CONCAT(b.neighborhood, '-', b.borough) as name,
                    b.borough,
                    AVG(hs.composite_score) as avg_health_score,
                    COUNT(DISTINCT b.id) as building_count,
                    SUM(hs.total_complaints) as total_complaints,
                    SUM(hs.total_violations) as total_violations,
                    AVG(b.latitude) as centroid_lat,
                    AVG(b.longitude) as centroid_lng,
                    NOW()
                FROM buildings b
                JOIN health_scores hs ON hs.building_id = b.id
                WHERE b.neighborhood IS NOT NULL
                  AND b.building_class NOT LIKE 'A%'
                  AND b.building_class NOT LIKE 'B%'
                GROUP BY b.neighborhood, b.borough
            """)
        )


if __name__ == "__main__":
    compute_all_scores()
