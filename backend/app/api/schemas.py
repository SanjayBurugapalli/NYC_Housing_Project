from datetime import datetime

from pydantic import BaseModel, Field


# --- Buildings ---

def score_to_grade(score: float) -> str:
    """Convert numeric composite score to letter grade."""
    if score >= 97:
        return "A"
    if score >= 90:
        return "B"
    if score >= 75:
        return "C"
    if score >= 55:
        return "D"
    return "F"


class BuildingSummaryResponse(BaseModel):
    bbl: str
    bin: str | None = None
    address: str | None = None
    borough: str | None = None
    neighborhood: str | None = None
    health_score: float = 0.0
    grade: str = "A"
    latitude: float | None = None
    longitude: float | None = None
    residential_units: int = 0
    year_built: int | None = None
    building_class: str | None = None


class ScoreBreakdownResponse(BaseModel):
    heat_hot_water: float = 100.0
    heat_hot_water_count: int = 0
    pest_rodent: float = 100.0
    pest_rodent_count: int = 0
    structural_safety: float = 100.0
    structural_safety_count: int = 0
    hpd_severity: float = 100.0
    hpd_severity_count: int = 0
    noise: float = 100.0
    noise_count: int = 0
    litigation: float = 100.0
    litigation_count: int = 0
    composite: float = 0.0


class ComplaintResponse(BaseModel):
    id: str
    type: str | None = None
    descriptor: str | None = None
    date: str | None = None
    closed_date: str | None = None
    status: str | None = None
    source: str
    description: str | None = None
    category: str | None = None
    resolution_days: int | None = None


class ViolationResponse(BaseModel):
    id: str
    type: str | None = None
    severity: str | None = None
    date: str | None = None
    status: str | None = None
    source: str
    description: str | None = None
    order_number: str | None = None
    status_date: str | None = None
    approved_date: str | None = None
    certify_by_date: str | None = None
    correct_by_date: str | None = None


class LitigationResponse(BaseModel):
    id: str
    case_type: str | None = None
    status: str | None = None
    date: str | None = None
    judgment: str | None = None
    respondent: str | None = None


class RodentInspectionResponse(BaseModel):
    id: str
    type: str | None = None
    result: str | None = None
    date: str | None = None
    address: str | None = None


class BuildingDetailResponse(BuildingSummaryResponse):
    owner_name: str | None = None
    score_breakdown: ScoreBreakdownResponse | None = None
    complaints: list[ComplaintResponse] = []
    violations: list[ViolationResponse] = []
    litigations: list[LitigationResponse] = []
    rodent_inspections: list[RodentInspectionResponse] = []
    litigation_count: int = 0
    rodent_inspection_count: int = 0


class BuildingListResponse(BaseModel):
    buildings: list[BuildingSummaryResponse]
    total: int


# --- Neighborhoods ---

class NeighborhoodResponse(BaseModel):
    name: str
    borough: str
    avg_score: float = 0.0
    building_count: int = 0
    centroid: list[float] = []  # [lng, lat]


class NeighborhoodListResponse(BaseModel):
    neighborhoods: list[NeighborhoodResponse]


# --- Search ---

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)


class SearchResponse(BaseModel):
    results: list[BuildingSummaryResponse]
    total: int
    query: str
    clarification: str | None = None
