from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery("nyc_buildings", broker=settings.redis_url, backend=settings.redis_url)

celery_app.conf.beat_schedule = {
    "refresh-health-scores": {
        "task": "app.services.tasks.refresh_health_scores",
        "schedule": crontab(hour=2, minute=0),  # Nightly at 2 AM
    },
    "incremental-data-sync": {
        "task": "app.services.tasks.incremental_data_sync",
        "schedule": crontab(hour=3, minute=0),  # Nightly at 3 AM
    },
}

celery_app.conf.timezone = "America/New_York"
