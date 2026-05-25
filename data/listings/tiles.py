"""Divide NYC bounding box into a grid of fetch tiles."""
from dataclasses import dataclass

from .config import Config


@dataclass(frozen=True)
class Tile:
    west: float
    south: float
    east: float
    north: float

    def as_bbox_dict(self) -> dict:
        return {"west": self.west, "south": self.south, "east": self.east, "north": self.north}

    def __str__(self) -> str:
        return f"Tile({self.west:.4f},{self.south:.4f},{self.east:.4f},{self.north:.4f})"


def generate_tiles(cfg: Config) -> list[Tile]:
    """Generate all tiles covering the NYC bounding box."""
    bbox = cfg.nyc_bbox
    step = cfg.tile_size
    tiles: list[Tile] = []

    lat = bbox.south
    while lat < bbox.north:
        lon = bbox.west
        while lon < bbox.east:
            tiles.append(Tile(
                west=round(lon, 6),
                south=round(lat, 6),
                east=round(min(lon + step, bbox.east), 6),
                north=round(min(lat + step, bbox.north), 6),
            ))
            lon = round(lon + step, 6)
        lat = round(lat + step, 6)

    return tiles
