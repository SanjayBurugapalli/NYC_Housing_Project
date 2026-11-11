"""Missing city data must reach Postgres as NULL and the API as null, never NaN."""

import json
import math
import sys
from pathlib import Path

import pandas as pd
from fastapi.responses import JSONResponse

from app.core.responses import SafeJSONResponse

# data/ingest is a flat script directory (see test_food_classify.py).
_here = Path(__file__).resolve()
for _candidate in (_here.parents[2] / "data" / "ingest", _here.parents[1] / "data" / "ingest"):
    if _candidate.is_dir() and str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

from base import clean_row_for_sql  # noqa: E402
from pull_dob import transform_dob_violations  # noqa: E402
from pull_litigations import transform_litigations  # noqa: E402
from pull_pluto import pluto_records  # noqa: E402


def test_nan_and_infinity_go_out_as_null():
    content = {"lat": float("nan"), "rows": [{"x": float("inf")}, (1.5, float("-inf"))], "name": "NaN"}
    assert json.loads(SafeJSONResponse(content).body) == {"lat": None, "rows": [{"x": None}, [1.5, None]], "name": "NaN"}


def test_finite_content_renders_like_a_plain_json_response():
    content = {"a": 1.25, "b": [1, "x", None], "c": {"d": False}}
    assert SafeJSONResponse(content).body == JSONResponse(content).body


def test_pluto_row_without_coordinates_goes_in_as_null():
    full, bare = pluto_records([
        {
            "bbl": "1009240054.00000000", "borough": "MN", "address": "322 EAST 19 STREET", "zipcode": "10003",
            "unitsres": "5", "numfloors": "5", "lotarea": "2000", "latitude": "40.7345", "longitude": "-73.9812",
            "cd": "106", "ownername": "AN OWNER LLC",
        },
        # PLUTO lots with no geocode: no coordinates, district, zip, address or owner.
        {"bbl": "3000010001.00000000", "borough": "BK", "unitsres": "3"},
    ])
    assert full["latitude"] == 40.7345 and full["neighborhood"] == "106" and full["house_number"] == "322"
    for key in ("latitude", "longitude", "num_floors", "lot_area", "zipcode", "neighborhood",
                "address", "house_number", "street_name", "owner_name"):
        assert bare[key] is None, key
    assert not any(isinstance(v, float) and math.isnan(v) for v in full.values())


def test_litigation_without_respondent_goes_in_as_null():
    df = transform_litigations(pd.DataFrame([
        {"litigationid": "1", "bbl": "1009240054", "respondent": "AN OWNER LLC", "casetype": "Heat and Hot Water", "casestatus": "OPEN"},
        {"litigationid": "2", "bbl": "1009240054"},
    ]))
    filled, missing = (clean_row_for_sql(r.to_dict()) for _, r in df.iterrows())
    assert filled["respondent"] == "AN OWNER LLC"
    assert missing["respondent"] is None and missing["case_type"] is None and missing["case_status"] is None


def test_dob_violation_without_category_or_disposition_goes_in_as_null():
    df = transform_dob_violations(pd.DataFrame([
        {"isn_dob_bis_viol": "1", "boro": "1", "block": "924", "lot": "54",
         "violation_category": "V-DOB VIOLATION - ACTIVE", "disposition_comments": "PENDING"},
        {"isn_dob_bis_viol": "2", "boro": "1", "block": "924", "lot": "54"},
    ]))
    filled, missing = (clean_row_for_sql(r.to_dict()) for _, r in df.iterrows())
    assert filled["violation_type"] == "V-DOB VIOLATION - ACTIVE" and filled["status"] == "PENDING"
    assert missing["violation_type"] is None and missing["status"] is None
