"""Building query service with PostGIS spatial queries."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.neighborhood_names import get_neighborhood_name
from app.api.sub_neighborhood_splits import SUB_NEIGHBORHOOD_SPLITS


_BOROUGH_CD_PREFIX: dict[str, str] = {
    "MANHATTAN": "1", "BRONX": "2", "BROOKLYN": "3", "QUEENS": "4", "STATEN ISLAND": "5",
}


def _resolve_sub_neighborhood(cd_code: str, lat: float | None, lng: float | None, borough: str = "") -> str | None:
    """Return the nearest sub-neighborhood name for a building using its coordinates.

    Uses a borough-wide nearest-centroid search (ignoring the building's assigned CD)
    so that buildings near CD boundaries resolve to the geographically correct name.
    Falls back to within-CD lookup if borough is unknown.
    """
    if lat is None or lng is None:
        return None

    prefix = _BOROUGH_CD_PREFIX.get(borough.upper(), "")
    if prefix:
        # Search all sub-neighborhoods in this borough
        candidates = [
            s
            for cd, splits in SUB_NEIGHBORHOOD_SPLITS.items()
            if cd.startswith(prefix)
            for s in splits
        ]
    else:
        candidates = SUB_NEIGHBORHOOD_SPLITS.get(cd_code, [])

    if not candidates:
        return None
    return min(candidates, key=lambda s: (s["lat"] - lat) ** 2 + (s["lng"] - lng) ** 2)["name"]

GRADE_MAP = {100: "A", 80: "B", 60: "C", 40: "D", 20: "F"}


def score_to_grade(score: float) -> str:
    if score >= 97:
        return "A"
    if score >= 90:
        return "B"
    if score >= 75:
        return "C"
    if score >= 55:
        return "D"
    return "F"


async def get_buildings_in_viewport(
    db: AsyncSession,
    west: float,
    south: float,
    east: float,
    north: float,
    zoom: int,
    limit: int = 500,
) -> list[dict]:
    """Return buildings visible in map viewport. Zoom-dependent response."""

    if zoom < 13:
        # Low/medium zoom: return neighborhood aggregates
        return await get_neighborhood_aggregates_in_bbox(db, west, south, east, north)

    # High zoom: return individual buildings with scores
    result = await db.execute(
        text("""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood,
                COALESCE(hs.composite_score, 0) as health_score,
                b.latitude, b.longitude,
                b.residential_units, b.year_built, b.building_class
            FROM buildings b
            LEFT JOIN health_scores hs ON hs.building_id = b.id
            WHERE b.geom IS NOT NULL
                AND ST_Intersects(
                    b.geom,
                    ST_MakeEnvelope(:west, :south, :east, :north, 4326)
                )
            ORDER BY hs.composite_score ASC NULLS LAST
            LIMIT :limit
        """),
        {"west": west, "south": south, "east": east, "north": north, "limit": limit},
    )

    rows = [dict(row._mapping) for row in result]
    for row in rows:
        row["grade"] = score_to_grade(row.get("health_score", 0))
    return rows


async def get_neighborhood_aggregates_in_bbox(
    db: AsyncSession,
    west: float,
    south: float,
    east: float,
    north: float,
) -> list[dict]:
    """Return neighborhood-level aggregates for low zoom levels."""
    result = await db.execute(
        text("""
            SELECT
                n.name as neighborhood,
                n.borough,
                n.avg_health_score as health_score,
                n.building_count,
                n.centroid_lat as latitude,
                n.centroid_lng as longitude
            FROM neighborhoods n
            WHERE n.centroid_lat BETWEEN :south AND :north
                AND n.centroid_lng BETWEEN :west AND :east
        """),
        {"west": west, "south": south, "east": east, "north": north},
    )

    return [dict(row._mapping) for row in result]


async def get_building_detail(db: AsyncSession, bbl: str) -> dict | None:
    """Get full building detail including score breakdown, complaints, violations."""

    # Building + score
    result = await db.execute(
        text("""
            SELECT
                b.bbl, b.bin, b.address, b.borough, b.neighborhood,
                b.latitude, b.longitude, b.residential_units,
                b.year_built, b.building_class, b.owner_name,
                hs.composite_score,
                hs.heat_hot_water_score, hs.pest_rodent_score,
                hs.structural_safety_score, hs.hpd_severity_score,
                hs.noise_score, hs.litigation_score, hs.age_maintenance_score,
                hs.percentile_rank, hs.total_complaints, hs.total_violations,
                hs.complaints_per_unit, hs.violations_per_unit
            FROM buildings b
            LEFT JOIN health_scores hs ON hs.building_id = b.id
            WHERE b.bbl = :bbl
        """),
        {"bbl": bbl},
    )
    building = result.first()
    if not building:
        return None

    b = dict(building._mapping)

    # Recent complaints (last 50)
    complaints_result = await db.execute(
        text("""
            SELECT id, source, complaint_type, descriptor, created_date, closed_date,
                   status, description, category, resolution_days
            FROM complaints
            WHERE bbl = :bbl
            ORDER BY created_date DESC NULLS LAST
            LIMIT 50
        """),
        {"bbl": bbl},
    )
    complaints = [
        {
            "id": str(row.id),
            "type": row.complaint_type,
            "descriptor": row.descriptor,
            "date": row.created_date.strftime("%Y-%m-%d") if row.created_date else None,
            "closed_date": row.closed_date.strftime("%Y-%m-%d") if row.closed_date else None,
            "status": row.status,
            "source": row.source,
            "description": row.description,
            "category": row.category,
            "resolution_days": row.resolution_days,
        }
        for row in complaints_result
    ]

    # Recent violations (last 50, excluding admin filings, dismissed, and blank entries)
    violations_result = await db.execute(
        text("""
            SELECT id, source, violation_type, severity, inspection_date, status, description,
                   order_number, status_date, approved_date,
                   original_certify_by_date, original_correct_by_date
            FROM violations
            WHERE bbl = :bbl
                AND (description IS NULL OR description NOT ILIKE :filing_pattern)
                AND (violation_type NOT ILIKE :dismissed_pattern)
                AND (description IS NOT NULL OR (severity IS NOT NULL AND severity != ''))
            ORDER BY inspection_date DESC NULLS LAST
            LIMIT 50
        """),
        {"bbl": bbl, "filing_pattern": "%failure to file%", "dismissed_pattern": "%dismissed%"},
    )
    violations = [
        {
            "id": str(row.id),
            "type": row.violation_type,
            "severity": row.severity,
            "date": row.inspection_date.strftime("%Y-%m-%d") if row.inspection_date else None,
            "status": row.status,
            "source": row.source,
            "description": row.description,
            "order_number": row.order_number,
            "status_date": row.status_date.strftime("%Y-%m-%d") if row.status_date else None,
            "approved_date": row.approved_date.strftime("%Y-%m-%d") if row.approved_date else None,
            "certify_by_date": row.original_certify_by_date.strftime("%Y-%m-%d") if row.original_certify_by_date else None,
            "correct_by_date": row.original_correct_by_date.strftime("%Y-%m-%d") if row.original_correct_by_date else None,
        }
        for row in violations_result
    ]

    # Litigation count (last 5 years only, matching score computation)
    lit_result = await db.execute(
        text("""
            SELECT COUNT(*) as cnt FROM litigations
            WHERE bbl = :bbl
              AND (case_open_date IS NULL OR case_open_date >= NOW() - INTERVAL '5 years')
        """),
        {"bbl": bbl},
    )
    litigation_count = lit_result.scalar() or 0

    # Recent litigations (last 5 years, up to 20)
    litigations_result = await db.execute(
        text("""
            SELECT external_id, case_type, case_status, case_open_date, case_judgment, respondent
            FROM litigations
            WHERE bbl = :bbl
              AND (case_open_date IS NULL OR case_open_date >= NOW() - INTERVAL '5 years')
            ORDER BY case_open_date DESC NULLS LAST
            LIMIT 20
        """),
        {"bbl": bbl},
    )
    litigations = [
        {
            "id": row.external_id,
            "case_type": row.case_type,
            "status": row.case_status,
            "date": row.case_open_date.strftime("%Y-%m-%d") if row.case_open_date else None,
            "judgment": row.case_judgment,
            "respondent": row.respondent,
        }
        for row in litigations_result
    ]

    # Recent rodent inspections (last 20, excluding passed inspections)
    rodent_result = await db.execute(
        text("""
            SELECT external_id, inspection_type, result, inspection_date, address
            FROM rodent_inspections
            WHERE bbl = :bbl
                AND (result IS NULL OR result != 'Passed')
            ORDER BY inspection_date DESC NULLS LAST
            LIMIT 20
        """),
        {"bbl": bbl},
    )
    rodent_inspections = [
        {
            "id": row.external_id,
            "type": row.inspection_type,
            "result": row.result,
            "date": row.inspection_date.strftime("%Y-%m-%d") if row.inspection_date else None,
            "address": row.address,
        }
        for row in rodent_result
    ]

    rodent_count = len(rodent_inspections)

    # Per-category complaint/violation counts for score breakdown
    category_counts_result = await db.execute(
        text("""
            SELECT category, COUNT(*) as cnt FROM complaints
            WHERE bbl = :bbl AND category IS NOT NULL
            GROUP BY category
        """),
        {"bbl": bbl},
    )
    category_counts = {row.category: row.cnt for row in category_counts_result}

    hpd_severity_result = await db.execute(
        text("""
            SELECT severity, COUNT(*) as cnt FROM violations
            WHERE bbl = :bbl AND source = 'HPD' AND severity IS NOT NULL
            GROUP BY severity
        """),
        {"bbl": bbl},
    )
    hpd_counts = {f"hpd_{row.severity.lower()}": row.cnt for row in hpd_severity_result}

    dob_count_result = await db.execute(
        text(
            "SELECT COUNT(*) as cnt FROM violations WHERE bbl = :bbl AND source = 'DOB' "
            "AND (description IS NULL OR description NOT ILIKE :filing_pattern) "
            "AND (violation_type NOT ILIKE :dismissed_pattern)"
        ),
        {"bbl": bbl, "filing_pattern": "%failure to file%", "dismissed_pattern": "%dismissed%"},
    )
    dob_count = dob_count_result.scalar() or 0

    cd_code = (b.get("neighborhood") or "").split("-")[0]
    sub_neighborhood = _resolve_sub_neighborhood(
        cd_code, b.get("latitude"), b.get("longitude"), b.get("borough") or ""
    )

    return {
        "bbl": b["bbl"],
        "bin": b["bin"],
        "address": b["address"],
        "borough": b["borough"],
        "neighborhood": get_neighborhood_name(b["neighborhood"] or "", b["borough"] or "") if b.get("neighborhood") else b["neighborhood"],
        "sub_neighborhood": sub_neighborhood,
        "latitude": b["latitude"],
        "longitude": b["longitude"],
        "residential_units": b["residential_units"] or 0,
        "year_built": b["year_built"],
        "building_class": b["building_class"],
        "owner_name": b.get("owner_name"),
        "health_score": b.get("composite_score") or 0,
        "grade": score_to_grade(b.get("composite_score") or 0),
        "score_breakdown": {
            "heat_hot_water": b.get("heat_hot_water_score") or 100,
            "heat_hot_water_count": category_counts.get("heat", 0),
            "pest_rodent": b.get("pest_rodent_score") or 100,
            "pest_rodent_count": category_counts.get("pest", 0) + rodent_count,
            "structural_safety": b.get("structural_safety_score") or 100,
            "structural_safety_count": dob_count + category_counts.get("structural", 0),
            "hpd_severity": b.get("hpd_severity_score") or 100,
            "hpd_severity_count": sum(hpd_counts.values()),
            "noise": b.get("noise_score") or 100,
            "noise_count": category_counts.get("noise", 0),
            # If no litigations in the last 5 years, show a perfect score regardless
            # of the stored score (which may reflect older cases outside the display window).
            "litigation": 100 if litigation_count == 0 else (b.get("litigation_score") or 100),
            "litigation_count": litigation_count,
            "composite": b.get("composite_score") or 0,
        },
        "complaints": complaints,
        "violations": violations,
        "litigations": litigations,
        "rodent_inspections": rodent_inspections,
        "litigation_count": len(litigations),
        "rodent_inspection_count": rodent_count,
    }
