import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Use env var or default to mapped localhost port
# Internal Docker: redis:6379
# External Local: localhost:6390
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6390/0")

celery_app = Celery("img_worker", broker=REDIS_URL, backend=REDIS_URL, include=['app.worker'])

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Periodic Tasks Schedule
celery_app.conf.beat_schedule = {
    "cleanup-zombies-every-10-mins": {
        "task": "app.worker.cleanup_zombie_contracts",
        "schedule": 600.0, # 10 minutes
    },
}
