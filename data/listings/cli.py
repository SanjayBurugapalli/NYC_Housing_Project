#!/usr/bin/env python3
"""CLI entry point for the listing signal ingestion pipeline.

Usage:
    python -m data.listings.cli run
    python -m data.listings.cli tile -74.01 40.72 -73.99 40.74
"""
import argparse
import sys

from .config import load_config
from .runner import run
from .tiles import Tile


def main() -> None:
    parser = argparse.ArgumentParser(
        description="NYC listing signal ingestion pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", metavar="PATH", help="Path to config.yaml (default: built-in)")
    parser.add_argument(
        "--mock", action="store_true",
        help="Use synthetic listings instead of real API calls (for pipeline testing)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("run", help="Run full ingestion job over all NYC tiles")

    tile_cmd = sub.add_parser("tile", help="Process a single tile (for testing)")
    tile_cmd.add_argument("west", type=float)
    tile_cmd.add_argument("south", type=float)
    tile_cmd.add_argument("east", type=float)
    tile_cmd.add_argument("north", type=float)

    args = parser.parse_args()
    cfg = load_config(args.config)

    if args.cmd == "tile":
        tile = Tile(west=args.west, south=args.south, east=args.east, north=args.north)
        stats = run(cfg=cfg, single_tile=tile, mock=args.mock)
    else:
        stats = run(cfg=cfg, mock=args.mock)

    print(stats)
    sys.exit(0 if stats.tiles_failed == 0 else 1)


if __name__ == "__main__":
    main()
