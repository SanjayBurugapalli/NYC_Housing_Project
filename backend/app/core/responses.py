"""The app's default JSON response: non-finite floats go out as null.

JSON has no NaN or Infinity, so one bad value in one row (city data that
pandas parsed to NaN) would otherwise fail a whole response with a 500, e.g.
the building card or a search. The frontend already reads null as "unknown".
"""

import logging
import math
from typing import Any

from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def finite(value: Any) -> Any:
    """`value` with every NaN/±Infinity float, at any depth, replaced by None."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite(v) for v in value]
    return value


class SafeJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        try:
            return super().render(content)
        except ValueError:
            # Only bad payloads pay for the walk.
            logger.warning('"msg":"Non-finite float in a response; sent as null"')
            return super().render(finite(content))
