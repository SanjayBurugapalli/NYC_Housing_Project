"""Manual search integration tests — run against a live backend on localhost:8000."""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"


def search(query: str, **extra) -> dict:
    payload = json.dumps({"query": query, **extra}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def fmt(result: dict, label: str) -> None:
    total = result.get("total", 0)
    clarification = result.get("clarification", "")
    confidence = result.get("confidence")
    needs_fallback = result.get("needs_fallback", False)
    top = result.get("results", [])[:3]

    conf_str = f"  confidence={confidence:.2f}" if confidence is not None else ""
    fallback_str = "  [FALLBACK]" if needs_fallback else ""
    print(f"\n{'-'*60}")
    print(f"QUERY  : {label}")
    print(f"RESULTS: {total}{conf_str}{fallback_str}")
    if clarification:
        print(f"NOTE   : {clarification}")
    for b in top:
        grade = b.get("grade", "?")
        score = b.get("health_score", 0)
        addr  = b.get("address", "?")
        boro  = b.get("borough", "")
        units = b.get("residential_units") or "?"
        print(f"  [{grade}] {score:5.1f}  {addr}, {boro}  ({units} units)")
    if total > 3:
        print(f"  … and {total - 3} more")


CASES: list[tuple[str, dict]] = [
    # --- Natural language / concept queries ---
    ("quiet buildings in Brooklyn",         {}),
    ("worst buildings with rats in Harlem", {}),
    ("no heat violations in the Bronx",     {}),
    ("rat-free apartments in Astoria",      {}),
    ("best buildings in Manhattan",         {}),
    ("buildings with structural issues in Queens", {}),
    ("lawsuit buildings upper west side",   {}),
    # --- Borough + min_units filter ---
    ("apartments to live in",               {"borough": "Brooklyn", "min_units": 20}),
    ("buildings with pest problems",        {"borough": "Manhattan"}),
    # --- Address lookup ---
    ("350 West 42nd Street",                {}),
    ("1500 grand concourse",                {}),
    # --- BBL lookup ---
    ("1000477501",                          {}),
    # --- Vague / low-confidence queries ---
    ("places to live",                      {}),
    ("something nice",                      {}),
]


def main() -> None:
    ok = 0
    failed = 0
    for query, extra in CASES:
        label = query
        if extra:
            label += f"  [filters: {extra}]"
        try:
            result = search(query, **extra)
            fmt(result, label)
            ok += 1
        except Exception as e:
            print(f"\n{'-'*60}")
            print(f"QUERY  : {label}")
            print(f"ERROR  : {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Ran {ok + failed} queries — {ok} OK, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
