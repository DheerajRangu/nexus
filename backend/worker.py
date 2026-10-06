import os
from celery import Celery
from backend.database import initialize
from backend.processor import process
from backend.logging_config import setup_logging
setup_logging()
app = Celery("aegis",broker=os.getenv("REDIS_URL","redis://redis:6379/0"))
@app.task(name="aegis.analyze")
def analyze(video_id):
    initialize()
    process(video_id)
