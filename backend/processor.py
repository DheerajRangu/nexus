import json
import logging
import os
import shutil
import subprocess
import time
from collections import Counter
from pathlib import Path
import cv2
import numpy as np
import yaml
from ai.engine import Tracks, TrafficSmoother, traffic
from ai.perception import RoadSegmenter, EvidenceDetector, OpticalFlow, LaneGeometry, mask_occupancy, point_in_mask
from ai.brain import RoadBrain
from ai.visualization import draw
from backend.database import get_video, set_state
from backend.schemas import AnalysisSummary

ROOT=Path(__file__).resolve().parents[1]
CONFIG=yaml.safe_load((ROOT/'config/config.yaml').read_text())
OMNI=yaml.safe_load((ROOT/'config/omnivision.yaml').read_text())
LOG=logging.getLogger('aegis')

def select_device() -> str:
    import torch
    requested=os.getenv('INFERENCE_DEVICE')
    if requested:return 'cuda:'+requested if requested.isdigit() else requested
    if torch.cuda.is_available():return 'cuda:0'
    # CPU is a predictable default for mixed-model inference; explicit mps remains supported.
    return 'cpu'

def process(video_id:str) -> None:
    row=get_video(video_id);info,options=row['info'],row['configuration']
    out=ROOT/'videos/outputs'/video_id;out.mkdir(parents=True,exist_ok=True)
    capture=None;writers=[];started=time.monotonic()
    def progress(percent:float,stage:str,**extra):
        set_state(video_id,dict(status='processing',progress=percent,stage=stage,**extra))
    try:
        from ultralytics import YOLO
        progress(1,'Awakening the road brain · loading perception models')
        device=select_device()
        local=ROOT/'models'/CONFIG['vehicle_model']
        weights=os.getenv('VEHICLE_MODEL') or (str(local) if local.is_file() else CONFIG['vehicle_model'])
        model=YOLO(weights)
        capabilities={'vehicles':'YOLO26 + ByteTrack','road':None,'objects':None,'lanes':'experimental painted-line geometry','flow':'Farneback optical flow','reasoning':'deterministic temporal evidence','gaps':[]}
        segmenter=detector=None
        try:
            segmenter=RoadSegmenter(ROOT/OMNI['segmentation_model'],device)
            capabilities['road']='SegFormer Cityscapes semantic segmentation'
        except Exception as exc:
            LOG.warning('road_model_unavailable',exc_info=True);capabilities['gaps'].append('Automatic road segmentation unavailable: '+str(exc))
        try:
            custom=os.getenv('CUSTOM_HAZARD_MODEL') or OMNI.get('custom_hazard_model')
            detector=EvidenceDetector(ROOT/OMNI['open_vocabulary_model'],Path(custom) if custom else None)
            capabilities['objects']=detector.model_name
            capabilities['objectMethod']='trained custom model' if custom else 'experimental open-vocabulary model'
        except Exception as exc:
            LOG.warning('object_model_unavailable',exc_info=True);capabilities['gaps'].append('Construction/hazard model unavailable: '+str(exc))
        LOG.info('analysis_started',extra={'video_id':video_id,'device':device})
        capture=cv2.VideoCapture(str(ROOT/'videos/uploads'/info['storedName']))
        fps,width,height=info['fps'],info['width'],info['height']
        mode=CONFIG['modes'][options.get('mode','BALANCED')];stride=mode['stride']
        for filename in ['raw-ai.mp4','raw-minimal.mp4']:
            writer=cv2.VideoWriter(str(out/filename),cv2.VideoWriter_fourcc(*'mp4v'),fps,(width,height))
            writers.append(writer)
            if not writer.isOpened():raise RuntimeError('Video encoder could not be opened')
        tracker=Tracks();smoother=TrafficSmoother(CONFIG['smoothing_seconds'],CONFIG['event_persistence_seconds'])
        flow_engine=OpticalFlow();geometry=LaneGeometry();brain=RoadBrain(OMNI,capabilities)
        manual=options.get('roi');manual_mask=None
        if manual:
            manual_mask=np.zeros((height,width),np.uint8)
            cv2.fillPoly(manual_mask,[np.asarray([[x*width,y*height] for x,y in manual],np.int32)],1)
        frames=0;sampled=[];metric_count=0
        totals=dict(trafficScore=0.,roadOccupancy=0.,averageMotion=0.)
        peaks=dict(trafficScore=0.,roadOccupancy=0.,vehicleCount=0)
        last_publish=last_region=last_evidence=-10.;current=[];people=[];objects=[];lanes=[];latest={};intelligence={}
        road={'mask':np.ones((height,width),np.uint8),'confidence':None,'coverage':1.,'reliable':False,'method':'full-frame fallback; no road claim'}
        with (out/'frames.jsonl').open('w') as log:
            while True:
                ok,frame=capture.read()
                if not ok:break
                timestamp=frames/fps
                if frames%stride==0:
                    if manual_mask is not None:
                        road={'mask':manual_mask,'confidence':None,'coverage':float(manual_mask.mean()),'reliable':True,'method':'expert ROI override'}
                    elif segmenter and timestamp-last_region>=OMNI['road_refresh_seconds']:
                        road=segmenter.predict(frame,mode['segmentation_size']);last_region=timestamp
                        if not road['reliable']:
                            # Keep uncertain predictions for review, without claiming scene clearance.
                            if road['mask'].sum()==0:road['mask']=np.ones((height,width),np.uint8);road['method']+='; full-frame fallback'
                    results=model.track(frame,persist=True,tracker=CONFIG['tracker'],classes=[0,1,2,3,5,7],conf=CONFIG['confidence'],iou=CONFIG['iou'],imgsz=mode['imgsz'],device=device,verbose=False)[0]
                    current=[];people=[]
                    if results.boxes is not None and results.boxes.id is not None:
                        for box,cls,conf,tid in zip(results.boxes.xyxy.cpu().tolist(),results.boxes.cls.cpu().tolist(),results.boxes.conf.cpu().tolist(),results.boxes.id.cpu().tolist()):
                            center=((box[0]+box[2])/2,(box[1]+box[3])/2);contact=(center[0],box[3]-1)
                            if point_in_mask(center,road['mask']) or point_in_mask(contact,road['mask']):
                                track=tracker.update(int(tid),model.names[int(cls)],center,timestamp,float(conf),box,CONFIG['stationary_px_sec'])
                                (people if track['type']=='person' else current).append(track)
                    object_sample=None
                    if detector and timestamp-last_evidence>=mode['evidence_seconds']:
                        objects=detector.predict(frame,mode['imgsz'],OMNI['hazard_confidence'],device);last_evidence=timestamp;object_sample=objects
                    occupied=mask_occupancy([track['box'] for track in current],road['mask'])
                    observed=[track for track in current if len(track['history'])>=2]
                    motion=float(np.mean([track['motionPxSec'] for track in observed])) if observed else 0.
                    stopped=sum(track['stationarySeconds']>=CONFIG['stationary_seconds'] for track in current)
                    raw_score=traffic(len(current),occupied,stopped/max(1,len(current)),motion,CONFIG)
                    score,state=smoother.update(raw_score,timestamp,CONFIG['traffic_thresholds'])
                    latest=dict(timestampSeconds=round(timestamp,3),vehicleCount=len(current),roadOccupancy=occupied,averageMotion=motion,stoppedVehicles=stopped,stoppedRatio=stopped/max(1,len(current)),trafficScore=score,trafficLevel=state)
                    flow=flow_engine.update(frame,road['mask'],timestamp)
                    if timestamp-last_region<stride/fps+.01 or not lanes:lanes=geometry.update(frame,road['mask'],timestamp)
                    intelligence=brain.update(timestamp,latest,current,people,object_sample,road,flow,lanes)
                    metric_count+=1
                    for key in totals:totals[key]+=latest[key]
                    for key in peaks:peaks[key]=max(peaks[key],latest[key])
                    log.write(json.dumps({**latest,'tracks':[{k:v for k,v in t.items() if k!='history'} for t in current+people],
                                          'objects':object_sample,'condition':intelligence['condition'],'roadHealthScore':intelligence['roadHealthScore'],'emergencyAccessScore':intelligence['emergencyAccessScore']})+'\n')
                    if not sampled or timestamp-sampled[-1]['timestampSeconds']>=1:
                        sampled.append({**latest,'roadHealthScore':intelligence['roadHealthScore'],'emergencyAccessScore':intelligence['emergencyAccessScore'],'constructionScore':intelligence['constructionScore']})
                for writer,full in zip(writers,[True,False]):writer.write(draw(frame,current,people,objects,road,lanes,latest,intelligence,full))
                frames+=1
                if time.monotonic()-last_publish>.5:
                    progress(min(94,3+90*frames/max(1,info['frameCount'])),'Watching road geometry, objects, motion and temporal events',latest={**latest,'intelligence':intelligence})
                    last_publish=time.monotonic()
            if frames==0:raise RuntimeError('Video contains no decodable frames')
        for writer in writers:writer.release()
        writers=[];capture.release();capture=None
        progress(96,'Rendering the unified intelligence result and video views')
        import imageio_ffmpeg
        encoder=shutil.which('ffmpeg') or imageio_ffmpeg.get_ffmpeg_exe()
        for raw,target in [('raw-ai.mp4','annotated.mp4'),('raw-minimal.mp4','minimal.mp4')]:
            subprocess.run([encoder,'-y','-i',str(out/raw),'-an','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out/target)],check=True,capture_output=True)
            (out/raw).unlink()
        unique={key:value for key,value in tracker.unique.items() if value!='person'}
        summary=dict(video=info['filename'],durationSeconds=frames/fps,totalUniqueVehicles=len(unique),vehicleBreakdown=dict(Counter(unique.values())),
                     averageTrafficScore=totals['trafficScore']/metric_count,peakTrafficScore=peaks['trafficScore'],peakVehicleCount=int(peaks['vehicleCount']),
                     averageOccupancy=totals['roadOccupancy']/metric_count,peakOccupancy=peaks['roadOccupancy'],averageMotion=totals['averageMotion']/metric_count,
                     finalTrafficLevel=latest['trafficLevel'],analysisSeconds=time.monotonic()-started,model=Path(weights).name,tracker=CONFIG['tracker'],mode=options.get('mode','BALANCED'),
                     constructionDetected=intelligence['constructionDetected'],accidentSuspected=intelligence['incidentSuspected'],emergencyRoadScore=None,intelligence=intelligence,
                     limitations=intelligence['limitations']+['Unique IDs can include tracker identity switches and re-entry.'])
        summary=AnalysisSummary.model_validate(summary).model_dump()
        (out/'summary.json').write_text(json.dumps(summary,indent=2));(out/'timeline.json').write_text(json.dumps(sampled))
        (out/'events.jsonl').write_text(''.join(json.dumps({**event,'cameraId':video_id})+'\n' for event in brain.events))
        set_state(video_id,dict(status='complete',progress=100,stage='OmniVision analysis complete',latest={**latest,'intelligence':intelligence}))
        LOG.info('analysis_complete',extra={'video_id':video_id})
    except Exception as exc:
        LOG.exception('analysis_failed');set_state(video_id,dict(status='failed',progress=0,stage='Analysis failed',error=str(exc)))
    finally:
        if capture:capture.release()
        for writer in writers:writer.release()
