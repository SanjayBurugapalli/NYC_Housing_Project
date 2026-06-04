from pydantic_settings import BaseSettings

# Hard cap on rows returned by any search path (guardrail, not a tunable
# setting). Single source for the API route, the rule-based parser, and the
# Claude tool schema.
MAX_RESULTS = 100


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://nyc_buildings:devpassword@localhost:5432/nyc_buildings"
    database_url_sync: str = "postgresql://nyc_buildings:devpassword@localhost:5432/nyc_buildings"

    anthropic_api_key: str = ""
    socrata_app_token: str = ""

    admin_token: str = ""

    # Comma-separated allowlist of origins permitted to call the API.
    # Default covers local dev; prod MUST set ALLOWED_ORIGINS to the deployed
    # frontend URL(s), e.g. "https://nycbuildings.vercel.app".
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Scoring weights
    weight_heat_hot_water: float = 0.20
    weight_pest_rodent: float = 0.15
    weight_structural_safety: float = 0.20
    weight_hpd_severity: float = 0.20
    weight_noise: float = 0.05
    weight_litigation: float = 0.10
    weight_age_maintenance: float = 0.10

    # Time decay
    recent_months: int = 12
    recent_weight_multiplier: float = 3.0

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
