"""Incremental perception: expensive corrections, optical-flow propagation, one road brain."""
import os
import time
from pathlib import Path
import cv2
import numpy as np
from ai.engine import Tracks, TrafficSmoother, traffic, inside
from ai.perception import RoadSegmenter, EvidenceDetector, SceneVerifier, OpticalFlow, LaneGeometry, mask_occupancy, point_in_mask
from ai.brain import RoadBrain
from backend.processor import ROOT, CONFIG, OMNI


def live_device():
    import torch
    requested=os.getenv('INFERENCE_DEVICE')
    if requested:return 'cuda:'+requested if requested.isdigit() else requested
    if torch.cuda.is_available():return 'cuda:0'
    if torch.backends.mps.is_available():return 'mps'
    return 'cpu'


class ModelBundle:
    def __init__(self):
        from ultralytics import YOLO
        self.device=live_device()
        weights=os.getenv('VEHICLE_MODEL') or str(ROOT/'models'/CONFIG['vehicle_model'])
        self.vehicle=YOLO(weights)
        self.segmenter=self.objects=self.scene_verifier=None
        self.coverage={'vehicles':'YOLO26 + local motion/appearance association','road':None,'objects':None,
            'lanes':'experimental painted-line geometry','flow':'Farneback + sparse Lucas-Kanade',
            'reasoning':'deterministic temporal evidence','gaps':[]}
        try:
            self.segmenter=RoadSegmenter(ROOT/OMNI['segmentation_model'],self.device)
            self.coverage['road']='SegFormer Cityscapes semantic segmentation'
        except Exception as exc:self.coverage['gaps'].append('Road segmentation unavailable: '+str(exc))
        try:
            custom=os.getenv('CUSTOM_HAZARD_MODEL') or OMNI.get('custom_hazard_model')
            self.objects=EvidenceDetector(ROOT/OMNI['open_vocabulary_model'],Path(custom) if custom else None)
            self.coverage.update(objects=self.objects.model_name,objectMethod='trained custom model' if custom else 'experimental open-vocabulary model')
        except Exception as exc:self.coverage['gaps'].append('Object evidence unavailable: '+str(exc))
        try:
            self.scene_verifier=SceneVerifier(ROOT/'models/clip/ViT-B-32.pt',self.device)
            self.coverage['scene']='CLIP contrastive scene verification'
        except Exception as exc:self.coverage['gaps'].append('Scene verification unavailable: '+str(exc))
        # Warm up before the source clock starts. Avoid first-frame inference/model download surprises.
        sample=np.zeros((384,640,3),np.uint8)
        self.vehicle.predict(sample,imgsz=416,device=self.device,verbose=False)
        if self.segmenter:self.segmenter.predict(sample,384)
        if self.objects:self.objects.predict(sample,416,OMNI['hazard_confidence'],self.device)
        if self.scene_verifier:self.scene_verifier.predict(sample)


