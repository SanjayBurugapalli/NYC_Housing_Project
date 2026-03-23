from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://nyc_buildings:devpassword@localhost:5432/nyc_buildings"
    database_url_sync: str = "postgresql://nyc_buildings:devpassword@localhost:5432/nyc_buildings"
    redis_url: str = "redis://localhost:6379/0"

    anthropic_api_key: str = ""
    socrata_app_token: str = ""

    cors_origins: list[str] = ["*"]

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
