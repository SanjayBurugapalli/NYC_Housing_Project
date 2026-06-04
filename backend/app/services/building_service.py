"""Building query service with PostGIS spatial queries."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.neighborhood_names import get_neighborhood_name
from app.api.sub_neighborhood_splits import SUB_NEIGHBORHOOD_SPLITS


# Shared SELECT-list + FROM/JOIN for the building "summary" projection used by
# the viewport, search, and lookup queries. Callers append their own WHERE /
# ORDER BY / LIMIT. The 12 columns map 1:1 to BuildingSummaryResponse, so keep
# them in sync with that schema.
BUILDING_SUMMARY_SELECT = """
    SELECT
        b.bbl, b.bin, b.address, b.borough, b.neighborhood, b.nta_name,
        COALESCE(hs.composite_score, 0) as health_score,
        b.latitude, b.longitude,
        b.residential_units, b.year_built, b.building_class
    FROM buildings b
    LEFT JOIN health_scores hs ON hs.building_id = b.id
"""


_CONDO_CLASSES = {"C6", "D5"}
_COOP_CLASSES = {"C0", "D0", "D4"}

def _compute_rent_status(building_class: str | None, year_built: int | None, residential_units: int) -> str:
    """Derive likely rent regulation status from building attributes.

    Heuristic only — authoritative data requires DHCR registration records.
    Rent stabilization generally covers rental buildings with 6+ units built before 1974.
    """
    bc = (building_class or "").upper().strip()
    if not bc:
        return "unknown"
    if bc in _CONDO_CLASSES or bc.startswith("R"):
        return "condo"
    if bc in _COOP_CLASSES:
        return "coop"
    first = bc[0]
    if first in ("A", "B"):
        return "not_regulated"
    if first in ("C", "D"):
        if residential_units >= 6 and year_built and year_built <= 1974:
            return "likely_stabilized"
        return "not_regulated"
    return "unknown"


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
    include_small_homes: bool = False,
) -> list[dict]:
    """Return buildings visible in map viewport. Zoom-dependent response."""

    if zoom < 13:
        # Low/medium zoom: return neighborhood aggregates
        return await get_neighborhood_aggregates_in_bbox(db, west, south, east, north)

    # High zoom: return individual buildings with scores
    size_clause = (
        ""
        if include_small_homes
        else "AND b.building_class NOT LIKE 'A%' AND b.building_class NOT LIKE 'B%'"
    )
    result = await db.execute(
        text(f"""
            {BUILDING_SUMMARY_SELECT}
            WHERE b.geom IS NOT NULL
                AND ST_Intersects(
                    b.geom,
                    ST_MakeEnvelope(:west, :south, :east, :north, 4326)
                )
                {size_clause}
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
                b.bbl, b.bin, b.address, b.borough, b.neighborhood, b.nta_name,
                b.latitude, b.longitude, b.residential_units,
                b.year_built, b.building_class, b.owner_name, b.managing_agent,
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

    # FDNY violations (by BIN, last 5 years, up to 20, open/active only)
    fdny_result = await db.execute(
        text("""
            SELECT external_id, violation_number, violation_type, description,
                   status, violation_date, address
            FROM fdny_violations
            WHERE bin = :bin
              AND (violation_date IS NULL OR violation_date >= NOW() - INTERVAL '5 years')
            ORDER BY violation_date DESC NULLS LAST
            LIMIT 20
        """),
        {"bin": b.get("bin") or ""},
    )
    fdny_violations = [
        {
            "id": row.external_id or str(row[0]),
            "violation_number": row.violation_number,
            "violation_type": row.violation_type,
            "description": row.description,
            "status": row.status,
            "date": row.violation_date.strftime("%Y-%m-%d") if row.violation_date else None,
            "address": row.address,
        }
        for row in fdny_result
    ]

    # Evictions (by BBL, last 5 years, up to 20)
    evictions_result = await db.execute(
        text("""
            SELECT external_id, address, apartment_no, respondent,
                   executed_date, marshal_name, eviction_type
            FROM evictions
            WHERE bbl = :bbl
              AND (executed_date IS NULL OR executed_date >= NOW() - INTERVAL '5 years')
            ORDER BY executed_date DESC NULLS LAST
            LIMIT 20
        """),
        {"bbl": bbl},
    )
    evictions = [
        {
            "id": row.external_id or str(row[0]),
            "address": row.address,
            "apartment_no": row.apartment_no,
            "respondent": row.respondent,
            "executed_date": row.executed_date.strftime("%Y-%m-%d") if row.executed_date else None,
            "marshal_name": row.marshal_name,
            "eviction_type": row.eviction_type,
        }
        for row in evictions_result
    ]

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

    # Prefer the NTA name; otherwise derive a display name from the community
    # district code. With no community district at all, fall back to NTA again.
    if b.get("neighborhood"):
        neighborhood_label = b.get("nta_name") or get_neighborhood_name(
            b["neighborhood"] or "", b["borough"] or ""
        )
    else:
        neighborhood_label = b.get("nta_name")

    return {
        "bbl": b["bbl"],
        "bin": b["bin"],
        "address": b["address"],
        "borough": b["borough"],
        "neighborhood": neighborhood_label,
        "nta_name": b.get("nta_name"),
        "sub_neighborhood": None,
        "latitude": b["latitude"],
        "longitude": b["longitude"],
        "residential_units": b["residential_units"] or 0,
        "year_built": b["year_built"],
        "building_class": b["building_class"],
        "owner_name": b.get("owner_name"),
        "managing_agent": b.get("managing_agent"),
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
        "fdny_violations": fdny_violations,
        "evictions": evictions,
        "litigation_count": len(litigations),
        "rodent_inspection_count": rodent_count,
        "eviction_count": len(evictions),
        "rent_status": _compute_rent_status(
            b.get("building_class"),
            b.get("year_built"),
            b.get("residential_units") or 0,
        ),
    }