class MotionTracker:
    """Local tracklet association with velocity, histogram appearance and sparse optical flow.

    Appearance is a histogram, not a learned ReID embedding. IDs are segment-local.
    """
    def __init__(self,segment):
        self.segment=segment;self.next_id=1;self.items={};self.previous=None;self.time=None

    @staticmethod
    def appearance(frame,box):
        h,w=frame.shape[:2];x1,y1,x2,y2=map(int,box)
        crop=frame[max(0,y1):min(h,y2),max(0,x1):min(w,x2)]
        if crop.size==0:return np.zeros(32,np.float32)
        hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
        hist=cv2.calcHist([hsv],[0,1],None,[8,4],[0,180,0,256]).reshape(-1)
        return hist/max(1,float(hist.sum()))

    def update(self,frame,timestamp,detections=None):
        gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY);dt=timestamp-self.time if self.time is not None else 0
        h,w=gray.shape
        for item in self.items.values():
            old=np.asarray(item['box'],float);shift=np.asarray(item['velocity'])*max(0,dt)
            if self.previous is not None and 0<dt<.5:
                x1,y1,x2,y2=old
                points=np.asarray([[[x,y]] for x in np.linspace(x1,x2,4)[1:-1] for y in np.linspace(y1,y2,4)[1:-1]],np.float32)
                moved,status,_=cv2.calcOpticalFlowPyrLK(self.previous,gray,points,None,winSize=(21,21),maxLevel=3)
                if moved is not None and status is not None and status.sum()>=2:
                    good=status.ravel().astype(bool);delta=(moved-points).reshape(-1,2)[good]
                    measured=np.median(delta,axis=0)
                    if np.linalg.norm(measured)<max(w,h)*.2:shift=measured
            item['box']=(old+np.tile(shift,2)).tolist()
            item['velocity']=(shift/dt).tolist() if dt>0 else [0.,0.]
        if detections is not None:
            candidates=[]
            for i,det in enumerate(detections):
                hist=self.appearance(frame,det['box']);det['_hist']=hist
                a=np.asarray(det['box']);ac=(a[:2]+a[2:])/2
                for tid,item in self.items.items():
                    if item['type']!=det['type']:continue
                    b=np.asarray(item['box']);bc=(b[:2]+b[2:])/2
                    distance=float(np.linalg.norm(ac-bc));scale=max(35,float(np.linalg.norm(b[2:]-b[:2])))
                    appearance=float(np.minimum(hist,item['appearance']).sum())
                    if distance<scale*1.25 and appearance>.18:
                        candidates.append((distance/scale+(1-appearance)*.4,i,tid))
            assigned=set();used=set()
            for _,i,tid in sorted(candidates):
                if i in assigned or tid in used:continue
                det=detections[i];item=self.items[tid]
                item.update(box=det['box'],confidence=det['confidence'],lastDetection=timestamp,appearance=det['_hist'])
                assigned.add(i);used.add(tid)
            for i,det in enumerate(detections):
                if i in assigned:continue
                tid=self.next_id;self.next_id+=1
                self.items[tid]={'trackId':tid,'displayId':f'S{self.segment:02}-VEH-{tid:04}',
                    'type':det['type'],'box':det['box'],'confidence':det['confidence'],'lastDetection':timestamp,
                    'appearance':det['_hist'],'velocity':[0.,0.]}
        self.items={tid:item for tid,item in self.items.items() if timestamp-item['lastDetection']<.8
            and item['box'][2]>0 and item['box'][0]<w and item['box'][3]>0 and item['box'][1]<h}
        self.previous=gray;self.time=timestamp
        return list(self.items.values())


