from app.services.celery_app import celery_app


@celery_app.task
def refresh_health_scores():
    """Recompute and refresh the health score materialized view."""
    # TODO: call scoring computation
    pass


@celery_app.task
def incremental_data_sync():
    """Pull latest data from NYC Open Data sources."""
    # TODO: call ingestion scripts
    pass
