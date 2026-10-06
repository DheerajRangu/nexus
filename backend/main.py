import asyncio
import json
import logging
import os
import time
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
import cv2
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from backend.database import initialize, Session, Video, get_video
from backend.processor import process, ROOT, CONFIG
from backend.schemas import AnalysisSummary

ADMISSION_LOCK = threading.Lock()

from backend.logging_config import setup_logging
setup_logging()
@asynccontextmanager
async def lifespan(app):
    initialize()
    async def monitor():
        from backend.emergency_monitor import check_deadlines
        while True:
            try:await asyncio.to_thread(check_deadlines)
            except Exception:logging.getLogger('aegis').exception('emergency_monitor_failed')
            await asyncio.sleep(2)
    task=asyncio.create_task(monitor())
    try:yield
    finally:
        task.cancel()
        try:await task
        except asyncio.CancelledError:pass
app = FastAPI(title="AEGIS OmniVision",version="3.0.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv("CORS_ORIGINS","http://localhost:5173,http://localhost:8080").split(","),allow_credentials=True,allow_methods=["GET","POST","PATCH","DELETE"],allow_headers=["Content-Type","X-API-Key","Authorization","Last-Event-ID","Aegis-Contract-Version","Accept-Language"])

def authorize(x_api_key: str | None = Header(default=None)):
    key = os.getenv("AEGIS_API_KEY")
    if key and x_api_key != key: raise HTTPException(401,"Invalid API key")

def video_or_404(video_id):
    row = get_video(video_id)
    if not row: raise HTTPException(404,"Video not found")
    return row

class AnalysisOptions(BaseModel):
    mode: str = "BALANCED"
    roi: list[tuple[float,float]] | None = Field(default=None,min_length=3,max_length=30)
    @model_validator(mode="after")
    def validate_options(self):
        import numpy as np
        if self.mode not in CONFIG["modes"]: raise ValueError("Unknown processing mode")
        if self.roi is None: return self
        if any(not (0<=x<=1 and 0<=y<=1) for x,y in self.roi): raise ValueError("ROI coordinates must be normalized 0–1")
        polygon = np.asarray(self.roi,dtype=np.float32)
        if cv2.contourArea(polygon)<.001: raise ValueError("ROI polygon has zero area")
        # Convex polygons prevent self-intersections and ambiguous masks.
        if not cv2.isContourConvex(polygon): raise ValueError("ROI must be a convex polygon without crossings")
        return self

class ROIConfiguration(BaseModel):
    videoId: str
    roi: list[tuple[float,float]]
    @model_validator(mode="after")
    def validate_roi(self):
        AnalysisOptions(roi=self.roi)
        return self

@app.post("/api/config/roi",dependencies=[Depends(authorize)])
def save_roi(config: ROIConfiguration):
    video_or_404(config.videoId)
    with Session.begin() as db:
        row=db.get(Video,config.videoId,with_for_update=True)
        if row.state["status"] in {"queued","processing"}: raise HTTPException(409,"Cannot change ROI during analysis")
        row.configuration={**row.configuration,"roi":config.roi}
    return dict(saved=True,videoId=config.videoId,roi=config.roi)

@app.get("/api/health")
def health(): return dict(status="online",vehicleModel=Path(os.getenv("VEHICLE_MODEL",CONFIG["vehicle_model"])).name,liveVision=True,queue="celery" if os.getenv("USE_CELERY")=="1" else "local")

@app.get("/api/videos",dependencies=[Depends(authorize)])
def list_videos():
    with Session() as db: return [dict(id=v.id,info=v.info,state=v.state,configuration=v.configuration) for v in db.query(Video).order_by(Video.created_at.desc()).limit(100)]

@app.post("/api/videos/upload",dependencies=[Depends(authorize)])
async def upload(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4",".mov",".avi",".mkv"}: raise HTTPException(415,"Supported formats: MP4, MOV, AVI, MKV")
    video_id = uuid.uuid4().hex
    path = ROOT/"videos/uploads"/(video_id+suffix)
    path.parent.mkdir(parents=True,exist_ok=True)
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := await file.read(1024*1024):
                size += len(chunk)
                if size>CONFIG["max_upload_mb"]*1024*1024: raise HTTPException(413,"Video exceeds upload size limit")
                target.write(chunk)
        capture = cv2.VideoCapture(str(path))
        try:
            fps = capture.get(cv2.CAP_PROP_FPS)
            count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            ok,frame = capture.read()
            if not ok or fps<=0 or count<=0: raise HTTPException(422,"Video is empty, corrupted, or uses an unsupported codec")
            height,width = frame.shape[:2]
            thumbnail = ROOT/"videos/uploads"/(video_id+".jpg")
            if not cv2.imwrite(str(thumbnail),frame): raise HTTPException(500,"Could not create video thumbnail")
        finally: capture.release()
        info = dict(filename=Path(file.filename).name,storedName=path.name,sizeBytes=size,fps=fps,frameCount=count,durationSeconds=count/fps,width=width,height=height)
        with Session.begin() as db: db.add(Video(id=video_id,info=info,state=dict(status="ready",progress=0,stage="Ready to analyze"),configuration={}))
        logging.getLogger("aegis").info("video_uploaded",extra={"video_id":video_id,"video_filename":info["filename"]})
        return dict(id=video_id,info=info,state=dict(status="ready",progress=0))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally: await file.close()

@app.get("/api/videos/{video_id}/thumbnail",dependencies=[Depends(authorize)])
def thumbnail(video_id):
    video_or_404(video_id)
    return FileResponse(ROOT/"videos/uploads"/(video_id+".jpg"),media_type="image/jpeg")

@app.get("/api/videos/{video_id}/source",dependencies=[Depends(authorize)])
def source(video_id):
    row=video_or_404(video_id)
    return FileResponse(ROOT/"videos/uploads"/row["info"]["storedName"])

@app.post("/api/videos/{video_id}/analyze",dependencies=[Depends(authorize)])
def analyze(video_id: str, options: AnalysisOptions, background: BackgroundTasks):
    video_or_404(video_id)
    with ADMISSION_LOCK, Session.begin() as db:
        # Serialize admission across PostgreSQL API processes as well as threads.
        if db.bind.dialect.name == "postgresql": db.execute(text("SELECT pg_advisory_xact_lock(7426101)"))
        row=db.get(Video,video_id,with_for_update=True)
        if row.state["status"] in {"queued","processing"}: raise HTTPException(409,"Analysis is already running")
        active=db.query(Video).filter(Video.id!=video_id).all()
        if any(v.state["status"] in {"queued","processing"} for v in active): raise HTTPException(429,"Another analysis is running. Try again when it finishes.")
        row.configuration=options.model_dump()
        row.state=dict(status="queued",progress=0,stage="Queued for analysis")
    if os.getenv("USE_CELERY")=="1":
        from backend.worker import analyze as job
        try: job.delay(video_id)
        except Exception:
            from backend.database import set_state
            set_state(video_id,dict(status="failed",progress=0,error="Analysis queue is unavailable"))
            raise HTTPException(503,"Analysis queue is unavailable")
    else: background.add_task(process,video_id)
    return dict(status="queued",videoId=video_id)

@app.get("/api/videos/{video_id}/status",dependencies=[Depends(authorize)])
def status(video_id): return video_or_404(video_id)["state"]

def artifact(video_id,name):
    row=video_or_404(video_id)
    if row["state"]["status"] != "complete": raise HTTPException(409,"Analysis output is not ready")
    path=ROOT/"videos/outputs"/video_id/name
    if not path.exists(): raise HTTPException(409,"Analysis output is not ready")
    return path

@app.get("/api/videos/{video_id}/summary",dependencies=[Depends(authorize)],response_model=AnalysisSummary)
def summary(video_id): return json.loads(artifact(video_id,"summary.json").read_text())
@app.get("/api/videos/{video_id}/results",dependencies=[Depends(authorize)])
def results(video_id): return dict(summary=summary(video_id),timeline=json.loads(artifact(video_id,"timeline.json").read_text()))
@app.get("/api/videos/{video_id}/events",dependencies=[Depends(authorize)])
def events(video_id): return [json.loads(line) for line in artifact(video_id,"events.jsonl").read_text().splitlines()]
@app.get("/api/videos/{video_id}/output-video",dependencies=[Depends(authorize)])
def output(video_id, view: str = "ai"):
    if view not in {"ai","minimal"}: raise HTTPException(422,"Unknown overlay view")
    return FileResponse(artifact(video_id,"minimal.mp4" if view=="minimal" else "annotated.mp4"),media_type="video/mp4")
@app.get("/api/videos/{video_id}/export/{kind}",dependencies=[Depends(authorize)])
def export(video_id,kind):
    names={"summary":"summary.json","frames":"frames.jsonl","events":"events.jsonl"}
    if kind not in names: raise HTTPException(404,"Unknown export")
    return FileResponse(artifact(video_id,names[kind]),filename=names[kind])

@app.websocket("/ws/analysis/{video_id}")
async def websocket(ws: WebSocket,video_id: str):
    key=os.getenv("AEGIS_API_KEY")
    if key and ws.headers.get("x-api-key")!=key:
        await ws.close(code=1008); return
    await ws.accept()
    try:
        while True:
            row=get_video(video_id)
            if not row: await ws.close(code=1008); break
            await ws.send_json(dict(type="ANALYSIS_PROGRESS",**row["state"]))
            if row["state"]["status"] in {"complete","failed"}: break
            await asyncio.sleep(.7)
    except WebSocketDisconnect: pass

# Live routes replace batch analysis in the UI; batch endpoints remain compatible for existing exports.
from backend.live import router as live_router
app.include_router(live_router,dependencies=[Depends(authorize)])

from backend.emergency_api import router as emergency_router
from backend.citizen_api import router as citizen_router
app.include_router(emergency_router)
app.include_router(citizen_router)

from backend.mobile_compat import router as mobile_router
app.include_router(mobile_router)