class LivePipeline:
    def __init__(self,models,mode='SMART',segment=1):
        self.models=models;self.mode=mode;self.segment=segment
        self.interval={'FAST':3,'SMART':2,'MAX':1}[mode]
        self.tracker=MotionTracker(segment);self.tracks=Tracks();self.smoother=TrafficSmoother(2,1)
        self.flow=OpticalFlow();self.geometry=LaneGeometry();self.brain=RoadBrain(OMNI,models.coverage)
        self.step=0;self.last_detection=-10.;self.last_road=-10.;self.last_objects=-10.;self.last_lanes=-10.
        self.road=None;self.objects=[];self.lanes=[];self.last_intelligence=None;self.lane_memory={};self.last_metrics=None

    def analyze(self,frame,timestamp):
        h,w=frame.shape[:2]
        if self.road is None:self.road={'mask':np.ones((h,w),np.uint8),'confidence':None,'coverage':1.,'reliable':False,'method':'uncertain full-frame fallback'}
        road=self.road
        adaptive=bool(self.last_intelligence and (self.last_intelligence['anomalies'] or self.last_intelligence['incidentSuspected']))
        detect=self.step%(1 if adaptive else self.interval)==0 or timestamp-self.last_detection>=.3
        objects_sample=None
        if self.models.segmenter and timestamp-self.last_road>=(1 if adaptive else 2):
            self.road=self.models.segmenter.predict(frame,384);road=self.road;self.last_road=timestamp
            if not road['mask'].any():road['mask']=np.ones((h,w),np.uint8);road['method']+='; uncertain full-frame fallback'
        detections=None
        if detect:
            result=self.models.vehicle.predict(frame,classes=[0,1,2,3,5,7],imgsz=416 if self.mode=='FAST' else 640,
                conf=CONFIG['confidence'],iou=CONFIG['iou'],device=self.models.device,verbose=False)[0]
            detections=[{'box':list(map(float,b)),'type':self.models.vehicle.names[int(c)],'confidence':float(p)}
                for b,c,p in zip(result.boxes.xyxy.cpu().tolist(),result.boxes.cls.cpu().tolist(),result.boxes.conf.cpu().tolist())]
            self.last_detection=timestamp
        tracked=self.tracker.update(frame,timestamp,detections);current=[];people=[]
        for item in tracked:
            b=item['box'];center=[(b[0]+b[2])/2,(b[1]+b[3])/2]
            if not(point_in_mask(center,road['mask']) or point_in_mask((center[0],b[3]-1),road['mask'])):continue
            track=self.tracks.update(item['trackId'],item['type'],center,timestamp,item['confidence'],b,CONFIG['stationary_px_sec'])
            track['displayId']=item['displayId'];track['predicted']=not detect
            track['lane']=next((lane['id'] for lane in self.lanes if inside(center,lane['polygon'])),None)
            old_lane=self.lane_memory.get(item['trackId'])
            if track['lane']:
                if old_lane and old_lane!=track['lane']:
                    self.brain.event('LANE_CHANGE',timestamp,'Vehicle changed estimated lane',{'trackId':item['displayId'],'fromLane':old_lane,'toLane':track['lane'],'experimental':True},'NOTICE')
                self.lane_memory[item['trackId']]=track['lane']
            acceleration=track['accelerationPxSec2'];speed=track['motionPxSec']
            track['state']='STOPPED' if track['stationarySeconds']>=3 else 'DECELERATING' if acceleration<-30 else 'ACCELERATING' if acceleration>30 else 'SLOWING' if speed<5 else 'NORMAL'
            (people if item['type']=='person' else current).append(track)
        if self.models.objects and timestamp-self.last_objects>=.7:
            self.objects=self.models.objects.predict(frame,640,OMNI['hazard_confidence'],self.models.device)
            self.last_objects=timestamp;objects_sample=self.objects
            if getattr(self.models,'scene_verifier',None):
                objects_sample=self.objects+self.models.scene_verifier.predict(frame)
        occupied=mask_occupancy([t['box'] for t in current],road['mask'])
        observed=[t for t in current if len(t['history'])>1]
        motion=float(np.mean([t['motionPxSec'] for t in observed])) if observed else 0.
        stopped=sum(t['stationarySeconds']>=3 for t in current)
        score,state=self.smoother.update(traffic(len(current),occupied,stopped/max(1,len(current)),motion,CONFIG),timestamp,CONFIG['traffic_thresholds'])
        metrics={'timestampSeconds':round(timestamp,3),'vehicleCount':len(current),'roadOccupancy':occupied,'averageMotion':motion,
            'stoppedVehicles':stopped,'stoppedRatio':stopped/max(1,len(current)),'trafficScore':score,'trafficLevel':state}
        flow=self.flow.update(frame,road['mask'],timestamp)
        if timestamp-self.last_lanes>=.4:self.lanes=self.geometry.update(frame,road['mask'],timestamp);self.last_lanes=timestamp
        intelligence=self.brain.update(timestamp,metrics,current,people,objects_sample,road,flow,self.lanes)
        self.last_intelligence=intelligence;self.last_metrics=metrics;self.step+=1
        self.tracks.items={key:value for key,value in self.tracks.items.items() if timestamp-value['lastSeen']<5}
        contours,_=cv2.findContours(road['mask'],cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        polygons=[cv2.approxPolyDP(c,3,True).reshape(-1,2).tolist() for c in contours if cv2.contourArea(c)>w*h*.005]
        return {'metrics':metrics,'intelligence':intelligence,'tracks':current+people,'objects':self.objects,
            'roadPolygons':polygons,'lanes':intelligence['lanes'],'detectionFrame':detect,'adaptiveCompute':adaptive}
