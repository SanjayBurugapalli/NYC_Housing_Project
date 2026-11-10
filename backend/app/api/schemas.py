from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# --- Buildings ---

class BuildingSummaryResponse(BaseModel):
    bbl: str
    bin: str | None = None
    address: str | None = None
    borough: str | None = None
    neighborhood: str | None = None
    nta_name: str | None = None
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


class FDNYViolationResponse(BaseModel):
    id: str
    violation_number: str | None = None
    violation_type: str | None = None
    description: str | None = None
    status: str | None = None
    date: str | None = None
    address: str | None = None


class EvictionResponse(BaseModel):
    id: str
    address: str | None = None
    apartment_no: str | None = None
    respondent: str | None = None
    executed_date: str | None = None
    marshal_name: str | None = None
    eviction_type: str | None = None


class OwnerPortfolioResponse(BaseModel):
    building_count: int
    avg_score: float
    grade: str


class BuildingDetailResponse(BuildingSummaryResponse):
    owner_name: str | None = None
    managing_agent: str | None = None
    owner_portfolio: OwnerPortfolioResponse | None = None
    sub_neighborhood: str | None = None
    score_breakdown: ScoreBreakdownResponse | None = None
    complaints: list[ComplaintResponse] = []
    violations: list[ViolationResponse] = []
    litigations: list[LitigationResponse] = []
    rodent_inspections: list[RodentInspectionResponse] = []
    fdny_violations: list[FDNYViolationResponse] = []
    evictions: list[EvictionResponse] = []
    litigation_count: int = 0
    rodent_inspection_count: int = 0
    eviction_count: int = 0
    rent_status: str = "unknown"


class BuildingListResponse(BaseModel):
    buildings: list[BuildingSummaryResponse]
    total: int


# --- Rankings (worst landlords & buildings) ---

class WorstBuildingResponse(BuildingSummaryResponse):
    owner_name: str | None = None
    managing_agent: str | None = None
    total_violations: int = 0
    total_complaints: int = 0


class WorstBuildingsListResponse(BaseModel):
    buildings: list[WorstBuildingResponse]
    total: int
    borough: str | None = None


class WorstLandlordResponse(BaseModel):
    owner_name: str
    building_count: int
    avg_score: float
    grade: str
    total_violations: int
    total_complaints: int
    total_units: int
    boroughs: list[str] = []
    worst_bbl: str | None = None


class WorstLandlordsListResponse(BaseModel):
    landlords: list[WorstLandlordResponse]
    total: int
    borough: str | None = None
    group_by: str = "owner"


# --- Search ---

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    include_small_homes: bool = False
    borough: str | None = None
    min_units: int | None = None
    # Structured override: skip parsing and run these filters directly (after
    # validate_filters). The frontend resends the `filters` it got back, minus a
    # removed chip, to drop one interpreted filter.
    filters: dict | None = None
    # "Search this area": [west, south, east, north], clamped to NYC.
    bbox: list[float] | None = Field(None, min_length=4, max_length=4)


class FilterChip(BaseModel):
    key: str
    label: str


class SearchResponse(BaseModel):
    results: list[BuildingSummaryResponse]
    total: int
    query: str
    clarification: str | None = None
    confidence: float | None = None
    needs_fallback: bool = False
    filters: dict | None = None
    filter_chips: list[FilterChip] = []


# --- Listing links ---

class ResolveListingRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2000)


class ResolveListingResponse(BaseModel):
    status: Literal["found", "no_address", "not_found", "invalid"]
    source: Literal["streeteasy", "zillow"] | None = None
    parsed_address: str | None = None
    building: BuildingSummaryResponse | None = None
    message: str | None = None


# --- Commute ---

class CommuteLegResponse(BaseModel):
    mode: Literal["WALK", "SUBWAY", "BUS", "RAIL", "FERRY", "OTHER"]
    duration_min: int
    from_name: str | None = None
    to_name: str | None = None
    route_short_name: str | None = None
    route_color: str | None = None
    route_text_color: str | None = None
    headsign: str | None = None
    num_stops: int | None = None
    geometry: list[list[float]] = []


class AttributionResponse(BaseModel):
    text: str
    url: str


class CommuteResponse(BaseModel):
    duration_min: int
    depart_at: str
    arrive_at: str
    assumption: str
    legs: list[CommuteLegResponse]
    attribution: AttributionResponse


# --- Food nearby ---

class FoodPlaceResponse(BaseModel):
    id: str
    name: str
    category: Literal["deli", "grocery", "restaurant"]
    subtype: str | None = None
    price_tier: int | None = None
    latitude: float
    longitude: float
    distance_m: int
    walk_min: int
    address: str | None = None


class FoodCountsResponse(BaseModel):
    deli: int = 0
    grocery: int = 0
    restaurant: int = 0


class PointResponse(BaseModel):
    latitude: float
    longitude: float


class FoodNearbyResponse(BaseModel):
    radius_m: int
    walk_minutes: int
    center: PointResponse
    counts: FoodCountsResponse
    places: list[FoodPlaceResponse]
    price_note: str
